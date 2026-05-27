# Docker okolje za RAI backend (SCRUM-23)

> Kontejnerizacija backend-a + MongoDB s **enim ukazom**
> (`docker compose up -d`).
>
> Lokacija: `RAI/server/{Dockerfile,docker-compose.yml,.env.docker.example}`

---

## Vsebina

1. [Hitri zagon](#1-hitri-zagon)
2. [Arhitektura](#2-arhitektura)
3. [Dockerfile pregled](#3-dockerfile-pregled)
4. [docker-compose.yml pregled](#4-docker-composeyml-pregled)
5. [Env spremenljivke](#5-env-spremenljivke)
6. [Vsakodnevni ukazi](#6-vsakodnevni-ukazi)
7. [Tezave (troubleshooting)](#7-tezave)
8. [Pred produkcijo](#8-pred-produkcijo)

---

## 1. Hitri zagon

**Predpogoji:** Docker Desktop (Windows/macOS) ali Docker Engine (Linux).

```bash
cd RAI/server

# 1. Pripravi env (sekreti)
cp .env.docker.example .env.docker

# 2. Generiraj 2 RAZLICNA JWT secret-a
ACCESS=$(openssl rand -hex 64)
REFRESH=$(openssl rand -hex 64)
sed -i "s|JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$ACCESS|" .env.docker
sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$REFRESH|" .env.docker

# 3. Zazeni
docker compose up -d --build

# 4. Preveri (oba (healthy) v ~10s)
docker compose ps
curl http://localhost:5000/health
```

Pricakovan odgovor:

```json
{ "status": "ok", "uptimeSec": 10, "database": "connected", "timestamp": "..." }
```

Ustavitev:

```bash
docker compose down       # ohrani podatke
docker compose down -v    # POBRISE tudi MongoDB volume
```

---

## 2. Arhitektura

```
┌──────────────────────── Docker host ────────────────────────┐
│                                                              │
│   port 5000 ──────────────┐    port 27017 (samo dev) ──┐    │
│                           │                              │    │
│        ┌──────────────────▼─────┐    ┌──────────────────▼─┐ │
│        │   rai-backend          │    │   rai-mongo        │ │
│        │   (Node.js 22 alpine)  │    │   (mongo:7.0)      │ │
│        │   USER node (non-root) │    │                    │ │
│        │   dumb-init -> node    │    │   /data/db ───┐    │ │
│        │                        │◄───┤ rai-network    │   │ │
│        │   reach mongo via      │    │ (bridge)       │   │ │
│        │   mongodb://mongo:27017│    │                │   │ │
│        └────────────────────────┘    └────────────────┼───┘ │
│                                                       │     │
│        ┌──────────────────────────────────────────────▼──┐  │
│        │  Volume: rai_mongo_data (persistent)            │  │
│        └──────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Servisi:**

| Service | Image | Opis | Healthcheck |
|---|---|---|---|
| `mongo` | `mongo:7.0` | MongoDB 7 LTS | `mongosh ping` vsakih 10s |
| `backend` | `rai-backend:dev` (lokalni build) | Node.js + Express | GET `/health` vsakih 30s |

**Network:** `rai-network` (bridge) — backend kontaktira mongo prek service name-a `mongo`, ne `localhost` (localhost znotraj container-ja pomeni container sam).

**Volumes:**

| Volume | Vsebina | Prezivi `down` | Prezivi `down -v` |
|---|---|---|---|
| `rai_mongo_data` | DB podatki (`/data/db`) | ✓ | ✗ |
| `rai_mongo_config` | DB metadata (`/data/configdb`) | ✓ | ✗ |

---

## 3. Dockerfile pregled

`RAI/server/Dockerfile` uporablja **multi-stage build**:

| Stage | Vsebina | Velikost |
|---|---|---|
| `deps` | `node:22.12-alpine3.20` + `npm install --omit=dev` | ~250 MB (vmesno) |
| `runtime` | alpine + dumb-init + node_modules + source | **58.7 MB content** |

Kljucne lastnosti:

- **node:22.12-alpine3.20** (LTS, manj CVE kot polna Debian baza)
- **`npm install --omit=dev`** (NE `npm ci`, ker `package-lock.json` je gitignored po team policy)
- **dumb-init** kot PID 1 → posredi SIGTERM/SIGINT → graceful shutdown iz SCRUM-13 dejansko deluje
- **non-root user `node`** (drop privileges, security best practice)
- **HEALTHCHECK** na `/health` preko native `node fetch` (ni potreben curl/wget install)
- `.dockerignore` izlocuje `node_modules/`, `.env*`, `tests/`, `scripts/`, `*.md`, `.git/` — manjsi build kontekst + nikoli secret leak

---

## 4. docker-compose.yml pregled

Pomembni deli:

### Vrstni red zagona

```yaml
backend:
  depends_on:
    mongo:
      condition: service_healthy
```

Backend **ne startna** dokler mongo `healthcheck` ne uspe → prepreci ENOTFOUND v prvih sekundah.

### Internal DNS

```yaml
backend:
  environment:
    MONGODB_URI: mongodb://mongo:27017/rai
```

`mongo` se v Docker bridge mrezi resolva v IP container-ja. **Ne uporabljaj `localhost`** v container env vars (znotraj container-ja localhost = container sam).

### Persistentni podatki

```yaml
volumes:
  rai_mongo_data:
    name: rai_mongo_data
```

Named volume → po `docker compose down` se ohrani. Za hard-reset uporabi `docker compose down -v`.

---

## 5. Env spremenljivke

`.env.docker` (gitignored) vsebuje:

| Spremenljivka | Obvezno | Privzeto | Opis |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | **da** | - | nakljucni 64-byte hex (preko openssl) |
| `JWT_REFRESH_SECRET` | **da** | - | drugi 64-byte hex, RAZLICEN od access |
| `MONGODB_URI` | da | `mongodb://mongo:27017/rai` | service-name DNS, NE localhost |
| `BACKEND_PORT` | ne | `5000` | port na host strani |
| `NODE_ENV` | ne | `production` | `development` za dev verbose loge |
| `JWT_ACCESS_EXPIRES_IN` | ne | `15m` | |
| `JWT_REFRESH_EXPIRES_IN` | ne | `7d` | |
| `BCRYPT_SALT_ROUNDS` | ne | `12` | |
| `CORS_ORIGINS` | ne | `http://localhost:3000,http://localhost:5173` | locite z vejico |
| `RATE_LIMIT_*` | ne | razne | glej `.env.docker.example` |
| `COOKIE_SECURE` | ne | `false` | `true` SAMO ob HTTPS deploy |

**`env.js` opravi fail-fast validacijo:** ce manjka kateri obvezni secret, container takoj umre z jasno napako (boljse v prvih 5s kot v produkciji ob prvi prijavi).

---

## 6. Vsakodnevni ukazi

### Status + logi

```bash
docker compose ps                              # status servisov
docker compose logs -f backend                 # spremljaj backend loge
docker compose logs --tail 50 mongo            # zadnjih 50 vrstic mongo
```

### Restart po code change

```bash
docker compose up -d --build backend           # rebuild SAMO backend
docker compose restart backend                 # samo restart (brez rebuild)
```

### Mongo shell

```bash
docker compose exec mongo mongosh rai
# znotraj:
db.users.countDocuments()
db.devices.find().limit(5).pretty()
```

### Backend shell (debugging)

```bash
docker compose exec backend sh
# znotraj container-ja:
node -e "console.log(require('mongoose').connection.readyState)"
```

### Inicializacija kolekcij (opcijsko)

Mongoose pri prvi povezavi avtomatsko ustvari kolekcije + indexe iz schema definicij. Ce zelis EKSPLICITNO pre-create vse iz `RAI/database/init_script.js`:

```bash
# Zazeni init skripto v ad-hoc Node container-ju
docker run --rm \
  --network rai-network \
  -v $(pwd)/../database:/init \
  -v $(pwd)/node_modules:/init/node_modules \
  -w /init \
  node:22-alpine \
  node init_script.js
```

(Init skripta mora biti predhodno spremenjena tako, da bere `MONGODB_URI` iz env, sicer hardcode-an `localhost:27017` ne bo deloval znotraj container-ja.)

### Reset podatkov

```bash
docker compose down -v          # POBRISE volumes (vsi podatki)
docker compose up -d --build    # cisti zagon
```

---

## 7. Tezave

| Simptom | Resitev |
|---|---|
| `Restarting (1)` v `docker compose ps` | `docker compose logs backend` -> verjetno manjka kateri JWT secret v `.env.docker` |
| `MongooseServerSelectionError: ENOTFOUND mongo` | mongo container ni se startal -> preveri `docker compose ps`, mongo mora biti `(healthy)` pred backend-om |
| `Error: listen EADDRINUSE: 5000` | drug proces ze posluha na 5000 -> `BACKEND_PORT=5001` v `.env.docker` |
| `pull access denied for mongo:7.0` | Docker Desktop ni prijavljen / proxy / offline -> `docker login`, preveri internet |
| Pull mongo:7.0 traja 5+ min | normalna velikost (267 MB), enkratni cost; podatki cache-ani v `~/.docker/` |
| Healthcheck fail za backend | poklici `docker compose exec backend node -e "fetch('http://localhost:5000/health').then(r=>console.log(r.status))"` -> ce 200, je healthcheck OK |
| `EACCES: permission denied` v container-u | container tece kot user `node` (UID 1000) - ce kopiras source z drugim ownerjem, dodaj `--chown=node:node` v Dockerfile |

---

## 8. Pred produkcijo

Razvojni compose je **NE-PRIMEREN za produkcijo**. Za produkcijski deploy (SCRUM-37, SCRUM-42):

### MongoDB

- Vklopi auth: `MONGO_INITDB_ROOT_USERNAME` + `MONGO_INITDB_ROOT_PASSWORD` env vars
- `MONGODB_URI` postane `mongodb://user:pass@mongo:27017/rai?authSource=admin`
- **Odstrani `ports: 27017:27017`** iz mongo servisa (samo internal access preko `rai-network`)
- Razmisli o replica set-u za HA

### Backend

- `NODE_ENV=production` (ze default)
- `COOKIE_SECURE=true` (zahteva HTTPS)
- `COOKIE_SAME_SITE=strict` (rigid CSRF zascita)
- `CORS_ORIGINS` omeji na produkcijske domene
- Migration skripta za indexe (namesto autoIndex):
  ```javascript
  await Promise.all(mongoose.modelNames().map(name =>
    mongoose.model(name).syncIndexes()
  ));
  ```
- Resource limits v compose:
  ```yaml
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 512M
  ```

### Reverse proxy + TLS

- **Caddy / Nginx / Traefik** pred backend-om za HTTPS terminacijo
- Backend ostane interni (brez public expose port-a 5000)
- Certifikati preko Let's Encrypt

### Firewall (SCRUM-42)

- ufw: dovoli samo 22 (SSH iz fakultete), 80 (HTTP redirect), 443 (HTTPS)
- 1883 (MQTT) samo za backend container preko Docker mreze
- 27017 (Mongo) NIKOLI public

### CI/CD (SCRUM-37/38)

- GitHub Actions: `npm test` -> `docker build` -> push v Docker Hub / GHCR
- Production strežnik pulla novo sliko in restarta servisi z `docker compose pull && docker compose up -d`
- Backup skripta (SCRUM-43): `docker compose exec mongo mongodump` na zunanji disk vsak dan ob 02:00

### Monitoring (SCRUM-43)

Implementacija: [`SA/monitoring/`](../../SA/monitoring/README.md)

- Cron `check-health.sh` vsakih 5 min (`curl -f /health`, Docker, MQTT)
- `check-disk.sh` ob polnem disku, `backup-mongo.sh` ob 02:00
- Render: Health Checks na `/health` + email alerts (brez cron-a)

---

## Sklic

- [`Dockerfile`](./Dockerfile) — multi-stage build definicija
- [`docker-compose.yml`](./docker-compose.yml) — orkestracija backend + mongo
- [`.env.docker.example`](./.env.docker.example) — predloga env vars
- [`AUTH.md`](./AUTH.md) — avtentikacijski sistem (SCRUM-13)
- [`API.md`](./API.md) — REST endpoint specifikacija (SCRUM-20)
- [`../database/init_script.js`](../database/init_script.js) — opcijska MongoDB init skripta
- [`../../SA/mqtt/docker-compose.yml`](../../SA/mqtt/docker-compose.yml) — MQTT broker setup (SCRUM-14, lociran)
