#!/usr/bin/env bash
# SCRUM-42: ufw pravila za VPS z Docker stackom (NE Render, NE macOS dev).
#
# Uporaba (po uspesnem setup.sh na Linux VPS):
#   cd SA/firewall
#   cp ufw.env.example ufw.env   # nastavi ALLOWED_SSH_CIDR
#   sudo ./ufw-rules.sh

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "[ufw] Zahtevan root: sudo $0" >&2
  exit 1
fi

if ! command -v ufw >/dev/null 2>&1; then
  echo "[ufw] Napaka: ufw ni namecen (sudo apt install ufw)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/ufw.env"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

ALLOWED_SSH_CIDR="${ALLOWED_SSH_CIDR:-}"

has_rule() {
  ufw status | grep -q "$1"
}

apply_rule() {
  local marker="$1"
  shift
  if has_rule "${marker}"; then
    echo "[ufw] Ze nastavljeno: ${marker}"
  else
    ufw "$@"
    echo "[ufw] Dodano: ${marker}"
  fi
}

echo "=== SCRUM-42: Smart Playgrounds firewall ==="

ufw default deny incoming
ufw default allow outgoing

if [[ -n "${ALLOWED_SSH_CIDR}" ]]; then
  apply_rule "SCRUM-42 SSH" \
    allow from "${ALLOWED_SSH_CIDR}" to any port 22 proto tcp comment 'SCRUM-42 SSH'
else
  apply_rule "SCRUM-42 SSH" allow 22/tcp comment 'SCRUM-42 SSH'
  echo "[ufw] OPOMBA: nastavi ALLOWED_SSH_CIDR v ufw.env za omejitev SSH"
fi

apply_rule "SCRUM-42 HTTP"  allow 80/tcp  comment 'SCRUM-42 HTTP'
apply_rule "SCRUM-42 HTTPS" allow 443/tcp comment 'SCRUM-42 HTTPS'
apply_rule "SCRUM-42 block Mongo"   deny 27017/tcp comment 'SCRUM-42 block Mongo'
apply_rule "SCRUM-42 block API"     deny 5000/tcp  comment 'SCRUM-42 block API'
apply_rule "SCRUM-42 block MQTT"    deny 1883/tcp  comment 'SCRUM-42 block MQTT'
apply_rule "SCRUM-42 block MQTT WS" deny 9001/tcp  comment 'SCRUM-42 block MQTT WS'

ufw --force enable

echo ""
ufw status verbose
echo ""
echo "[ufw] Javni dostop: 80/443 + SSH. Stack interno preko mreze smart-playgrounds."
