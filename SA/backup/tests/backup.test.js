/**
 * Integration tests for the backup runner (SCRUM-44).
 *
 * No real mongodump, no real fs, no real clock — all dependencies are
 * injected so the runner's contract can be asserted in isolation:
 *   - config validation
 *   - mongodump invocation (args, exit handling)
 *   - empty-archive defensive check
 *   - retention pruning only after success
 *   - structured log shape
 */

const { EventEmitter } = require('events');
const path = require('path');

const { runBackup, readConfig } = require('../src/backup');

// ------------ helpers ------------

/**
 * Build a fake child-process spawn that returns a controllable child.
 * @param {object} opts
 * @param {number} opts.exitCode
 * @param {string} [opts.stderr]
 * @param {Error}  [opts.spawnError]  Thrown synchronously from spawn()
 */
function makeFakeSpawn({ exitCode = 0, stderr = '', spawnError = null } = {}) {
  const calls = [];
  function spawn(bin, args, options) {
    calls.push({ bin, args, options });
    if (spawnError) throw spawnError;
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    // Emit stderr + close on next tick to mimic real child_process.
    setImmediate(() => {
      if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
      proc.emit('close', exitCode, null);
    });
    return proc;
  }
  spawn.calls = calls;
  return spawn;
}

/**
 * Build an in-memory fs.promises double.
 * @param {object} state
 * @param {string[]} state.initialFiles  files present in backupDir
 * @param {number}   state.bytesWritten  size returned by stat() after backup
 */
function makeFakeFsp({ initialFiles = [], bytesWritten = 1024 } = {}) {
  const files = new Set(initialFiles);
  const calls = { mkdir: [], readdir: [], stat: [], unlink: [] };
  return {
    files,
    calls,
    mkdir(dir, _opts) {
      calls.mkdir.push(dir);
      return Promise.resolve();
    },
    readdir(dir) {
      calls.readdir.push(dir);
      return Promise.resolve([...files]);
    },
    stat(p) {
      calls.stat.push(p);
      // The "freshly written" archive lives in the bytesWritten field.
      // After mongodump "writes", we pretend its file appears with that size.
      const base = path.basename(p);
      if (!files.has(base)) files.add(base);
      return Promise.resolve({ size: bytesWritten });
    },
    unlink(p) {
      calls.unlink.push(p);
      files.delete(path.basename(p));
      return Promise.resolve();
    },
  };
}

function makeFakeLogger() {
  const entries = [];
  return {
    entries,
    log: (line) => entries.push(JSON.parse(line)),
    error: (line) => entries.push(JSON.parse(line)),
  };
}

const validEnv = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/db',
  BACKUP_DIR: '/var/backups/mongo',
};

const fixedNow = () => new Date(Date.UTC(2026, 4, 26, 2, 0, 0));
const expectedFilename = 'mongodb-2026-05-26T02-00-00.archive.gz';
const expectedPath = path.join(validEnv.BACKUP_DIR, expectedFilename);

// ------------ readConfig ------------

describe('readConfig', () => {
  test('returns defaults when only required vars are set', () => {
    const cfg = readConfig(validEnv);
    expect(cfg.mongoUri).toBe(validEnv.MONGODB_URI);
    expect(cfg.backupDir).toBe(validEnv.BACKUP_DIR);
    expect(cfg.keep).toBe(7);
    expect(cfg.mongodumpBin).toBe('mongodump');
  });

  test('respects BACKUP_KEEP and MONGODUMP_BIN overrides', () => {
    const cfg = readConfig({
      ...validEnv,
      BACKUP_KEEP: '3',
      MONGODUMP_BIN: '/opt/tools/mongodump',
    });
    expect(cfg.keep).toBe(3);
    expect(cfg.mongodumpBin).toBe('/opt/tools/mongodump');
  });

  test('throws when MONGODB_URI is missing', () => {
    expect(() => readConfig({ BACKUP_DIR: '/x' })).toThrow(/MONGODB_URI/);
  });

  test('throws when BACKUP_DIR is missing', () => {
    expect(() => readConfig({ MONGODB_URI: 'mongodb://x' })).toThrow(/BACKUP_DIR/);
  });

  test('throws on invalid BACKUP_KEEP', () => {
    expect(() => readConfig({ ...validEnv, BACKUP_KEEP: '-1' })).toThrow(/BACKUP_KEEP/);
    expect(() => readConfig({ ...validEnv, BACKUP_KEEP: 'seven' })).toThrow(/BACKUP_KEEP/);
    expect(() => readConfig({ ...validEnv, BACKUP_KEEP: '1.5' })).toThrow(/BACKUP_KEEP/);
  });

  test('treats empty BACKUP_KEEP as default', () => {
    expect(readConfig({ ...validEnv, BACKUP_KEEP: '' }).keep).toBe(7);
  });
});

// ------------ runBackup happy path ------------

