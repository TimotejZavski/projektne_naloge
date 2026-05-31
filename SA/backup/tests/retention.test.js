/**
 * Tests for retention policy logic (SCRUM-44).
 */

const {
  isBackupFile,
  parseBackupDate,
  selectForDeletion,
  buildBackupFilename,
} = require('../src/retention');

describe('isBackupFile', () => {
  test.each([
    ['mongodb-2026-05-26T02-00-00.archive.gz', true],
    ['mongodb-2026-12-31T23-59-59.archive.gz', true],
    ['mongodb-2026-05-26T02-00-00.archive', false], // missing .gz
    ['mongodb-2026-05-26.archive.gz', false], // missing time
    ['backup-2026-05-26T02-00-00.archive.gz', false], // wrong prefix
    ['mongodb-2026-5-26T2-0-0.archive.gz', false], // not zero-padded
    ['', false],
    ['.gitkeep', false],
    ['random.txt', false],
  ])('isBackupFile(%j) === %s', (name, expected) => {
    expect(isBackupFile(name)).toBe(expected);
  });

  test('rejects non-string inputs', () => {
    expect(isBackupFile(null)).toBe(false);
    expect(isBackupFile(undefined)).toBe(false);
    expect(isBackupFile(42)).toBe(false);
  });
});

describe('parseBackupDate', () => {
  test('parses a valid name into a UTC Date', () => {
    const d = parseBackupDate('mongodb-2026-05-26T02-00-00.archive.gz');
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe('2026-05-26T02:00:00.000Z');
  });

  test('returns null for non-matching name', () => {
    expect(parseBackupDate('hello.txt')).toBeNull();
  });

  test('returns null for non-string input', () => {
    expect(parseBackupDate(null)).toBeNull();
    expect(parseBackupDate(123)).toBeNull();
  });
});

describe('buildBackupFilename', () => {
  test('formats a UTC date as a zero-padded archive name', () => {
    const d = new Date(Date.UTC(2026, 0, 3, 7, 5, 9));
    expect(buildBackupFilename(d)).toBe(
      'mongodb-2026-01-03T07-05-09.archive.gz'
    );
  });

  test('round-trips through parseBackupDate', () => {
    const d = new Date(Date.UTC(2026, 5, 1, 14, 30, 45));
    const name = buildBackupFilename(d);
    expect(parseBackupDate(name).toISOString()).toBe(d.toISOString());
  });

  test('throws on invalid Date', () => {
    expect(() => buildBackupFilename(new Date('not-a-date'))).toThrow(TypeError);
    expect(() => buildBackupFilename('2026-05-26')).toThrow(TypeError);
  });
});

describe('selectForDeletion', () => {
  test('returns empty when count <= keep', () => {
    const files = [
      'mongodb-2026-05-26T02-00-00.archive.gz',
      'mongodb-2026-05-25T02-00-00.archive.gz',
    ];
    expect(selectForDeletion(files, { keep: 7 })).toEqual([]);
  });

  test('returns oldest excess when count > keep', () => {
    const files = [
      'mongodb-2026-05-26T02-00-00.archive.gz',
      'mongodb-2026-05-25T02-00-00.archive.gz',
      'mongodb-2026-05-24T02-00-00.archive.gz',
      'mongodb-2026-05-23T02-00-00.archive.gz',
      'mongodb-2026-05-22T02-00-00.archive.gz',
    ];
    expect(selectForDeletion(files, { keep: 3 })).toEqual([
      'mongodb-2026-05-22T02-00-00.archive.gz',
      'mongodb-2026-05-23T02-00-00.archive.gz',
    ]);
  });

  test('ignores files that do not match the backup naming convention', () => {
    const files = [
      'mongodb-2026-05-26T02-00-00.archive.gz',
      'README.md',
      '.gitkeep',
      'mongodb-2026-05-25T02-00-00.archive.gz',
      'something-else.gz',
    ];
    expect(selectForDeletion(files, { keep: 1 })).toEqual([
      'mongodb-2026-05-25T02-00-00.archive.gz',
    ]);
  });

  test('input order does not affect output', () => {
    const files = [
      'mongodb-2026-05-22T02-00-00.archive.gz',
      'mongodb-2026-05-26T02-00-00.archive.gz',
      'mongodb-2026-05-24T02-00-00.archive.gz',
    ];
    expect(selectForDeletion(files, { keep: 1 })).toEqual([
      'mongodb-2026-05-22T02-00-00.archive.gz',
      'mongodb-2026-05-24T02-00-00.archive.gz',
    ]);
  });

  test('keep=0 deletes everything that matches', () => {
    const files = [
      'mongodb-2026-05-26T02-00-00.archive.gz',
      'mongodb-2026-05-25T02-00-00.archive.gz',
      'unrelated.txt',
    ];
    expect(selectForDeletion(files, { keep: 0 })).toEqual([
      'mongodb-2026-05-25T02-00-00.archive.gz',
      'mongodb-2026-05-26T02-00-00.archive.gz',
    ]);
  });

  test('handles empty input', () => {
    expect(selectForDeletion([], { keep: 7 })).toEqual([]);
  });

  test('throws TypeError on invalid keep', () => {
    expect(() => selectForDeletion([], { keep: -1 })).toThrow(TypeError);
    expect(() => selectForDeletion([], { keep: 1.5 })).toThrow(TypeError);
    expect(() => selectForDeletion([], { keep: '7' })).toThrow(TypeError);
    expect(() => selectForDeletion([], {})).toThrow(TypeError);
  });

  test('throws TypeError on non-array filenames', () => {
    expect(() => selectForDeletion(null, { keep: 7 })).toThrow(TypeError);
    expect(() => selectForDeletion('files', { keep: 7 })).toThrow(TypeError);
  });

  test('deterministic ordering when same-second timestamps collide', () => {
    const files = [
      'mongodb-2026-05-26T02-00-00.archive.gz',
      // Identical timestamp by accident — must still be ordered deterministically.
      'mongodb-2026-05-26T02-00-00.archive.gz',
    ];
    const result = selectForDeletion(files, { keep: 1 });
    expect(result).toHaveLength(1);
  });
});
