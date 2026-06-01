# Avtentikacijski sistem (SCRUM-13)

Login sistem z **JWT access tokeni + DB-trackani refresh tokeni**.

> Lokacija kode: `RAI/server/src/{config,models,middleware,utils,validators,controllers,routes}/`
> Testi: `RAI/server/tests/auth.test.js` (49 testov)
> Smoke skripte: `RAI/server/scripts/smoke-*.js`

---

## Vsebina

1. [Hitri zagon](#1-hitri-zagon)
2. [Arhitektura](#2-arhitektura)
3. [API endpoint-i](#3-api-endpoint-i)
4. [Varnostne lastnosti](#4-varnostne-lastnosti)
5. [Konfiguracija (env spremenljivke)](#5-konfiguracija)
6. [Frontend integracija](#6-frontend-integracija)
7. [Testiranje](#7-testiranje)
8. [Pregled struktur datotek](#8-pregled-struktur-datotek)

---

## 1. Hitri zagon

```bash
# Terminal 1 - inicializacija baze (samo prvi zagon)
cd RAI/database && node init_script.js

# Terminal 2 - backend
cd RAI/server
cp .env.example .env             # in nastavi sekrete (glej spodaj)
npm install
npm start                         # produkcija   → http://localhost:5000
# ali
npm run dev                       # razvoj z auto-restart

# Hitri test
curl http://localhost:5000/health
```

Generiranje varnih sekretov za `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Ta ukaz pozeni **dvakrat** in nastavi `JWT_ACCESS_SECRET` in `JWT_REFRESH_SECRET` na razlicni vrednosti.

---

## 2. Arhitektura

```
┌─────────┐   POST /register, /login            ┌──────────┐
│ Klient  │ ──────────────────────────────────► │ Backend  │
│         │                                      │ (Express)│
│         │ ◄──── 200 + { accessToken } ──────── │          │
│         │ ◄──── Set-Cookie: refresh (HttpOnly) │          │
│         │                                      └──────────┘
│         │
│         │   GET /me, /logout-all, /api/...
│         │   Authorization: Bearer <accessToken>
│         │ ──────────────────────────────────► ...
│         │
│         │   POST /refresh
│         │   Cookie: rai_refresh_token=...
│         │ ──────────────────────────────────► ...
└─────────┘
```

### Vrste tokenov

| Token | Hramba klient | TTL | Posiljan kot | Verifikacija | Lahko revokamo? |
|---|---|---|---|---|---|
| **Access** | spomin (NE localStorage!) | **15 min** | `Authorization: Bearer` | brez DB klica (stateless JWT) | NE (a kratek TTL) |
| **Refresh** | HttpOnly cookie | **7 dni** | `Cookie: rai_refresh_token` | DB lookup v `sessions` | DA (revoke session) |

### Zakaj DB-trackani refresh tokeni?

- **Logout je dejansko ucinkovit:** ko revokamo Session zapis, refresh token ne more vec izdati novega access tokena.
- **Reuse detection:** rotiramo refresh token ob vsakem `/refresh`. Ce nekdo poskusi ponovno uporabiti star (ze rotiran) refresh token, sumimo na krajo in revokamo **vse seje uporabnika**.
- **"Moje seje" UI:** v `sessions` kolekciji hranimo `userAgent`, `ipAddress`, `createdAtUtc` -> uporabnik lahko vidi naprave in posamicno odjavi.

### Zakaj NE shranimo raw refresh tokena?

V DB hranimo samo `sha256(refreshToken)`. Ce baza pusca, ukradeni hash **ni uporaben** kot token.

---

## 3. API endpoint-i

Vsi endpoint-i pod `/api/auth/*`. Vsi odgovori so JSON v formatu:

```json
{ "error": { "code": "STRING", "message": "Razlaga.", "details": [ ... ] } }
```

ali pri uspehu pricakovan body za posamezen endpoint.

### POST /api/auth/register

Ustvari uporabnika in ga takoj prijavi (vrne tokene).

**Request:**

```json
{
  "email": "user@example.com",
  "password": "StrongP@ss123",
  "displayName": "John Doe"
}
```

**Validacija:**
- `email` - RFC format, max 254 znakov, lowercase + trim
- `password` - 8-128 znakov, vsaj **1 mala**, **1 velika**, **1 stevilka**
- `displayName` - 2-60 znakov

**Response 201:**

```json
{
  "user": {
    "_id": "65fa1c9b...",
    "email": "user@example.com",
    "displayName": "John Doe",
    "role": "user",
    "isActive": true,
    "createdAtUtc": "2026-05-09T10:00:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshExpiresAt": "2026-05-16T10:00:00.000Z"
}
```

Hkrati postavi `Set-Cookie: rai_refresh_token=...; HttpOnly; Path=/api/auth; SameSite=Lax`.

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | nevalidno geslo / email / displayName (glej `details`) |
| 409 | `EMAIL_TAKEN` | email ze obstaja |
| 429 | `TOO_MANY_REQUESTS` | rate limit (privzeto 10/h na IP) |

### POST /api/auth/login

**Request:**

```json
{ "email": "user@example.com", "password": "StrongP@ss123" }
```

**Response 200:** isto kot register (brez `user` ce ze prijavljen, sicer enako).

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | manjka email/geslo |
| 401 | `INVALID_CREDENTIALS` | **isto sporocilo za napacno geslo IN za neobstojec email** (anti-enumeration) |
| 429 | `TOO_MANY_REQUESTS` | rate limit (privzeto 5/15min na IP, **steje le neuspele**) |

### GET /api/auth/me

Vrne podatke trenutno prijavljenega uporabnika. Sluzi tudi za "verify token" check.

**Headers:** `Authorization: Bearer <accessToken>`

**Response 200:**

```json
{
  "user": { "_id": "...", "email": "...", "displayName": "...", "role": "user", ... }
}
```

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 401 | `NO_TOKEN` | manjka Authorization Bearer |
| 401 | `INVALID_TOKEN` | malformiran / podpisan z napacnim sekretom |
| 401 | `TOKEN_EXPIRED` | access token je potekel - klient naj poklice `/refresh` |
| 401 | `USER_NOT_FOUND` | uporabnik je bil izbrisan |
| 401 | `USER_INACTIVE` | uporabnik je deaktiviran |

### POST /api/auth/refresh

Izda nov access token (in **rotiran** nov refresh token). Bere refresh token iz HttpOnly cookie-ja.

**Request:** brez body-ja, potreben je `Cookie: rai_refresh_token=...`

**Response 200:**

```json
{
  "accessToken": "eyJhbGc...",
  "refreshExpiresAt": "2026-05-16T10:30:00.000Z"
}
```

Hkrati postavi NOVI `Set-Cookie: rai_refresh_token=...` (rotation).

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 401 | `NO_REFRESH_TOKEN` | cookie manjka |
| 401 | `INVALID_TOKEN` / `TOKEN_EXPIRED` | refresh JWT je nevalidan / potekel |
| 401 | `SESSION_NOT_FOUND` | seja ne obstaja v DB |
| 401 | `TOKEN_REUSE` | **starejsa, ze rotirana seja**. Vse seje uporabnika so revokane. Klient se mora znova prijaviti. |
| 401 | `USER_NOT_FOUND` | uporabnik je bil izbrisan |

### POST /api/auth/logout

Razveljavi trenutno sejo. Idempotent (vrne 204 tudi brez cookieja / ze potekle seje).

**Request:** brez body-ja, `Cookie: rai_refresh_token=...` (opcijsko)

**Response 204** + `Set-Cookie: rai_refresh_token=; ...` (clearuje cookie).

### POST /api/auth/logout-all

Razveljavi **vse** aktivne seje uporabnika (npr. ce sumi na kompromis na drugi napravi).

**Headers:** `Authorization: Bearer <accessToken>`

**Response 204.**

---

## 4. Varnostne lastnosti

### Storage gesel
- **bcrypt** s `BCRYPT_SALT_ROUNDS=12` (default; cca 250 ms na hash)
- `passwordHash` ima `select: false` - queries ga privzeto **ne vracajo**
- `toJSON` override stripa `passwordHash` + `__v` - tudi ce ga query nalozi, **ne pride v API odgovor**

### Anti user-enumeration
- Login napaka je **ENAKA generic** ne glede na to ali email obstaja ali ne
- Ko email ne obstaja, vseeno opravimo `bcrypt.compare` s "fake" hashom (timing equalization)

### JWT varnost
- Algoritem **HS256 EKSPLICITNO fiksiran** (prepreci 'alg: none' attack)
- **Locena secret-a** za access in refresh -> token ne more biti "confused"
- `iss` (`rai-backend`) in `aud` (`rai-api` / `rai-refresh`) validacija
- `type: 'access' | 'refresh'` claim + check -> dodatna mreza
- Vsak access token ima `jti` (12 bytes hex) -> garantirana unikatnost

### Refresh token security
- Hranjen kot **`HttpOnly` cookie** -> JS ga **NE more brati** (XSS mitigacija)
- `SameSite=Lax` -> CSRF mitigacija (`Strict` priporoceno za prod)
- `Path=/api/auth` -> manj exposure surface
- `Secure=true` v produkciji (samo HTTPS)
- V DB hranimo **samo sha256 hash**, NE raw token
- **Rotation** ob vsakem `/refresh` (nov token + revoke starega)
- **Reuse detection**: ponovna uporaba starega tokena revoka **vse seje uporabnika**

### Network security
- **helmet** - X-Frame-Options, HSTS, X-Content-Type-Options, ...
- **CORS whitelist** preko env (nikoli `*` z credentials)
- **express-mongo-sanitize** - odstrani `$` in `.` iz vhoda (NoSQL injection mitigacija)
- **body-size limit 10kb** na auth endpoint-ih (DoS mitigacija)

### Rate limiting
| Endpoint | Default | Env |
|---|---|---|
| `/auth/login` | 5 / 15 min na IP, **steje le neuspele** | `RATE_LIMIT_LOGIN_*` |
| `/auth/register` | 10 / 1 h na IP | `RATE_LIMIT_REGISTER_*` |
| `/api/*` | 100 / 15 min na IP | `RATE_LIMIT_GENERAL_*` |

### Input validation
- **Joi** sheme z `abortEarly: false` (vse napake naenkrat) in `stripUnknown: true` (mass-assignment mitigacija)
- Geslo politika: 8-128 znakov, lowercase + uppercase + digit
- Email RFC validacija + lowercase + trim

### Error handling
- Centraliziran `errorHandler` middleware
- **Stack trace nikoli ne uhaja v produkcijskih odgovorih**
- Vsi odgovori imajo enotno strukturo

---

## 5. Konfiguracija

`.env` (glej `.env.example` za poln seznam):

```bash
# Obvezne
JWT_ACCESS_SECRET=<dolg-naključen-niz>
JWT_REFRESH_SECRET=<DRUG-dolg-naključen-niz>
MONGODB_URI=mongodb://localhost:27017/rai

# Priporocene (privzete vrednosti so razumne)
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=12
COOKIE_SECURE=false      # !!! true v produkciji (HTTPS) !!!
COOKIE_SAME_SITE=lax
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Rate limit
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_LOGIN_WINDOW_MS=900000
RATE_LIMIT_REGISTER_MAX=10
RATE_LIMIT_REGISTER_WINDOW_MS=3600000
```

`env.js` (`src/config/env.js`) opravi **fail-fast** validacijo:
- ce manjka katera obvezna spremenljivka -> proces takoj umre z jasno napako
- ce sta `JWT_ACCESS_SECRET` in `JWT_REFRESH_SECRET` enaka -> umre (ker bi to razbilo loceno verifikacijo)

---

## 6. Frontend integracija

### Klient flow

```javascript
// 1. Registracija / prijava
const res = await fetch('/api/auth/login', {
  method: 'POST',
  credentials: 'include',                  // VAZNO: posiljanje cookie-ja
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const { accessToken } = await res.json();

// 2. accessToken hrani v SPOMINU (NE localStorage!)
//    XSS bi lahko prebral localStorage in ukradel tokene.
let memoryToken = accessToken;

// 3. Uporabi za vse API klice
fetch('/api/auth/me', {
  headers: { Authorization: `Bearer ${memoryToken}` },
});

// 4. Ko access poteci (401 TOKEN_EXPIRED) -> klici /refresh
const refreshRes = await fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include',
});
const { accessToken: newAccess } = await refreshRes.json();
memoryToken = newAccess;
// Brauzer samodejno shrani NOV refresh cookie iz Set-Cookie

// 5. Logout
await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
memoryToken = null;
```

### Avtomatski refresh interceptor (axios primer)

```javascript
axios.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401 && err.response?.data?.error?.code === 'TOKEN_EXPIRED') {
      const r = await axios.post('/api/auth/refresh', null, { withCredentials: true });
      memoryToken = r.data.accessToken;
      err.config.headers.Authorization = `Bearer ${memoryToken}`;
      return axios(err.config);
    }
    throw err;
  }
);
```

### CORS na frontendu

V `.env`: `CORS_ORIGINS=http://localhost:3000,http://localhost:5173`

V `fetch` / `axios`: vedno `credentials: 'include'` za cookieje.

---

## 7. Testiranje

```bash
cd RAI/server

# Avtomatizirani Jest testi (49 testov, 0 zunanje odvisnosti)
npm test

# Smoke skripti za rocno preverjanje (potrebujeta zivi MongoDB)
node scripts/smoke-user-model.js     # User+Session model (19 testov)
node scripts/smoke-jwt.js            # JWT util (24 testov)
node scripts/smoke-auth-e2e.js       # full E2E auth flow (43 testov, server mora teci)
```

Jest uporablja `mongodb-memory-server` -> ne potrebuje zunanje Mongo instance, vsak run dobi cisto bazo.

---

## 8. Pregled struktur datotek

```
RAI/server/
├── .env                                # gitignored
├── .env.example                        # primer konfiguracije
├── AUTH.md                             # ta dokument
├── index.js                            # vstopna tocka, graceful shutdown
├── package.json
├── scripts/
│   ├── smoke-user-model.js             # 19 testov za User+Session
│   ├── smoke-jwt.js                    # 24 testov za JWT util
│   └── smoke-auth-e2e.js               # 43 testov - poganja proti zivemu strezniku
├── src/
│   ├── app.js                          # Express app (helmet, CORS, body parsers, ...)
│   ├── config/
│   │   ├── env.js                      # fail-fast env validacija
│   │   └── database.js                 # mongoose connect/disconnect
│   ├── controllers/
│   │   └── auth.controller.js          # register, login, refresh, logout, me
│   ├── middleware/
│   │   ├── auth.js                     # requireAuth, requireRole, lazy req.loadUser
│   │   ├── errorHandler.js             # enotni JSON error odgovori
│   │   ├── rateLimiter.js              # general/login/register limiterji
│   │   └── validate.js                 # Joi validacija middleware
│   ├── models/
│   │   ├── User.js                     # bcrypt, anti-enumeration, toJSON stripping
│   │   └── Session.js                  # sha256 refresh token storage, TTL index
│   ├── routes/
│   │   ├── index.js                    # /api glavni router
│   │   └── auth.routes.js              # /api/auth/*
│   ├── utils/
│   │   ├── AppError.js                 # operativna napaka s code+statusCode
│   │   ├── asyncHandler.js             # async wrapper za controllerje
│   │   └── jwt.js                      # signing + verification (HS256, locena secret-a)
│   └── validators/
│       └── auth.validator.js           # Joi sheme (registerSchema, loginSchema)
└── tests/
    ├── setup-env.js                    # Jest setupFiles - env vars
    ├── setup.js                        # mongodb-memory-server lifecycle
    └── auth.test.js                    # 49 testov
```

---

## Pred prehodom v produkcijo

- [ ] Zamenjaj `JWT_*_SECRET` z **dejanskimi** dolgimi nakljucnimi vrednostmi (NE iz `.env.example`)
- [ ] Postavi `COOKIE_SECURE=true` (zahteva HTTPS)
- [ ] Razmisli o `COOKIE_SAME_SITE=strict` (strogo, brez cross-site GET-ov)
- [ ] Postavi `NODE_ENV=production`
- [ ] Omeji `CORS_ORIGINS` na produkcijske domene
- [ ] V firewallu ([`SA/firewall/README.md`](../../SA/firewall/README.md) — SCRUM-42) odpri samo 443/80 + SSH navzven; Mongo (27017) in MQTT (1883) interno preko Docker mreze
- [ ] Razmisli o IP-blocking pri Trojanskih `TOKEN_REUSE` dogodkih (alarm v [`SA/monitoring/`](../../SA/monitoring/README.md) — SCRUM-43)
- [ ] Backup `sessions` kolekcije ni potreben (TTL jih ciisti samodejno), backup `users` pa je obvezen
