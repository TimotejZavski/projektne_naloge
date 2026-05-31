/**
 * MongoDB backup runner (SCRUM-44).
 *
 * Streams a single `mongodump --archive --gzip` to a dated file, verifies
 * it landed non-empty, then prunes older backups per the retention policy.
 *
 * Dependency injection (spawn, fsp, now, logger, env) keeps the runner
 * unit-testable without touching a real Mongo, fs, or system clock.
 *
 * Exit contract:
 *   - Throws if config is missing, mongodump fails, or output is empty.
 *   - Pruning runs ONLY after a verified-good archive — a failed backup
 *     must never delete the previous good one.
 */

const path = require('path');
const childProcess = require('child_process');
const { promises: realFsp } = require('fs');

const { selectForDeletion, buildBackupFilename } = require('./retention');

const DEFAULT_KEEP = 7;

/**
 * Read and validate config from an env-like object.
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ mongoUri: string, backupDir: string, keep: number, mongodumpBin: string }}
 */
function readConfig(env) {
  const mongoUri = env.MONGODB_URI;
  if (!mongoUri || typeof mongoUri !== 'string') {
    throw new Error('MONGODB_URI is required');
  }

  const backupDir = env.BACKUP_DIR;
  if (!backupDir || typeof backupDir !== 'string') {
    throw new Error('BACKUP_DIR is required');
  }

  const keepRaw = env.BACKUP_KEEP;
  let keep = DEFAULT_KEEP;
  if (keepRaw !== undefined && keepRaw !== '') {
    const parsed = Number(keepRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`BACKUP_KEEP must be a non-negative integer (got "${keepRaw}")`);
    }
    keep = parsed;
  }

  const mongodumpBin = env.MONGODUMP_BIN || 'mongodump';

  return { mongoUri, backupDir, keep, mongodumpBin };
}

/**
 * Run mongodump as a child process and resolve when it exits.
 *
 * URI is passed via argv (not shell-interpolated) to avoid injection
 * and to keep secrets out of `ps`-visible command lines as much as
 * possible. (mongodump itself is what's visible; the URI is one of
 * its args — same as `mongorestore`.)
 *
 * @param {object} args
 * @param {string} args.mongoUri
 * @param {string} args.archivePath
 * @param {string} args.mongodumpBin
 * @param {Function} args.spawn  child_process.spawn-shaped
 * @param {object} args.logger
 * @returns {Promise<void>}
 */
function runMongodump({ mongoUri, archivePath, mongodumpBin, spawn, logger }) {
  return new Promise((resolve, reject) => {
    const args = [`--uri=${mongoUri}`, `--archive=${archivePath}`, '--gzip'];

    let proc;
    try {
      proc = spawn(mongodumpBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      reject(new Error(`Failed to spawn ${mongodumpBin}: ${err.message}`));
      return;
    }

    const stderrChunks = [];
    if (proc.stderr) {
      proc.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    }
    if (proc.stdout) {
      // mongodump writes progress to stderr; stdout is normally empty when --archive
      // is a file path. Drain anyway to prevent backpressure.
      proc.stdout.on('data', () => {});
    }

    proc.on('error', (err) => {
      reject(new Error(`mongodump process error: ${err.message}`));
    });

    proc.on('close', (code, signal) => {
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code === 0) {
        if (stderr.trim()) {
          logger.log(JSON.stringify({ level: 'info', event: 'mongodump.stderr', stderr: stderr.trim() }));
        }
        resolve();
      } else {
        reject(
          new Error(
            `mongodump exited with code ${code}${signal ? ` (signal ${signal})` : ''}: ${stderr.trim() || '<no stderr>'}`
          )
        );
      }
    });
  });
}

/**
 * Prune old backups per retention policy.
 *
 * @param {object} args
 * @param {string} args.backupDir
 * @param {number} args.keep
 * @param {object} args.fsp  fs.promises-shaped
 * @param {object} args.logger
 * @returns {Promise<string[]>} Filenames deleted.
 */
async function pruneOldBackups({ backupDir, keep, fsp, logger }) {
  const entries = await fsp.readdir(backupDir);
  const toDelete = selectForDeletion(entries, { keep });
  for (const name of toDelete) {
    const full = path.join(backupDir, name);
    await fsp.unlink(full);
    logger.log(JSON.stringify({ level: 'info', event: 'backup.pruned', file: name }));
  }
  return toDelete;
}

/**
 * Orchestrate one backup cycle.
 *
 * @param {object} [deps]
 * @param {NodeJS.ProcessEnv} [deps.env]
 * @param {Console} [deps.logger]
 * @param {Function} [deps.spawn]
 * @param {object} [deps.fsp]
 * @param {() => Date} [deps.now]
 * @returns {Promise<{ archivePath: string, deleted: string[], sizeBytes: number }>}
 */
async function runBackup({
  env = process.env,
  logger = console,
  spawn = childProcess.spawn,
  fsp = realFsp,
  now = () => new Date(),
} = {}) {
  const config = readConfig(env);
  const filename = buildBackupFilename(now());
  const archivePath = path.join(config.backupDir, filename);

  logger.log(
    JSON.stringify({
      level: 'info',
      event: 'backup.start',
      archivePath,
      keep: config.keep,
    })
  );

  // Make sure the target directory exists. Creating it here (instead of in
  // the Dockerfile) makes the script resilient to wiped bind mounts.
  await fsp.mkdir(config.backupDir, { recursive: true });

  const startMs = Date.now();
  await runMongodump({
    mongoUri: config.mongoUri,
    archivePath,
    mongodumpBin: config.mongodumpBin,
    spawn,
    logger,
  });
  const durationMs = Date.now() - startMs;

  // Belt-and-braces: mongodump may exit 0 but leave a zero-byte file if a
  // network connection died mid-stream on certain versions. Treat empty
  // archive as failure and DO NOT prune older backups.
  const stat = await fsp.stat(archivePath);
  if (!stat.size || stat.size === 0) {
    // Clean up the empty file so we don't leave junk behind.
    try {
      await fsp.unlink(archivePath);
    } catch (_) {
      /* best-effort */
    }
    throw new Error(`mongodump produced empty archive at ${archivePath}`);
  }

  logger.log(
    JSON.stringify({
      level: 'info',
      event: 'backup.complete',
      archivePath,
      sizeBytes: stat.size,
      durationMs,
    })
  );

  const deleted = await pruneOldBackups({
    backupDir: config.backupDir,
    keep: config.keep,
    fsp,
    logger,
  });

  return { archivePath, deleted, sizeBytes: stat.size };
}

// CLI entrypoint — only when run directly, not when required from tests.
if (require.main === module) {
  runBackup().then(
    (result) => {
      console.log(
        JSON.stringify({ level: 'info', event: 'backup.done', ...result })
      );
      process.exit(0);
    },
    (err) => {
      console.error(
        JSON.stringify({ level: 'error', event: 'backup.failed', message: err.message })
      );
      process.exit(1);
    }
  );
}

module.exports = {
  runBackup,
  readConfig,
  runMongodump,
  pruneOldBackups,
  DEFAULT_KEEP,
};
