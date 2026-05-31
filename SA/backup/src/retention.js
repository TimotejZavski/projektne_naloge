/**
 * Retention policy for MongoDB backups (SCRUM-44).
 *
 * Pure logic — no I/O. Given a list of filenames and a `keep` count,
 * returns the subset that should be deleted to enforce the policy.
 *
 * Backup filename convention (lexicographically sortable, UTC):
 *   mongodb-YYYY-MM-DDTHH-MM-SS.archive.gz
 *
 * The archive format is `mongodump --archive --gzip` — a single compressed
 * file rather than a directory dump, which is the recommended modern
 * approach (smaller, atomic, faster restore via `mongorestore --archive`).
 */

const BACKUP_FILE_REGEX =
  /^mongodb-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\.archive\.gz$/;

/**
 * Whether a filename matches the backup naming convention.
 * @param {string} filename
 * @returns {boolean}
 */
function isBackupFile(filename) {
  return typeof filename === 'string' && BACKUP_FILE_REGEX.test(filename);
}

/**
 * Parse the UTC timestamp embedded in a backup filename.
 * @param {string} filename
 * @returns {Date | null} Date in UTC, or null if the name does not match.
 */
function parseBackupDate(filename) {
  if (typeof filename !== 'string') return null;
  const match = filename.match(BACKUP_FILE_REGEX);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

/**
 * Pick which backup filenames should be deleted to leave exactly `keep`
 * most-recent files. Non-backup filenames in the input are ignored
 * (never returned for deletion).
 *
 * @param {string[]} filenames All filenames present in the backup directory.
 * @param {{ keep: number }} options Number of most-recent backups to retain.
 * @returns {string[]} Filenames safe to delete, oldest first.
 * @throws {TypeError} If `keep` is not a non-negative integer.
 */
function selectForDeletion(filenames, { keep } = {}) {
  if (!Number.isInteger(keep) || keep < 0) {
    throw new TypeError('keep must be a non-negative integer');
  }
  if (!Array.isArray(filenames)) {
    throw new TypeError('filenames must be an array');
  }

  const backups = filenames
    .filter(isBackupFile)
    .map((name) => ({ name, date: parseBackupDate(name) }))
    // Newest first; ties broken by name for deterministic ordering.
    .sort((a, b) => {
      const diff = b.date.getTime() - a.date.getTime();
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

  // Oldest-first when returned — caller can log/delete in chronological order.
  return backups
    .slice(keep)
    .reverse()
    .map((entry) => entry.name);
}

/**
 * Build a backup filename for a given moment.
 * @param {Date} date
 * @returns {string}
 */
function buildBackupFilename(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('date must be a valid Date');
  }
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `mongodb-${y}-${mo}-${d}T${h}-${mi}-${s}.archive.gz`;
}

module.exports = {
  BACKUP_FILE_REGEX,
  isBackupFile,
  parseBackupDate,
  selectForDeletion,
  buildBackupFilename,
};
