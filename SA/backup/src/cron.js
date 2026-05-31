/**
 * Scheduler for periodic MongoDB backups (SCRUM-44).
 *
 * Runs as PID 1 inside the backup container, ticking on `CRON_SCHEDULE`
 * (default `0 2 * * *`, daily 02:00 UTC — matches the SA terminski plan).
 *
 * Why not system cron: a `crond` child does not inherit the container's
 * env, so MONGODB_URI etc. silently vanish from the backup job. Doing
 * the scheduling in-process avoids that, and a single failed tick can't
 * take down the scheduler — the tick handler swallows errors and logs
 * them so the next tick still fires.
 */

const cron = require('node-cron');
const { runBackup } = require('./backup');

const DEFAULT_SCHEDULE = '0 2 * * *';
const DEFAULT_TIMEZONE = 'UTC';

/**
 * Execute one backup attempt. Errors are caught and logged so the
 * scheduler keeps ticking — a failed tick never throws to node-cron.
 *
 * @param {object} deps
 * @param {Function} deps.runBackup
 * @param {object} deps.logger
 * @param {() => Date} [deps.now]
 * @returns {Promise<void>}
 */
async function tick({ runBackup: runBackupFn, logger, now = () => new Date() }) {
  const at = now().toISOString();
  try {
    const result = await runBackupFn();
    logger.log(
      JSON.stringify({
        level: 'info',
        event: 'cron.tick.success',
        at,
        archivePath: result.archivePath,
        sizeBytes: result.sizeBytes,
        deletedCount: result.deleted.length,
      })
    );
  } catch (err) {
    logger.error(
      JSON.stringify({
        level: 'error',
        event: 'cron.tick.failure',
        at,
        message: err.message,
      })
    );
  }
}

/**
 * Start the scheduler. Returns the underlying ScheduledTask so the
 * caller (or tests) can `.stop()` it.
 *
 * @param {object} [opts]
 * @param {string} [opts.schedule]   cron expression
 * @param {string} [opts.timezone]   default UTC
 * @param {Function} [opts.runBackupFn]
 * @param {object} [opts.cronLib]    node-cron-shaped { validate, schedule }
 * @param {object} [opts.logger]
 * @returns {{ stop: Function }}
 */
function start({
  schedule = process.env.CRON_SCHEDULE || DEFAULT_SCHEDULE,
  timezone = DEFAULT_TIMEZONE,
  runBackupFn = runBackup,
  cronLib = cron,
  logger = console,
} = {}) {
  if (!cronLib.validate(schedule)) {
    throw new Error(`Invalid CRON_SCHEDULE: "${schedule}"`);
  }

  logger.log(
    JSON.stringify({
      level: 'info',
      event: 'cron.start',
      schedule,
      timezone,
    })
  );

  return cronLib.schedule(
    schedule,
    () => tick({ runBackup: runBackupFn, logger }),
    { timezone }
  );
}

if (require.main === module) {
  try {
    start();
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', event: 'cron.start.failed', message: err.message })
    );
    process.exit(1);
  }
}

module.exports = { start, tick, DEFAULT_SCHEDULE, DEFAULT_TIMEZONE };
