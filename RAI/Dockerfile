# ============================================================
# RAI monorepo Dockerfile za Render (frontend + backend skupaj)
# ============================================================
# Multi-stage build:
#   1. client-builder:  npm install + npm run build React aplikacije
#   2. deps:            npm install SAMO produkcijske odvisnosti serverja
#   3. runtime:         zdruzi vse v eno sliko, Express servira React
#
# Render config:
#   Root Directory:  RAI
#   Dockerfile Path: Dockerfile (oz. pusti ".")
# ============================================================

ARG NODE_VERSION=22.12-alpine3.20

# ---------- Stage 1: build React client ----------
FROM node:${NODE_VERSION} AS client-builder

WORKDIR /app/client

COPY client/package.json client/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY client/ ./
RUN npm run build

# ---------- Stage 2: production server dependencies ----------
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# ---------- Stage 3: runtime ----------
FROM node:${NODE_VERSION} AS runtime

RUN apk add --no-cache dumb-init && \
    mkdir -p /app/client && \
    chown -R node:node /app

WORKDIR /app

# Kopiramo server node_modules iz stage-a deps
COPY --chown=node:node --from=deps /app/node_modules ./node_modules

# Kopiramo server source
COPY --chown=node:node server/ ./

# Kopiramo React build iz stage-a client-builder
COPY --chown=node:node --from=client-builder /app/client/build ./client/build

ENV NODE_ENV=production \
    PORT=5000 \
    NPM_CONFIG_LOGLEVEL=warn

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
