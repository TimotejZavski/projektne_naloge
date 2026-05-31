#!/usr/bin/env bash
# End-to-end smoke test for the MongoDB backup service (SCRUM-44).
#
# Verifies the entire pipeline against real binaries — no mocks, no
# hand-waving. The unit tests in SA/backup/tests/ prove the logic;
# this script proves the integration.
#
# Round trip (all eight steps must pass):
#   1) Build the backup image from the Dockerfile.
#   2) Create a private network and spin up a throwaway mongo:7.
#   3) Seed mongo with a known marker document.
#   4) Run the backup container against the throwaway mongo
#      (real mongodump, real fs, real volume).
#   5) Confirm an archive file with the expected naming convention
#      landed in the backups volume.
#   6) Drop the seeded collection so any "the doc was never gone"
#      false-positive is impossible.
#   7) Restore from the archive via mongorestore.
#   8) Assert the marker document is back, byte for byte.
#
# Exits 0 on success. Non-zero with a clear message on any failure.
# Cleans up containers, network, and volume even on Ctrl-C / error.
#
# Usage:
#   bash SA/backup/scripts/smoke-test.sh
#
# Requirements:
#   - docker on PATH and the daemon running
#   - outbound internet for the initial mongo:7 / node:20 pulls
#
# Runs as a normal user; no sudo needed (assuming your user is in the
# docker group / Docker Desktop is configured).

set -euo pipefail

# ---- configuration ---------------------------------------------------

# Unique suffix so two parallel runs don't collide on container or
# volume names.
SUFFIX=$$-$RANDOM

NET="sp-smoke-net-${SUFFIX}"
MONGO_CONTAINER="sp-smoke-mongo-${SUFFIX}"
VOLUME_NAME="sp-smoke-dumps-${SUFFIX}"

MONGO_IMAGE="mongo:7.0"
BACKUP_IMAGE="smart-playgrounds-backup:smoke-${SUFFIX}"

DB_NAME="smoketest"
COLLECTION="canaries"
MARKER_ID="marker-1"
MARKER_NOTE="smoke-test-$(date -u +%s)"

# Resolve repository paths so the script works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---- helpers ---------------------------------------------------------

