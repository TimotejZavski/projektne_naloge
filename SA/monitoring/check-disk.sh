#!/usr/bin/env bash
# SCRUM-43: opozori ce zmanjka prostora na disku (root partition).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/alert.sh"

DISK_THRESHOLD="${DISK_THRESHOLD:-85}"

usage_pct="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
avail="$(df -hP / | awk 'NR==2 {print $4}')"
total="$(df -hP / | awk 'NR==2 {print $2}')"

if [[ -z "${usage_pct}" ]] || ! [[ "${usage_pct}" =~ ^[0-9]+$ ]]; then
  alert "Ne morem prebrati disk usage (df fail)"
  exit 1
fi

if [[ "${usage_pct}" -ge "${DISK_THRESHOLD}" ]]; then
  alert "Disk skoraj poln: ${usage_pct}% zasedeno (${avail} prosto od ${total})"
  exit 1
fi

log_ok "Disk OK: ${usage_pct}% zasedeno (${avail} prosto)"
exit 0
