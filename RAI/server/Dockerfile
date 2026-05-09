# ============================================================
# RAI backend - Docker image (SCRUM-23)
# ============================================================
#
# Multi-stage build:
#   Stage 1 (deps):    nameci ZGOLJ produkcijske odvisnosti v locenem
#                      sloju za boljse cache-anje in cisto izlocitev
#                      devDependencies (jest, mongodb-memory-server, ...)
#   Stage 2 (runtime): kopira node_modules + source v cisto alpine
#                      sliko, zaganja kot non-root user
#
# Velikost slike: ~120 MB (vs ~1.2 GB ce bi vse skupaj v node:lts).
#
# Build:
#   docker build -t rai-backend:dev -f RAI/server/Dockerfile RAI/server
# Test run:
#   docker run --rm -p 5000:5000 --env-file RAI/server/.env rai-backend:dev
#
# Priporoceno: uporabi docker compose (glej RAI/server/docker-compose.yml)
# ============================================================

# Pin natancno minor verzijo za reproducibilnost.
# 22-alpine je lts (do 2027), alpine je manjsi + manj CVE.
ARG NODE_VERSION=22.12-alpine3.20

# ---------- Stage 1: production dependencies ----------
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

# Najprej kopiramo SAMO package.json (+ lock, ce obstaja v build kontextu),
# da Docker cache layer-a `npm install` ostane veljaven dokler se package
# ne spremeni. Source kode spremembe ne invalidirajo deps cache-a.
COPY package.json ./
# Wildcard pattern da COPY uspe tudi ce lock NE obstaja (repo policy
# v root .gitignore izlocuje **/package-lock.json - kloni ga nimajo).
COPY package-lock.json* ./

# Uporabljamo `npm install --omit=dev` (ne `npm ci`) ker package-lock.json
# ni nujno prisoten v build kontextu (gitignored po team policy).
# `--omit=dev` izpusti devDependencies (jest, supertest, mongo-memory-server).
# `--no-audit --no-fund` zmanjsa noise + cas.
RUN npm install --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# ---------- Stage 2: runtime ----------
FROM node:${NODE_VERSION} AS runtime

# dumb-init resi PID 1 problem v Linuxih:
# - posredi SIGTERM/SIGINT do node procesa (sicer Docker po 10s SIGKILL)
# - pravilno reapja zombie procese
# - na ~10kB slika, enkratni cost za varnost
RUN apk add --no-cache dumb-init && \
    # ustvarimo non-root userja (security best practice):
    # node default user 'node' ze obstaja v node:alpine sliki
    mkdir -p /app && chown -R node:node /app

WORKDIR /app

# Kopiramo node_modules iz prvega stage-a (samo prod deps).
COPY --chown=node:node --from=deps /app/node_modules ./node_modules

# Source code. .dockerignore poskrbi da node_modules / .env / tests / .git
# NE pridejo v sliko.
COPY --chown=node:node . .

# Privzete env spremenljivke za produkcijo (lahko prepise docker run --env).
ENV NODE_ENV=production \
    PORT=5000 \
    NPM_CONFIG_LOGLEVEL=warn

# Drop privileges - od te tocke naprej tece vse kot 'node' user.
USER node

EXPOSE 5000

# Healthcheck: preveri /health endpoint vsakih 30s.
# Brez wget/curl v alpine sliki uporabimo node fetch (Node 18+).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# dumb-init kot PID 1, zazene `node index.js` z pravilnim signal handlanjem.
# Naša koda v index.js ze ima graceful shutdown na SIGTERM/SIGINT (SCRUM-13).
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
