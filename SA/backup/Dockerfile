# MongoDB backup service (SCRUM-44).
#
# Bundles:
#   - Node.js 20 (runs the scheduler + backup runner)
#   - mongodump / mongorestore (MongoDB Database Tools, .deb from upstream)
#   - tini as PID 1 (reaps mongodump child processes properly)
#
# Default command runs the scheduler. For an ad-hoc backup or a one-shot
# external cron, override with: `docker compose run --rm backup npm run start:once`.

FROM node:20-bookworm-slim

# Pinned to a known-good release of the official MongoDB tools.
ARG MONGO_TOOLS_VERSION=100.10.0

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        tini; \
    curl -fsSL \
        "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-x86_64-${MONGO_TOOLS_VERSION}.deb" \
        -o /tmp/mdb-tools.deb; \
    apt-get install -y --no-install-recommends /tmp/mdb-tools.deb; \
    rm /tmp/mdb-tools.deb; \
    # Drop curl after tools are installed — smaller attack surface.
    apt-get purge -y --auto-remove curl; \
    rm -rf /var/lib/apt/lists/*; \
    # Sanity check — the build fails here if the .deb URL ever changes silently.
    mongodump --version | head -1; \
    node --version

WORKDIR /app

# Install prod deps first for layer cache.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production \
    BACKUP_DIR=/backups \
    BACKUP_KEEP=7 \
    CRON_SCHEDULE="0 2 * * *"

# Backups live on a named volume mounted here.
VOLUME ["/backups"]

# tini is PID 1 → reaps mongodump zombies; clean SIGTERM forwarding.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/cron.js"]
