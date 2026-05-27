#!/usr/bin/env bash
# SCRUM-43: dnevni MongoDB backup (mongodump iz Docker containerja).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/alert.sh"

CONTAINER_MONGO="${CONTAINER_MONGO:-rai-mongo}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/rai-mongo}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
MONGO_DATABASE="${MONGO_DATABASE:-rai}"

find_compose_dir() {
  if [[ -n "${MONITOR_COMPOSE_DIR:-}" && -f "${MONITOR_COMPOSE_DIR}/docker-compose.yml" ]]; then
    echo "${MONITOR_COMPOSE_DIR}"
    return
  fi
  if [[ -f "${REPO_ROOT}/SA/docker-compose.yml" ]]; then
    echo "${REPO_ROOT}/SA"
    return
  fi
  if [[ -f "${REPO_ROOT}/RAI/server/docker-compose.yml" ]]; then
    echo "${REPO_ROOT}/RAI/server"
    return
  fi
  echo ""
}

COMPOSE_DIR="$(find_compose_dir)"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_DIR}/${STAMP}"

mkdir -p "${BACKUP_DIR}"

log_msg "INFO" "MongoDB backup start -> ${DEST}"

if [[ -n "${COMPOSE_DIR}" ]]; then
  if ! (cd "${COMPOSE_DIR}" && docker compose exec -T mongo \
    mongodump --db="${MONGO_DATABASE}" --archive --gzip) > "${DEST}.archive.gz"; then
    alert "MongoDB backup FAIL (docker compose exec)"
    exit 1
  fi
elif docker ps -q -f "name=^/${CONTAINER_MONGO}$" | grep -q .; then
  if ! docker exec "${CONTAINER_MONGO}" \
    mongodump --db="${MONGO_DATABASE}" --archive --gzip > "${DEST}.archive.gz"; then
    alert "MongoDB backup FAIL (docker exec)"
    exit 1
  fi
else
  alert "MongoDB backup FAIL: container ${CONTAINER_MONGO} ne tece"
  exit 1
fi

find "${BACKUP_DIR}" -name '*.archive.gz' -mtime +"${BACKUP_RETENTION_DAYS}" -delete 2>/dev/null || true

log_ok "MongoDB backup OK: ${DEST}.archive.gz"
exit 0