describe('runBackup — happy path', () => {
  test('invokes mongodump with URI, archive path, and --gzip', async () => {
    const spawn = makeFakeSpawn({ exitCode: 0 });
    const fsp = makeFakeFsp();
    const logger = makeFakeLogger();

    await runBackup({ env: validEnv, spawn, fsp, logger, now: fixedNow });

    expect(spawn.calls).toHaveLength(1);
    const { bin, args } = spawn.calls[0];
    expect(bin).toBe('mongodump');
    expect(args).toContain(`--uri=${validEnv.MONGODB_URI}`);
    expect(args).toContain(`--archive=${expectedPath}`);
    expect(args).toContain('--gzip');
  });

  test('creates the backup directory before dumping', async () => {
    const spawn = makeFakeSpawn();
    const fsp = makeFakeFsp();
    await runBackup({ env: validEnv, spawn, fsp, logger: makeFakeLogger(), now: fixedNow });
    expect(fsp.calls.mkdir).toEqual([validEnv.BACKUP_DIR]);
  });

  test('returns archive path, size, and deletions', async () => {
    const spawn = makeFakeSpawn();
    const fsp = makeFakeFsp({ bytesWritten: 4096 });
    const result = await runBackup({
      env: validEnv,
      spawn,
      fsp,
      logger: makeFakeLogger(),
      now: fixedNow,
    });
    expect(result.archivePath).toBe(expectedPath);
    expect(result.sizeBytes).toBe(4096);
    expect(result.deleted).toEqual([]);
  });

  test('emits structured start and complete log entries', async () => {
    const spawn = makeFakeSpawn();
    const fsp = makeFakeFsp();
    const logger = makeFakeLogger();
    await runBackup({ env: validEnv, spawn, fsp, logger, now: fixedNow });

    const events = logger.entries.map((e) => e.event);
    expect(events).toContain('backup.start');
    expect(events).toContain('backup.complete');

    const complete = logger.entries.find((e) => e.event === 'backup.complete');
    expect(complete.archivePath).toBe(expectedPath);
    expect(complete.sizeBytes).toBeGreaterThan(0);
    expect(complete.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ------------ retention ------------

describe('runBackup — retention', () => {
  test('prunes oldest backups beyond keep, leaving newest', async () => {
    const initial = [
      'mongodb-2026-05-20T02-00-00.archive.gz',
      'mongodb-2026-05-21T02-00-00.archive.gz',
      'mongodb-2026-05-22T02-00-00.archive.gz',
      'mongodb-2026-05-23T02-00-00.archive.gz',
      'mongodb-2026-05-24T02-00-00.archive.gz',
      'mongodb-2026-05-25T02-00-00.archive.gz',
      'README.md', // must be ignored
    ];
    const fsp = makeFakeFsp({ initialFiles: initial });
    const spawn = makeFakeSpawn();
    const result = await runBackup({
      env: { ...validEnv, BACKUP_KEEP: '3' },
      spawn,
      fsp,
      logger: makeFakeLogger(),
      now: fixedNow,
    });

    // After the new dump there are 7 archives; keep=3 → delete 4 oldest.
    expect(result.deleted).toEqual([
      'mongodb-2026-05-20T02-00-00.archive.gz',
      'mongodb-2026-05-21T02-00-00.archive.gz',
      'mongodb-2026-05-22T02-00-00.archive.gz',
      'mongodb-2026-05-23T02-00-00.archive.gz',
    ]);

    // README must still exist.
    expect(fsp.files.has('README.md')).toBe(true);
  });

  test('does not prune when under retention', async () => {
    const fsp = makeFakeFsp({
      initialFiles: ['mongodb-2026-05-25T02-00-00.archive.gz'],
    });
    const result = await runBackup({
      env: validEnv,
      spawn: makeFakeSpawn(),
      fsp,
      logger: makeFakeLogger(),
      now: fixedNow,
    });
    expect(result.deleted).toEqual([]);
  });
});

// ------------ failure modes ------------

describe('runBackup — failure modes', () => {
  test('rejects when mongodump exits non-zero', async () => {
    const spawn = makeFakeSpawn({ exitCode: 1, stderr: 'auth failed' });
    const fsp = makeFakeFsp();
    await expect(
      runBackup({ env: validEnv, spawn, fsp, logger: makeFakeLogger(), now: fixedNow })
    ).rejects.toThrow(/exited with code 1.*auth failed/);
  });

  test('does not prune when mongodump fails', async () => {
    const fsp = makeFakeFsp({
      initialFiles: [
        'mongodb-2026-05-10T02-00-00.archive.gz',
        'mongodb-2026-05-11T02-00-00.archive.gz',
        'mongodb-2026-05-12T02-00-00.archive.gz',
      ],
    });
    const spawn = makeFakeSpawn({ exitCode: 1, stderr: 'network' });
    await expect(
      runBackup({
        env: { ...validEnv, BACKUP_KEEP: '1' },
        spawn,
        fsp,
        logger: makeFakeLogger(),
        now: fixedNow,
      })
    ).rejects.toThrow();

    // All old backups must still be intact — no destructive action after failure.
    expect(fsp.calls.unlink).toEqual([]);
    expect(fsp.files.has('mongodb-2026-05-10T02-00-00.archive.gz')).toBe(true);
    expect(fsp.files.has('mongodb-2026-05-11T02-00-00.archive.gz')).toBe(true);
    expect(fsp.files.has('mongodb-2026-05-12T02-00-00.archive.gz')).toBe(true);
  });

  test('rejects and cleans up when archive is empty', async () => {
    const fsp = makeFakeFsp({ bytesWritten: 0 });
    const spawn = makeFakeSpawn({ exitCode: 0 });
    await expect(
      runBackup({ env: validEnv, spawn, fsp, logger: makeFakeLogger(), now: fixedNow })
    ).rejects.toThrow(/empty archive/);
    // Empty file should be cleaned up.
    expect(fsp.calls.unlink.some((p) => p.endsWith(expectedFilename))).toBe(true);
  });

  test('wraps spawn-time errors', async () => {
    const spawnError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const spawn = makeFakeSpawn({ spawnError });
    await expect(
      runBackup({
        env: validEnv,
        spawn,
        fsp: makeFakeFsp(),
        logger: makeFakeLogger(),
        now: fixedNow,
      })
    ).rejects.toThrow(/Failed to spawn mongodump.*ENOENT/);
  });
});
