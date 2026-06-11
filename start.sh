#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RAI_SERVER_DIR="$ROOT_DIR/RAI/server"
RAI_CLIENT_DIR="$ROOT_DIR/RAI/client"
VID_DIR="$ROOT_DIR/VID"

export PORT="${PORT:-5000}"
export ORV_PUBLIC_URL="${ORV_PUBLIC_URL:-http://localhost:8000}"
export ORV_CORS_ORIGINS="${ORV_CORS_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000}"
export REACT_APP_API_BASE_URL="${REACT_APP_API_BASE_URL:-http://localhost:5000}"
export REACT_APP_ORV_BASE_URL="${REACT_APP_ORV_BASE_URL:-http://localhost:8000}"
export REACT_APP_ORV_COURT_ID="${REACT_APP_ORV_COURT_ID:-test-court-1}"

PIDS=()

cleanup() {
  echo
  echo "[start] stopping services..."
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[start] missing command: $1" >&2
    exit 1
  fi
}

python_bin() {
  if [ -x "$VID_DIR/.venv/Scripts/python.exe" ]; then
    echo "$VID_DIR/.venv/Scripts/python.exe"
  elif [ -x "$VID_DIR/.venv/bin/python" ]; then
    echo "$VID_DIR/.venv/bin/python"
  elif command -v python >/dev/null 2>&1; then
    command -v python
  else
    echo "[start] missing python. Create VID/.venv or install python." >&2
    exit 1
  fi
}

start_service() {
  local name="$1"
  local dir="$2"
  shift 2

  echo "[start] $name"
  (
    cd "$dir"
    "$@"
  ) &
  PIDS+=("$!")
}

require_command npm

if [ ! -f "$RAI_SERVER_DIR/.env" ]; then
  echo "[start] warning: RAI/server/.env is missing. Copy .env.example and set secrets if backend fails."
fi

ORV_PYTHON="$(python_bin)"

start_service "ORV service -> http://localhost:8000/docs" "$VID_DIR" \
  "$ORV_PYTHON" -m uvicorn service.orv.main:app --host 0.0.0.0 --port 8000

start_service "RAI server -> http://localhost:${PORT}/health" "$RAI_SERVER_DIR" \
  npm run dev

start_service "RAI client -> http://localhost:3000" "$RAI_CLIENT_DIR" \
  npm start

echo
echo "[start] dashboard: http://localhost:3000"
echo "[start] ORV health: http://localhost:8000/health"
echo "[start] loop streams: http://localhost:8000/streams"
echo "[start] press Ctrl+C to stop all services"

wait
