#!/usr/bin/env bash
# SCRUM-38: opcijska inicializacija MongoDB kolekcij in indeksov.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SA_DIR}/.." && pwd)"
INIT_SCRIPT="${REPO_ROOT}/RAI/database/init_script.js"

cd "${SA_DIR}"

if [[ ! -f "${INIT_SCRIPT}" ]]; then
  echo "[init-db] Preskoceno: manjka ${INIT_SCRIPT}"
  exit 0
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx "mongo"; then
  echo "[init-db] Napaka: mongo servis ne tece" >&2
  exit 1
fi

# Backend (ko se zazene) prek Mongoose avtomatsko ustvari indekse z
# privzetimi imeni (npr. "email_1"). Init skripta pa uporablja
# eksplicitna imena (npr. "users_email_unique"), kar povzroci
# "Index already exists with a different name" napako.
# Zato pred init skripto pocistimo te avtomatske indekse.
echo "[init-db] Pciscujem avtomatske Mongoose indekse (ce obstajajo)..."
docker compose exec -T mongo mongosh "mongodb://mongo:27017/rai" --quiet 2>/dev/null <<'MONGOSHELL' || true
  // Pobrisi avtomatske indekse, ki jih je Mongoose ustvaril s privzetimi imeni
  try { db.users.dropIndex("email_1"); } catch(e) {}
  try { db.devices.dropIndex("deviceId_1"); } catch(e) {}
  try { db.devices.dropIndex("userId_1"); } catch(e) {}
MONGOSHELL

echo "[init-db] Zaganjam inicializacijo kolekcij in indeksov..."
docker compose run --rm --no-deps \
  -e MONGODB_URI="mongodb://mongo:27017/rai" \
  -e NODE_PATH=/app/node_modules \
  -v "${INIT_SCRIPT}:/init.js:ro" \
  backend node /init.js || true

echo "[init-db] Baza inicializirana."
