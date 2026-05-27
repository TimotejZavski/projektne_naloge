#!/usr/bin/env bash
# SCRUM-38: preveri da backend, MongoDB in MQTT broker delujejo.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${SA_DIR}"

read_env_var() {
  local key="$1"
  local fallback="$2"
  if [[ -f "${SA_DIR}/.env" ]]; then
    local val
    val="$(grep -E "^${key}=" "${SA_DIR}/.env" | head -n1 | cut -d= -f2- || true)"
    if [[ -n "${val}" ]]; then
      echo "${val}"
      return
    fi
  fi
  echo "${fallback}"
}

BACKEND_PORT="$(read_env_var BACKEND_PORT 5000)"
MONGO_PORT="$(read_env_var MONGO_PORT 27017)"
MQTT_PORT="$(read_env_var MQTT_PORT 1883)"
HEALTH_URL="http://localhost:${BACKEND_PORT}/health"

echo "[smoke-test] Preverjam backend: GET ${HEALTH_URL}"
if ! curl -sf "${HEALTH_URL}" >/dev/null; then
  echo "[smoke-test] Napaka: backend health check ni uspel" >&2
  exit 1
fi
echo "[smoke-test] Backend OK"

echo "[smoke-test] Preverjam MongoDB (mongosh ping)..."
if ! docker compose exec -T mongo mongosh --eval "db.adminCommand('ping').ok" --quiet | grep -q "1"; then
  echo "[smoke-test] Napaka: MongoDB ne odgovarja" >&2
  exit 1
fi
echo "[smoke-test] MongoDB OK"

echo "[smoke-test] Preverjam MQTT broker..."
if ! docker compose exec -T mosquitto \
  mosquitto_sub -h localhost -p 1883 -t '$SYS/#' -C 1 -W 5 >/dev/null 2>&1; then
  echo "[smoke-test] Napaka: MQTT broker ne odgovarja" >&2
  exit 1
fi
echo "[smoke-test] MQTT OK"

echo ""
echo "=========================================="
echo "  System ready"
echo "  Backend:  http://localhost:${BACKEND_PORT}"
echo "  Health:   ${HEALTH_URL}"
echo "  MongoDB:  localhost:${MONGO_PORT}"
echo "  MQTT:     localhost:${MQTT_PORT}"
echo "=========================================="
