#!/usr/bin/env bash
# SCRUM-38: avtomatizirana namestitev in zagon celotnega Smart Playgrounds stacka.
#
# Uporaba (iz korena repozitorija ali SA/):
#   ./SA/setup.sh
#   cd SA && ./setup.sh
#
# Koraki:
#   1. preveri Docker
#   2. pripravi .env (JWT sekreti)
#   3. docker compose up -d --build
#   4. pocaka na healthcheck
#   5. inicializira MongoDB kolekcije (idempotentno)
#   6. smoke test

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "=== SCRUM-38: Smart Playgrounds setup ==="
echo ""

# --- 1. Docker ---
if ! command -v docker >/dev/null 2>&1; then
  echo "[setup] Napaka: Docker ni namecen. Namesti Docker Desktop / Docker Engine." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[setup] Napaka: Docker daemon ne tece. Zazeni Docker Desktop." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[setup] Napaka: docker compose ni na voljo." >&2
  exit 1
fi

echo "[setup] Docker OK"

# --- 2. Okolje ---
bash "${SCRIPT_DIR}/scripts/init-env.sh"

# --- 3. Zagon stacka ---
echo ""
echo "[setup] Gradim in zaganjam servise (mongo + mosquitto + backend)..."
docker compose up -d --build

# --- 4. Healthcheck ---
echo ""
bash "${SCRIPT_DIR}/scripts/wait-healthy.sh"

# --- 5. DB init ---
echo ""
bash "${SCRIPT_DIR}/scripts/init-db.sh"

# --- 6. Smoke test ---
echo ""
bash "${SCRIPT_DIR}/scripts/smoke-test.sh"

echo ""
echo "[setup] Koncano. Za loge: docker compose logs -f"
echo "[setup] Ustavitev:     docker compose down"
