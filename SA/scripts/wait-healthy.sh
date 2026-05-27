#!/usr/bin/env bash
# SCRUM-38: pocaka da so vsi servisi v docker compose zdravi.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TIMEOUT="${WAIT_HEALTHY_TIMEOUT:-180}"
INTERVAL=5

cd "${SA_DIR}"

if ! docker compose ps --services >/dev/null 2>&1; then
  echo "[wait-healthy] Napaka: docker compose ni dostopen v ${SA_DIR}" >&2
  exit 1
fi

services="$(docker compose ps --services)"
if [[ -z "${services}" ]]; then
  echo "[wait-healthy] Napaka: ni definiranih servisov." >&2
  exit 1
fi

service_health() {
  local service="$1"
  local cid health state

  cid="$(docker compose ps -q "${service}" 2>/dev/null || true)"
  if [[ -z "${cid}" ]]; then
    echo "missing"
    return
  fi

  state="$(docker inspect -f '{{.State.Status}}' "${cid}" 2>/dev/null || echo "unknown")"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${cid}" 2>/dev/null || echo "unknown")"

  if [[ "${health}" == "healthy" ]]; then
    echo "healthy"
  elif [[ "${health}" == "none" && "${state}" == "running" ]]; then
    echo "running"
  else
    echo "${health}:${state}"
  fi
}

echo "[wait-healthy] Cakam na healthcheck servisov (timeout ${TIMEOUT}s)..."

elapsed=0
while [[ "${elapsed}" -lt "${TIMEOUT}" ]]; do
  all_ready=true

  for service in ${services}; do
    status="$(service_health "${service}")"
    if [[ "${status}" != "healthy" && "${status}" != "running" ]]; then
      all_ready=false
    fi
  done

  if [[ "${all_ready}" == "true" ]]; then
    echo "[wait-healthy] Vsi servisi so pripravljeni."
    docker compose ps
    exit 0
  fi

  sleep "${INTERVAL}"
  elapsed=$((elapsed + INTERVAL))
  echo "[wait-healthy] ... se cakam (${elapsed}s / ${TIMEOUT}s)"
done

echo "[wait-healthy] Timeout - servisi niso postali healthy:" >&2
docker compose ps >&2
exit 1