step() { printf '\n\033[1;36m[smoke %s]\033[0m %s\n' "$1" "$2"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }
die()  { printf '\n\033[1;31m[smoke FAIL]\033[0m %s\n' "$1" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

# Pull last non-empty line out of a mongosh --quiet --eval invocation.
# mongosh sometimes prints a banner even with --quiet on first connect.
mongosh_last_line() {
  docker exec "$MONGO_CONTAINER" mongosh --quiet "$DB_NAME" --eval "$1" \
    | tr -d '\r' \
    | grep -vE '^[[:space:]]*$' \
    | tail -n 1
}

cleanup() {
  local exit_code=$?
  printf '\n\033[1;33m[smoke cleanup]\033[0m removing throwaway resources...\n'
  docker rm -f "$MONGO_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NET"        >/dev/null 2>&1 || true
  docker volume rm "$VOLUME_NAME"  >/dev/null 2>&1 || true
  docker image rm "$BACKUP_IMAGE"  >/dev/null 2>&1 || true
  exit $exit_code
}
trap cleanup EXIT

# ---- preflight -------------------------------------------------------

require_cmd docker
docker info >/dev/null 2>&1 || die "docker daemon is not reachable"

# ---- step 1: build the backup image ---------------------------------

step "1/8" "build backup image from Dockerfile"
docker build -q -t "$BACKUP_IMAGE" "$BACKUP_ROOT" >/dev/null
ok "image built: $BACKUP_IMAGE"

# ---- step 2: network + throwaway mongo ------------------------------

step "2/8" "create network and start throwaway mongo:7"
docker network create "$NET" >/dev/null
docker run -d --rm \
  --name "$MONGO_CONTAINER" \
  --network "$NET" --network-alias mongo \
  "$MONGO_IMAGE" >/dev/null

printf "  waiting for mongo to accept connections "
for i in $(seq 1 60); do
  if docker exec "$MONGO_CONTAINER" mongosh --quiet --eval "db.adminCommand('ping').ok" \
        >/dev/null 2>&1; then
    printf "\n"
    ok "mongo is up"
    break
  fi
  printf "."
  sleep 1
  [ "$i" -eq 60 ] && { printf "\n"; die "mongo never became ready"; }
done

# ---- step 3: seed marker --------------------------------------------

step "3/8" "seed marker document"
SEED_JS="db.${COLLECTION}.insertOne({_id:'${MARKER_ID}', note:'${MARKER_NOTE}'})"
docker exec "$MONGO_CONTAINER" mongosh --quiet "$DB_NAME" --eval "$SEED_JS" >/dev/null

COUNT_BEFORE=$(mongosh_last_line "print(db.${COLLECTION}.countDocuments({}))")
[ "$COUNT_BEFORE" = "1" ] || die "expected 1 seeded doc, got '$COUNT_BEFORE'"
ok "seeded 1 doc (_id=${MARKER_ID})"

# ---- step 4: run backup ---------------------------------------------

step "4/8" "run backup against throwaway mongo (real mongodump)"
docker volume create "$VOLUME_NAME" >/dev/null
docker run --rm \
  --network "$NET" \
  -e MONGODB_URI="mongodb://mongo:27017/${DB_NAME}" \
  -e BACKUP_DIR=/backups \
  -e BACKUP_KEEP=7 \
  -v "$VOLUME_NAME:/backups" \
  "$BACKUP_IMAGE" \
  npm run start:once
ok "backup exited 0"

# ---- step 5: archive exists & well-named ----------------------------

step "5/8" "verify archive landed with the documented naming convention"
ARCHIVE=$(docker run --rm -v "$VOLUME_NAME:/backups" alpine \
  sh -c "ls -1 /backups 2>/dev/null | grep -E '^mongodb-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}\.archive\.gz$' | sort | tail -n 1" || true)
[ -n "$ARCHIVE" ] || die "no archive produced or filename does not match convention"

ARCHIVE_SIZE=$(docker run --rm -v "$VOLUME_NAME:/backups" alpine \
  sh -c "stat -c %s /backups/$ARCHIVE")
[ "$ARCHIVE_SIZE" -gt 0 ] || die "archive is zero bytes"
ok "archive: $ARCHIVE (${ARCHIVE_SIZE} bytes)"

# ---- step 6: drop seeded collection ---------------------------------

step "6/8" "drop seeded collection to make 'doc was never gone' impossible"
docker exec "$MONGO_CONTAINER" mongosh --quiet "$DB_NAME" \
  --eval "db.${COLLECTION}.drop()" >/dev/null

COUNT_DROPPED=$(mongosh_last_line "print(db.${COLLECTION}.countDocuments({}))")
[ "$COUNT_DROPPED" = "0" ] || die "drop failed: ${COUNT_DROPPED} docs remain"
ok "collection is empty"

# ---- step 7: restore ------------------------------------------------

step "7/8" "restore from archive via mongorestore"
docker run --rm \
  --network "$NET" \
  -v "$VOLUME_NAME:/backups" \
  "$BACKUP_IMAGE" \
  mongorestore \
    --uri="mongodb://mongo:27017/${DB_NAME}" \
    --archive="/backups/${ARCHIVE}" \
    --gzip >/dev/null
ok "mongorestore exited 0"

# ---- step 8: assert document came back ------------------------------

step "8/8" "assert the marker document is back, byte-for-byte"
COUNT_AFTER=$(mongosh_last_line "print(db.${COLLECTION}.countDocuments({}))")
[ "$COUNT_AFTER" = "1" ] || die "expected 1 doc after restore, got '$COUNT_AFTER'"

RESTORED_NOTE=$(mongosh_last_line \
  "print(db.${COLLECTION}.findOne({_id:'${MARKER_ID}'}).note)")
[ "$RESTORED_NOTE" = "$MARKER_NOTE" ] \
  || die "restored note '$RESTORED_NOTE' != expected '$MARKER_NOTE'"
ok "round-trip verified: same _id, same note value"

# ---- done -----------------------------------------------------------

printf '\n\033[1;32m[smoke PASS]\033[0m backup → restore round-trip verified end-to-end.\n'
