# MongoDB Backup Service (SCRUM-44)

Daily compressed `mongodump --archive --gzip` snapshots of the Smart
Playgrounds MongoDB, with a configurable retention policy (default: keep
the last 7 days).

Matches the SA terminski requirement:

> **Varnostne kopije:** Vsak dan ob 2h zjutraj se baza MongoDB izvozi v
> .dump datoteko in shrani na zunanji disk. Hranimo 7 dnevnih kopij.

## Contents

- [How it works](#how-it-works)
- [Quick start (Atlas)](#quick-start-atlas)
- [Quick start (local dev mongo)](#quick-start-local-dev-mongo)
- [Environment variables](#environment-variables)
- [Operating the service](#operating-the-service)
- [Restore procedures](#restore-procedures)
- [Backup file format](#backup-file-format)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## How it works

A small Node.js process (`src/cron.js`) running as PID 1 inside a Docker
container schedules itself with `node-cron`. On every tick it:

1. Spawns `mongodump --uri=<URI> --archive=<path> --gzip`.
2. Verifies the resulting archive is non-empty (defends against the
   known case where `mongodump` exits 0 but writes zero bytes after a
   dropped connection).
3. Calls the retention module to compute which older backups exceed
   `BACKUP_KEEP` and `unlink`s them.

A failed dump never deletes the previous good backup — pruning runs
**only after** a verified-good archive. All log lines are single-line
JSON so they can be tailed with `docker compose logs` and parsed by any
log aggregator.

```
┌──────────────────┐    spawn        ┌────────────────┐
│  node-cron tick  │ ─────────────► │  mongodump     │ ──► /backups/mongodb-YYYY-…archive.gz
│  (0 2 * * * UTC) │                │  --archive=…   │
└────────┬─────────┘                │  --gzip        │
         │ after success            └────────────────┘
         ▼
   retention.selectForDeletion
   fs.unlink old archives
```

## Quick start (Atlas)

```bash
# 1. Set the Atlas connection string (already in your RAI .env)
export MONGODB_URI='mongodb+srv://USER:PASS@CLUSTER.example.net/dbname'

# 2. Build and run
docker compose -f SA/backup/docker-compose.yml up -d --build

# 3. Confirm the scheduler started
docker compose -f SA/backup/docker-compose.yml logs backup
# {"level":"info","event":"cron.start","schedule":"0 2 * * *","timezone":"UTC"}
```

Wait for the next 02:00 UTC tick, or trigger one manually:

```bash
docker compose -f SA/backup/docker-compose.yml run --rm backup npm run start:once
```

Browse the dumps volume:

```bash
docker run --rm -v smart_playgrounds_backup_dumps:/d alpine ls -lh /d
```

## Quick start (local dev mongo)

Bring up RAI's local stack first so the `rai-network` exists and `mongo`
is reachable by its service name:

```bash
docker compose -f RAI/server/docker-compose.yml up -d
```

Then start the backup service with the local URI and the
network-override compose file:

```bash
export MONGODB_URI='mongodb://mongo:27017/rai'

docker compose \
  -f SA/backup/docker-compose.yml \
  -f SA/backup/docker-compose.local-mongo.yml \
  up -d --build
```

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MONGODB_URI` | **yes** | — | Source DB. Atlas SRV (`mongodb+srv://…`) or plain (`mongodb://host:port/db`). |
| `BACKUP_DIR` | no | `/backups` | Where archives are written inside the container. The compose maps this to a named volume. |
| `BACKUP_KEEP` | no | `7` | Non-negative integer; how many most-recent archives to retain. `0` means delete everything older than the just-written one. |
| `CRON_SCHEDULE` | no | `0 2 * * *` | Standard 5-field cron expression. Validated at startup; invalid value crashes the scheduler with a clear message. |
| `MONGODUMP_BIN` | no | `mongodump` | Override for tests or custom installs. |
| `TZ` | no | `UTC` | Set in compose so the cron expression always means UTC, regardless of host timezone. |

## Operating the service

### Trigger an ad-hoc backup right now

```bash
docker compose -f SA/backup/docker-compose.yml run --rm backup npm run start:once
```

This runs `src/backup.js` once and exits — same code path as a
scheduled tick, just without the scheduler wrapping it.

### Tail logs

```bash
docker compose -f SA/backup/docker-compose.yml logs -f backup
```

Every successful backup looks like:

```json
{"level":"info","event":"backup.start","archivePath":"/backups/mongodb-2026-05-26T02-00-00.archive.gz","keep":7}
{"level":"info","event":"backup.complete","archivePath":"/backups/mongodb-2026-05-26T02-00-00.archive.gz","sizeBytes":482931,"durationMs":3147}
{"level":"info","event":"cron.tick.success","at":"2026-05-26T02:00:00.123Z","archivePath":"/backups/…","sizeBytes":482931,"deletedCount":0}
```

A failure looks like:

```json
{"level":"error","event":"cron.tick.failure","at":"…","message":"mongodump exited with code 1: connection() error occurred during connection handshake"}
```

The scheduler does **not** crash on a failed tick — the next scheduled
fire still runs. This is intentional: a one-off network blip should not
require a manual restart.

### Stop the service

```bash
docker compose -f SA/backup/docker-compose.yml down       # keeps dumps
docker compose -f SA/backup/docker-compose.yml down -v    # ALSO deletes the dumps volume (destructive)
```

## Restore procedures

The archive format is the single-file output of `mongodump --archive --gzip`.
Restore with `mongorestore --archive --gzip`. **All examples below run
inside the backup container** so you do not need to install MongoDB
Database Tools on the host.

### Full restore (overwrites the target DB)

> ⚠️ **Destructive.** Replaces every collection in the target DB with
> the snapshot's contents. Take a fresh backup before restoring.

```bash
# 1. List available archives:
docker run --rm -v smart_playgrounds_backup_dumps:/d alpine ls /d

# 2. Restore (replace the filename with the one you want):
docker compose -f SA/backup/docker-compose.yml run --rm \
  -e MONGODB_URI \
  backup \
  mongorestore \
    --uri="$MONGODB_URI" \
    --archive=/backups/mongodb-2026-05-26T02-00-00.archive.gz \
    --gzip
```

### Restore to a different database (recommended for verification)

Always restore into a side DB first, sanity-check the data, then swap.

```bash
docker compose -f SA/backup/docker-compose.yml run --rm \
  -e MONGODB_URI \
  backup \
  mongorestore \
    --uri="$MONGODB_URI" \
    --archive=/backups/mongodb-2026-05-26T02-00-00.archive.gz \
    --gzip \
    --nsFrom='rai.*' \
    --nsTo='rai_restore.*'
```

### Restore a single collection

If only `playgrounds` was corrupted, restore just that:

```bash
docker compose -f SA/backup/docker-compose.yml run --rm \
  -e MONGODB_URI \
  backup \
  mongorestore \
    --uri="$MONGODB_URI" \
    --archive=/backups/mongodb-2026-05-26T02-00-00.archive.gz \
    --gzip \
    --nsInclude='rai.playgrounds' \
    --drop
```

`--drop` removes the existing collection before restore so you do not
end up with a merge of old + restored documents.

### Dry run (verify the archive without writing anything)

```bash
docker compose -f SA/backup/docker-compose.yml run --rm \
  -e MONGODB_URI \
  backup \
  mongorestore \
    --uri="$MONGODB_URI" \
    --archive=/backups/mongodb-2026-05-26T02-00-00.archive.gz \
    --gzip \
    --dryRun
```

### Copying an archive off the volume

To download a backup to the host (e.g. for off-site archiving — the
"zunanji disk" the SA brief asks for):

```bash
docker run --rm \
  -v smart_playgrounds_backup_dumps:/d \
  -v "$PWD:/out" \
  alpine \
  cp /d/mongodb-2026-05-26T02-00-00.archive.gz /out/
```

## Backup file format

```
mongodb-YYYY-MM-DDTHH-MM-SS.archive.gz
              │  │  │ │  │  │
              │  │  │ │  │  └─ seconds (UTC)
              │  │  │ │  └──── minutes (UTC)
              │  │  │ └─────── hours (UTC)
              │  │  └───────── day
              │  └──────────── month
              └─────────────── year
```

- UTC, zero-padded — names sort lexicographically by date.
- Single file, compressed by `mongodump --gzip` — atomic to create and
  to ship.
- Restore is a streaming read; no temp extraction step.

## Testing

The whole pipeline has unit + integration tests that run without a real
Mongo or Docker:

```bash
cd SA/backup
npm install
npm test
```

Coverage today: **51 tests across 3 suites**.

- `tests/retention.test.js` — pure pruning logic, filename parsing,
  edge cases (`keep=0`, non-backup files preserved, input-order
  independence, tie-breaking).
- `tests/backup.test.js` — `runBackup` with injected `spawn` and
  `fs.promises`. Asserts mongodump argv, `mkdir` before dump,
  empty-archive defence, no-prune-on-failure, structured log shape.
- `tests/cron.test.js` — scheduler wiring; success/failure tick
  semantics; error swallowing so cron keeps ticking.

### Smoke test (end-to-end, requires Docker)

The unit suite above runs without Docker or a real Mongo. For a true
end-to-end check — real `mongodump`, real `mongorestore`, real archive
file on a real volume — run the smoke script:

```bash
bash SA/backup/scripts/smoke-test.sh
```

It performs eight steps:

1. Builds the backup image from the Dockerfile.
2. Spins up a throwaway `mongo:7` on a private network.
3. Seeds a marker document.
4. Runs the backup container against the throwaway mongo.
5. Verifies the archive exists and matches the documented naming
   convention.
6. Drops the seeded collection (so a "the doc was never gone"
   false-positive is impossible).
7. Restores from the archive via `mongorestore`.
8. Asserts the marker document is back with the same value.

All resources are namespaced with a unique suffix per run and cleaned
up on exit (including on Ctrl-C). Exits 0 only on a complete
round-trip; any failure prints exactly which step failed and why.

## Troubleshooting

### `MONGODB_URI is required`

The compose file deliberately fails fast (`${MONGODB_URI:?…}`) when the
URI is not set. Export it before `docker compose up`, or put it in an
`.env` file next to the compose.

### `mongodump exited with code 1: server selection error`

The container can't reach the DB.

- **Atlas:** check the URI password, IP allowlist on Atlas (the
  container's egress IP must be allowed; for free tier you may need
  `0.0.0.0/0`).
- **Local mongo:** confirm you started RAI's stack first and you're
  using the local-mongo override compose so the backup container joins
  `rai-network`.

### `mongodump produced empty archive at /backups/…`

mongodump completed but wrote zero bytes — usually a TCP connection
that died mid-stream. The empty file is cleaned up automatically; the
older backups remain. Look at the previous log lines for the real
cause (often a network or auth issue during the dump).

### Wrong timezone

Cron expression is UTC by default. To use Europe/Ljubljana you'd set
`TZ=Europe/Ljubljana` *and* update `CRON_SCHEDULE` to that timezone's
local time. We default to UTC because Atlas is UTC and ambiguity is
worse than wall-clock convenience.
