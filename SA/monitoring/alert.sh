#!/usr/bin/env bash
# SCRUM-43: skupno logiranje in opcijski Discord alarm.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/monitoring.env"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

LOG_FILE="${LOG_FILE:-/var/log/rai-monitor.log}"

log_msg() {
  local level="$1"
  local msg="$2"
  local ts
  ts="$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')"
  local line="[${ts}] [${level}] ${msg}"

  if [[ -w "$(dirname "${LOG_FILE}")" ]] 2>/dev/null || [[ "${LOG_FILE}" == /dev/* && "${EUID:-$(id -u)}" -eq 0 ]]; then
    echo "${line}" >> "${LOG_FILE}"
  fi
  echo "${line}"
}

alert() {
  local msg="$1"
  log_msg "ALERT" "${msg}"

  if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
    local payload
    payload=$(printf '{"content":"Smart Playgrounds ALERT: %s"}' "$(echo "${msg}" | sed 's/\\/\\\\/g; s/"/\\"/g')")
    curl -sf -X POST -H "Content-Type: application/json" \
      -d "${payload}" \
      "${DISCORD_WEBHOOK_URL}" >/dev/null 2>&1 || true
  fi
}

log_ok() {
  log_msg "OK" "$1"
}
