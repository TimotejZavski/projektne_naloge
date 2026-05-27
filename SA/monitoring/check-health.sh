#!/usr/bin/env bash
# SCRUM-43: preveri backend /health, Docker containere in MQTT broker.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/alert.sh"

CONTAINER_BACKEND="${CONTAINER_BACKEND:-rai-backend}"
CONTAINER_MONGO="${CONTAINER_MONGO:-rai-mongo}"
CONTAINER_MQTT="${CONTAINER_MQTT:-smart-playgrounds-mqtt}"
BACKEND_PORT="${BACKEND_PORT:-5000}"
HEALTH_URL="${HEALTH_URL:-http://localhost:${BACKEND_PORT}/health}"

errors=0

container_ok() {
  local name="$1"
  local cid state health

  cid="$(docker ps -aq -f "name=^/${name}$" | head -n1 || true)"
  if [[ -z "${cid}" ]]; then
    alert "Container ${name} ne tece"
    return 1
  fi

  state="$(docker inspect -f '{{.State.Status}}' "${cid}" 2>/dev/null || echo unknown)"
  if [[ "${state}" != "running" ]]; then
    alert "Container ${name} ni running (state=${state})"
    return 1
  fi

  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${cid}" 2>/dev/null || echo unknown)"
  if [[ "${health}" == "unhealthy" ]]; then
    alert "Container ${name} je unhealthy"
    return 1
  fi

  log_ok "Container ${name}: running${health:+ (${health})}"
  return 0
}

check_backend_http() {
  local body http_code tmp_body
  tmp_body="$(mktemp)"

  if ! command -v curl >/dev/null 2>&1; then
    alert "curl ni namecen"
    return 1
  fi

  http_code="$(curl -sf -o "${tmp_body}" -w '%{http_code}' "${HEALTH_URL}" 2>/dev/null || echo "000")"
  if [[ "${http_code}" != "200" ]]; then
    alert "Backend health FAIL (HTTP ${http_code}) — ${HEALTH_URL}"
    rm -f "${tmp_body}"
    return 1
  fi

  body="$(cat "${tmp_body}" 2>/dev/null || true)"
  rm -f "${tmp_body}"
  if [[ "${body}" != *'"status"'* ]] || [[ "${body}" != *'"ok"'* ]]; then
    alert "Backend health vrne nepričakovan odgovor"
    return 1
  fi

  if [[ "${body}" == *'"database":"disconnected"'* ]]; then
    alert "Backend tece, a MongoDB ni povezan (database=disconnected)"
    return 1
  fi

  log_ok "Backend health OK (${HEALTH_URL})"
  return 0
}

check_mqtt() {
  if ! docker ps -q -f "name=^/${CONTAINER_MQTT}$" | grep -q .; then
    alert "MQTT container ${CONTAINER_MQTT} ne tece"
    return 1
  fi

  if ! docker exec "${CONTAINER_MQTT}" \
    mosquitto_sub -h localhost -p 1883 -t '$SYS/#' -C 1 -W 5 >/dev/null 2>&1; then
    alert "MQTT broker ne odgovarja (mosquitto_sub fail)"
    return 1
  fi

  log_ok "MQTT broker OK"
  return 0
}

log_msg "INFO" "=== health check start ==="

container_ok "${CONTAINER_MONGO}" || errors=$((errors + 1))
container_ok "${CONTAINER_BACKEND}" || errors=$((errors + 1))
container_ok "${CONTAINER_MQTT}" || errors=$((errors + 1))
check_backend_http || errors=$((errors + 1))
check_mqtt || errors=$((errors + 1))

if [[ "${errors}" -gt 0 ]]; then
  log_msg "INFO" "=== health check FAILED (${errors} napak) ==="
  exit 1
fi

log_msg "INFO" "=== health check OK ==="
exit 0
