#!/usr/bin/env bash
# SCRUM-38: pripravi .env datoteko (kopira iz .env.example, generira JWT sekrete).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${SA_DIR}/.env"
ENV_EXAMPLE="${SA_DIR}/.env.example"

if [[ ! -f "${ENV_EXAMPLE}" ]]; then
  echo "[init-env] Napaka: manjka ${ENV_EXAMPLE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  echo "[init-env] Ustvarjen ${ENV_FILE} iz .env.example"
else
  echo "[init-env] ${ENV_FILE} ze obstaja - ohranim obstojece vrednosti"
fi

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 64
  elif command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  else
    echo "[init-env] Napaka: potrebujem openssl ali node za generiranje JWT sekretov" >&2
    exit 1
  fi
}

replace_if_placeholder() {
  local key="$1"
  local placeholder="$2"
  local current

  current="$(grep -E "^${key}=" "${ENV_FILE}" | head -n1 | cut -d= -f2- || true)"
  if [[ "${current}" == "${placeholder}" || -z "${current}" ]]; then
    local secret
    secret="$(generate_secret)"
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${secret}|" "${ENV_FILE}"
    else
      sed -i "s|^${key}=.*|${key}=${secret}|" "${ENV_FILE}"
    fi
    echo "[init-env] Generiran ${key}"
  fi
}

replace_if_placeholder "JWT_ACCESS_SECRET" "CHANGE-ME-generate-with-crypto-randomBytes-64-hex"
replace_if_placeholder "JWT_REFRESH_SECRET" "CHANGE-ME-DIFFERENT-from-access-secret"

echo "[init-env] Okolje pripravljeno."
