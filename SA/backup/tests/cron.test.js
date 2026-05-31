/**
 * Tests for the scheduler (SCRUM-44).
 *
 * The node-cron library itself is replaced with a recording fake. We
 * verify the wiring (schedule validation, log shape, tick semantics),
 * not the cron expression parser — that's node-cron's job.
 */

const { start, tick, DEFAULT_SCHEDULE, DEFAULT_TIMEZONE } = require('../src/cron');

function makeFakeCron({ validateResult = true } = {}) {
  const calls = { validate: [], schedule: [] };
  const fakeTask = { stop: jest.fn() };
  return {
    calls,
    fakeTask,
    validate(expr) {
      calls.validate.push(expr);
      return validateResult;
    },
    schedule(expr, handler, options) {
      calls.schedule.push({ expr, handler, options });
      return fakeTask;
    },
  };
}

function makeFakeLogger() {
  const entries = [];
  return {
    entries,
    log: (line) => entries.push({ kind: 'log', ...JSON.parse(line) }),
    error: (line) => entries.push({ kind: 'error', ...JSON.parse(line) }),
  };
}

// ------------ start ------------

describe('start', () => {
  test('uses default schedule and UTC timezone when env is empty', () => {
    const cronLib = makeFakeCron();
    const logger = makeFakeLogger();
    delete process.env.CRON_SCHEDULE;

    start({ cronLib, logger, runBackupFn: jest.fn() });

    expect(cronLib.calls.validate).toEqual([DEFAULT_SCHEDULE]);
    expect(cronLib.calls.schedule).toHaveLength(1);
    expect(cronLib.calls.schedule[0].expr).toBe(DEFAULT_SCHEDULE);
    expect(cronLib.calls.schedule[0].options.timezone).toBe(DEFAULT_TIMEZONE);
  });

  test('honours explicit schedule and timezone over env', () => {
    const cronLib = makeFakeCron();
    start({
      cronLib,
      logger: makeFakeLogger(),
      runBackupFn: jest.fn(),
      schedule: '*/15 * * * *',
      timezone: 'Europe/Ljubljana',
    });
    expect(cronLib.calls.schedule[0].expr).toBe('*/15 * * * *');
    expect(cronLib.calls.schedule[0].options.timezone).toBe('Europe/Ljubljana');
  });

  test('reads CRON_SCHEDULE from env when no override passed', () => {
    process.env.CRON_SCHEDULE = '5 4 * * 1';
    try {
      const cronLib = makeFakeCron();
      start({ cronLib, logger: makeFakeLogger(), runBackupFn: jest.fn() });
      expect(cronLib.calls.schedule[0].expr).toBe('5 4 * * 1');
    } finally {
      delete process.env.CRON_SCHEDULE;
    }
  });

  test('throws on invalid schedule', () => {
    const cronLib = makeFakeCron({ validateResult: false });
    expect(() =>
      start({ cronLib, logger: makeFakeLogger(), runBackupFn: jest.fn(), schedule: 'nope' })
    ).toThrow(/Invalid CRON_SCHEDULE: "nope"/);
  });

  test('emits a single structured cron.start log line', () => {
    const cronLib = makeFakeCron();
    const logger = makeFakeLogger();
    start({ cronLib, logger, runBackupFn: jest.fn(), schedule: '0 2 * * *' });

    const startLogs = logger.entries.filter((e) => e.event === 'cron.start');
    expect(startLogs).toHaveLength(1);
    expect(startLogs[0]).toMatchObject({
      kind: 'log',
      level: 'info',
      schedule: '0 2 * * *',
      timezone: 'UTC',
    });
  });

  test('returns the underlying scheduled task for lifecycle control', () => {
    const cronLib = makeFakeCron();
    const task = start({ cronLib, logger: makeFakeLogger(), runBackupFn: jest.fn() });
    expect(task).toBe(cronLib.fakeTask);
  });
});

// ------------ tick ------------

describe('tick', () => {
  const fixedAt = new Date('2026-05-26T02:00:00.000Z');
  const now = () => fixedAt;

  test('logs success with result fields on resolve', async () => {
    const logger = makeFakeLogger();
    const runBackupFn = jest.fn().mockResolvedValue({
      archivePath: '/backups/mongodb-2026-05-26T02-00-00.archive.gz',
      sizeBytes: 12345,
      deleted: ['mongodb-2026-05-19T02-00-00.archive.gz'],
    });

    await tick({ runBackup: runBackupFn, logger, now });

    const success = logger.entries.find((e) => e.event === 'cron.tick.success');
    expect(success).toMatchObject({
      kind: 'log',
      level: 'info',
      at: fixedAt.toISOString(),
      archivePath: '/backups/mongodb-2026-05-26T02-00-00.archive.gz',
      sizeBytes: 12345,
      deletedCount: 1,
    });
  });

  test('logs failure on reject without throwing', async () => {
    const logger = makeFakeLogger();
    const runBackupFn = jest.fn().mockRejectedValue(new Error('mongodump exploded'));

    await expect(tick({ runBackup: runBackupFn, logger, now })).resolves.toBeUndefined();

    const failure = logger.entries.find((e) => e.event === 'cron.tick.failure');
    expect(failure).toMatchObject({
      kind: 'error',
      level: 'error',
      at: fixedAt.toISOString(),
      message: 'mongodump exploded',
    });
  });

  test('invokes runBackup exactly once per tick', async () => {
    const runBackupFn = jest
      .fn()
      .mockResolvedValue({ archivePath: '/x', sizeBytes: 1, deleted: [] });
    await tick({ runBackup: runBackupFn, logger: makeFakeLogger(), now });
    expect(runBackupFn).toHaveBeenCalledTimes(1);
  });
});

// ------------ wiring: start() + tick() integration ------------

describe('start → handler → tick wiring', () => {
  test('handler installed by start() drives runBackup on invocation', async () => {
    const cronLib = makeFakeCron();
    const runBackupFn = jest
      .fn()
      .mockResolvedValue({ archivePath: '/x', sizeBytes: 100, deleted: [] });

    start({ cronLib, logger: makeFakeLogger(), runBackupFn });

    // node-cron would normally invoke this on the schedule. Invoke it
    // synthetically and assert the wiring delegates to runBackup.
    await cronLib.calls.schedule[0].handler();
    expect(runBackupFn).toHaveBeenCalledTimes(1);
  });
});
