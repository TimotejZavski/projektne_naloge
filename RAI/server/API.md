# REST API - devices + sensor_measurements (SCRUM-20)

> Avtentikacija: glej [`AUTH.md`](./AUTH.md) (vsi endpoint-i tukaj zahtevajo
> `Authorization: Bearer <accessToken>`)
>
> Lokacija kode: `RAI/server/src/{models,controllers,routes,validators}/`
> Testi: `RAI/server/tests/devices.test.js` (49 testov)
> Smoke skripte: `RAI/server/scripts/smoke-{devices,measurements-*}.js`

---

## Vsebina

1. [Pregled](#1-pregled)
2. [Devices endpoint-i](#2-devices-endpoint-i)
3. [Measurements endpoint-i](#3-measurements-endpoint-i)
4. [Cursor paginacija](#4-cursor-paginacija)
5. [Varnostni model](#5-varnostni-model)
6. [Primeri uporabe](#6-primeri-uporabe)
7. [Testiranje](#7-testiranje)

---

## 1. Pregled

| Resource | Pot | Opis |
|---|---|---|
| Devices | `/api/devices/*` | Naprave, ki posiljajo senzorske podatke. Vsaka naprava pripada enemu uporabniku. |
| Measurements | `/api/measurements/*` | Sensor meritve (GPS, pospeskomer). Sprejem (HTTP `POST`) in branje s filtri. |

**Format:** vsi requesti in odgovori so JSON. Napake so v formatu:

```json
{ "error": { "code": "STRING", "message": "Razlaga.", "details": [...] } }
```

**Avtentikacija:** vse poti zahtevajo veljaven access token v `Authorization: Bearer ...` headerju (glej `AUTH.md`).

**Lastnistvo (ownership):** uporabnik vidi/spreminja **samo svoje** naprave in meritve. Tujih ni mogoce naslavljati - 404 v vseh primerih (anti-enumeration).

---

## 2. Devices endpoint-i

### POST `/api/devices`

Registracija naprave za prijavljenega uporabnika.

**Request body:**

```json
{
  "deviceId": "phone-azur-pixel8",
  "name": "Azur's Pixel 8",
  "platform": "android",
  "appVersion": "1.0.0"
}
```

| Field | Tip | Obvezen | Opombe |
|---|---|---|---|
| `deviceId` | string | da | 3-64 znakov, samo `[a-zA-Z0-9._-]` (prepoveduje presledke, `/`, sumnike, MQTT wildcards `+ #`) |
| `name` | string | ne | do 80 znakov |
| `platform` | enum | ne | `android` \| `ios` \| `windows` \| `macos` \| `linux` \| `web` \| `other`, default `other` |
| `appVersion` | string | ne | do 40 znakov |

**Response 201:**

```json
{
  "device": {
    "_id": "65fa1c9b...",
    "deviceId": "phone-azur-pixel8",
    "userId": "65f0...",
    "name": "Azur's Pixel 8",
    "platform": "android",
    "appVersion": "1.0.0",
    "isActive": true,
    "lastSeenAtUtc": "2026-05-09T12:00:00.000Z",
    "createdAtUtc": "2026-05-09T12:00:00.000Z",
    "updatedAtUtc": "2026-05-09T12:00:00.000Z"
  }
}
```

**Idempotentnost:** Ce isti uporabnik ponovno klice POST z istim `deviceId`, vrnemo **200** in posodobimo metadata (uporabno ob ponovni instalaciji aplikacije).

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | invalid deviceId / platform / ... |
| 401 | `NO_TOKEN` / `INVALID_TOKEN` | manjkajoc/neveljaven access token |
| 409 | `DEVICE_ID_TAKEN` | `deviceId` ze pripada **drugemu** uporabniku |

---

### GET `/api/devices`

Lista uporabnikovih naprav (cursor paginacija).

**Query parametri:**

| Param | Tip | Default | Opombe |
|---|---|---|---|
| `isActive` | boolean | (all) | filter po aktivnosti |
| `platform` | enum | (all) | filter po platformi |
| `limit` | int | 50 | 1-200 |
| `cursor` | string | - | `_id` zadnjega zapisa prejsne strani |

**Response 200:**

```json
{
  "devices": [ { ... }, { ... } ],
  "pagination": {
    "limit": 50,
    "nextCursor": "65fa1c9b...",
    "hasMore": true
  }
}
```

Sortirano po `_id` desc (najnovejse najprej).

---

### GET `/api/devices/:id`

Branje posamezne naprave po `_id` (24-hex ObjectId).

**Response 200:** `{ "device": { ... } }`

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `:id` ni 24-hex ObjectId |
| 404 | `NOT_FOUND` | naprava ne obstaja **ALI** pripada drugemu uporabniku (anti-enumeration) |

---

### PATCH `/api/devices/:id`

Posodobitev metapodatkov naprave. **Vsaj eno polje je obvezno.**

**Request body:**

```json
{
  "name": "New Name",
  "isActive": false
}
```

Dovoljena polja: `name`, `platform`, `appVersion`, `isActive`.
**`deviceId` in `userId` NISTA spremenljiva** (Joi `stripUnknown` jih odstrani -> 400 ce so edina polja).

**Response 200:** `{ "device": { ... } }`

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | prazno telo / samo unknown polja / invalid platform |
| 404 | `NOT_FOUND` | naprava ne obstaja ali ni vasa |

---

### DELETE `/api/devices/:id`

Trd brisanje naprave **+ vseh njenih meritev** (cascade).

**Response 204** (brez body).

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 404 | `NOT_FOUND` | naprava ne obstaja ali ni vasa |

---

### GET `/api/devices/:id/measurements`

Convenience: meritve naprave po `_id` (preusmerja na `GET /api/measurements?deviceId=...`).

**Query parametri:** isto kot `GET /api/measurements` (brez `deviceId`).

**Response 200:** isto kot `GET /api/measurements`.

---

## 3. Measurements endpoint-i

### POST `/api/measurements`

Sprejem **ene** sensor meritve. Naprava (`deviceId`) mora pripadati prijavljenemu uporabniku.

**Request body (GPS):**

```json
{
  "schemaVersion": "1.0",
  "deviceId": "phone-azur-pixel8",
  "sensorType": "gps",
  "timestampUtc": "2026-05-09T12:00:00.000Z",
  "data": {
    "latitude": 46.5547,
    "longitude": 15.6459,
    "accuracyMeters": 5
  }
}
```

**Request body (accelerometer):**

```json
{
  "schemaVersion": "1.0",
  "deviceId": "phone-azur-pixel8",
  "sensorType": "accelerometer",
  "timestampUtc": "2026-05-09T12:00:00.000Z",
  "data": {
    "x": 0.01,
    "y": -0.02,
    "z": 9.81,
    "unit": "m/s2"
  }
}
```

**Validacija (skladno z `RAI/schemas/sensor-measurement.schema.json`):**
- `schemaVersion` mora biti `"1.0"`
- `sensorType` enum `gps | accelerometer`
- `timestampUtc` ISO 8601, **ne sme biti v prihodnosti**
- `data` polje je strogo glede na `sensorType`:
  - GPS: `latitude` (-90..90), `longitude` (-180..180), `accuracyMeters` (>=0, opcijsko). Dodatna polja zavrnjena.
  - Accel: `x`, `y`, `z` (real), `unit` (`m/s2` \| `g`, opcijsko). Dodatna polja zavrnjena.

**Response 201:**

```json
{
  "measurement": {
    "_id": "65fa...",
    "deviceId": "phone-azur-pixel8",
    "userId": "65f0...",
    "sensorType": "gps",
    "timestampUtc": "2026-05-09T12:00:00.000Z",
    "data": { "latitude": 46.5547, "longitude": 15.6459, "accuracyMeters": 5 },
    "source": "http",
    "schemaVersion": "1.0",
    "receivedAtUtc": "2026-05-09T12:00:00.123Z"
  }
}
```

Po vstavi se samodejno (fire-and-forget) posodobi `device.lastSeenAtUtc`.

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | nepravilen format / sensorType / data |
| 404 | `DEVICE_NOT_FOUND` | naprava ne obstaja **ALI** ne pripada uporabniku |

---

### POST `/api/measurements/batch`

Sprejem do **100 meritev** v eni zahtevi. Priporoceno za mobilno aplikacijo z visoko frekvenco vzorcenja (npr. pospeskomer 10 Hz).

**Request body:**

```json
{
  "measurements": [
    { "schemaVersion": "1.0", "deviceId": "...", "sensorType": "gps", "timestampUtc": "...", "data": { ... } },
    { "schemaVersion": "1.0", "deviceId": "...", "sensorType": "accelerometer", "timestampUtc": "...", "data": { ... } }
  ]
}
```

Limit 1-100. Vsaka meritev je validirana posebej (Joi `array.items`).

**Response 201:**

```json
{
  "insertedCount": 9,
  "rejectedCount": 1,
  "rejected": [
    { "index": 5, "deviceId": "tujedevice123", "reason": "DEVICE_NOT_FOUND" }
  ]
}
```

**Partial-success politika:** ce nekaj meritev ima `deviceId`, ki ne pripada uporabniku, jih zavrnemo individualno (vrnemo `rejected[]`) in vstavimo ostale. Ce so **VSE** zavrnjene -> 404 `NO_OWNED_DEVICES`.

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | celoten batch zavrnjen (>100, prazen array, vsaj ena meritev nevalidna) |
| 404 | `NO_OWNED_DEVICES` | nobena meritev v batchu nima validnega/lastnega deviceId-ja |

---

### GET `/api/measurements`

Branje meritev s filtri in cursor-paginacijo. **Sortirano po `timestampUtc`**.

**Query parametri:**

| Param | Tip | Default | Opombe |
|---|---|---|---|
| `deviceId` | string | (all) | filter po napravi (mora biti vasa, sicer 404) |
| `sensorType` | enum | (all) | `gps` \| `accelerometer` |
| `from` | ISO date | - | `timestampUtc >= from` |
| `to` | ISO date | - | `timestampUtc < to` (mora biti `> from`) |
| `limit` | int | 100 | 1-1000 |
| `cursor` | base64url | - | iz `pagination.nextCursor` prejsne strani |
| `sort` | enum | `desc` | `asc` \| `desc` (po `timestampUtc`) |

**Response 200:**

```json
{
  "measurements": [ { ... }, { ... } ],
  "pagination": {
    "limit": 100,
    "sort": "desc",
    "nextCursor": "eyJ0cyI6IjIwMjYtMDUtMDlUMTI6MDA6MDAuMDAwWiIsImlkIjoiNjVmYS4uLiJ9",
    "hasMore": true
  }
}
```

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `to <= from`, `limit > 1000`, invalid sort, invalid cursor format |
| 400 | `INVALID_CURSOR` | cursor base64 OK ampak vsebina je nevalidna (napacen ts ali id) |
| 404 | `NOT_FOUND` | filter `deviceId` se sklicuje na napravo, ki ne obstaja ali ni vasa |

---

### GET `/api/measurements/:id`

Branje posamezne meritve po `_id` (24-hex ObjectId).

**Response 200:** `{ "measurement": { ... } }`

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `:id` ni 24-hex ObjectId |
| 404 | `NOT_FOUND` | meritev ne obstaja ali pripada drugemu uporabniku |

---

## 4. Cursor paginacija

Tehnicni detajli za frontend / mobile dev.

### Devices

`cursor` je `_id` (24-hex ObjectId) zadnjega zapisa na strani. Sortirano `_id desc` (najnovejse naprave najprej).

```
GET /api/devices?limit=20
GET /api/devices?limit=20&cursor=<nextCursor iz prejsnega odgovora>
```

### Measurements

`cursor` je **base64url-encoded JSON** `{ ts: <ISO datetime>, id: <hex ObjectId> }` - compound (timestamp + id).

Compound cursor je nujen, ker je **`timestampUtc` lahko enak za vec meritev iz istega batch-a** (npr. pospeskomer 10 Hz lahko v isti milisekundi posveti vec vzorcev). Brez compound bi se zapisi lahko podvajali ali izpustili med stranmi.

Klient cursor obravnava kot **opaque token** - ne sme razclenjevati ali generirati lastnega.

```
GET /api/measurements?limit=100&sort=desc
GET /api/measurements?limit=100&sort=desc&cursor=eyJ0cy...
```

`hasMore: false` pomeni, da je trenutna stran zadnja.

---

## 5. Varnostni model

### Avtentikacija

Vsi endpoint-i pod `/api/devices/*` in `/api/measurements/*` zahtevajo veljaven JWT access token (glej `AUTH.md`).

### Avtorizacija (ownership)

- Uporabnik vidi/spreminja samo **svoje** naprave (filter `userId = req.user.id`)
- Uporabnik posilja meritve samo za **svoje** naprave (DEVICE_NOT_FOUND za tuje)
- Brisanje naprave kaskadira na pripadajoce meritve

### Anti-enumeration

Tuje vire (naprave, meritve) **ni mogoce razlikovati od neobstojecih** - vsi vrnejo `404 NOT_FOUND`. To prepreci napadalcu, da bi z brute force iskanjem ObjectId-jev odkril, katere `deviceId`-je / `_id`-je drugi uporabniki uporabljajo.

### Mass-assignment block

Joi `stripUnknown: true` odstrani vsa polja, ki niso v shemi - tudi ce klient poslje `role: 'admin'`, `userId: 'X'`, `_id: '...'` v PATCH telesu, so tiha **odstranjena** pred kontrolerjem.

### NoSQL injection

Globalni `express-mongo-sanitize` middleware odstrani vse kljuce, ki se zacnejo z `$` ali vsebujejo `.` (preprecuje `{ "email": { "$gt": "" } }` triki). Joi pa nato zavrne ostala neveljavna struktura.

### Rate limiting

Globalni limit 100 zahtev / 15 min na IP (config `RATE_LIMIT_GENERAL_*`). Ingestion endpoints **niso** posebej omejeni - mobilna aplikacija s 10 Hz pospeskomerom bi v 10 sekundah dosegla limit. Za batch endpoint priporocamo zdruzevanje 100 meritev v 1 zahtevo (efektivni 10s payload na 1 zahtevo).

### Validacija velikosti

Globalni body-parser limit 128kb zadosca:
- batch 100 GPS meritev ≈ 25kb
- batch 100 accel meritev ≈ 20kb
- avtentikacijski payloadi <1kb

---

## 6. Primeri uporabe

### Mobilna aplikacija - tipicen flow

```javascript
// 1. Login (samo enkrat)
const { accessToken } = await api.post('/api/auth/login', { email, password });

// 2. Registriraj napravo (samo prvic / po reinstall)
const deviceId = `phone-${userId}-${getDeviceUuid()}`;
await api.post('/api/devices', {
  deviceId,
  name: 'My Phone',
  platform: 'android',
  appVersion: '1.0.0',
});

// 3. Vsako sekundo posiljaj GPS
setInterval(async () => {
  const pos = await getCurrentPosition();
  await api.post('/api/measurements', {
    schemaVersion: '1.0',
    deviceId,
    sensorType: 'gps',
    timestampUtc: new Date().toISOString(),
    data: { latitude: pos.lat, longitude: pos.lng, accuracyMeters: pos.acc },
  });
}, 1000);

// 4. Pospeskomer 10 Hz -> batch every 5 sec (50 meritev na batch)
const accelBuffer = [];
onAccelEvent(({ x, y, z }) => {
  accelBuffer.push({
    schemaVersion: '1.0', deviceId, sensorType: 'accelerometer',
    timestampUtc: new Date().toISOString(),
    data: { x, y, z, unit: 'm/s2' },
  });
});
setInterval(async () => {
  if (accelBuffer.length === 0) return;
  await api.post('/api/measurements/batch', { measurements: accelBuffer.splice(0) });
}, 5000);
```

### Spletni dashboard - prikaz meritev

```javascript
// Vse moje naprave
const { devices } = await api.get('/api/devices');

// Zadnjih 100 GPS meritev za eno napravo
const { measurements } = await api.get(
  `/api/measurements?deviceId=${devices[0].deviceId}&sensorType=gps&limit=100`
);

// Ce hocemo vse: cursor paginacija
let cursor = null;
const all = [];
do {
  const r = await api.get(`/api/measurements${cursor ? `?cursor=${cursor}` : ''}`);
  all.push(...r.measurements);
  cursor = r.pagination.nextCursor;
} while (cursor);
```

### Zadnja ura GPS-a

```javascript
const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const r = await api.get(`/api/measurements?sensorType=gps&from=${encodeURIComponent(from)}`);
```

---

## 3.4 Processed (Agregirani) Measurements

Agregirani/obdelani senzorski podatki (povprečja, statistika, itd.).
Ti se avtomatsko generirajo iz raw meritev vsakih 5 minut, uro in dan.

### GET `/api/measurements/processed`

Branje agregirani senzorskih podatkov s filtri.

**Query parametri (vsi opcijski):**

```
?sensorType=gps             # 'gps' | 'accelerometer'
&aggregationType=5min       # '5min' | '1hour' | 'daily'
&deviceId=phone-123         # specifična naprava
&limit=100                  # 1..1000, default 100
```

**Response 200:**

```json
{
  "measurements": [
    {
      "_id": "65fa...",
      "deviceId": "phone-123",
      "sensorType": "gps",
      "aggregationType": "5min",
      "periodStartUtc": "2026-05-10T10:30:00Z",
      "periodEndUtc": "2026-05-10T10:35:00Z",
      "aggregatedData": {
        "avgLatitude": 46.12345,
        "avgLongitude": 14.98765,
        "minAccuracy": 3.5,
        "maxAccuracy": 8.2,
        "sampleCount": 45
      },
      "sampleCount": 45,
      "processedAtUtc": "2026-05-10T10:35:30Z"
    }
  ],
  "count": 10
}
```

**Za accelerometer:**

```json
{
  "aggregatedData": {
    "avgX": 0.234,
    "avgY": 0.156,
    "avgZ": 9.812,
    "maxAccel": 1.234,
    "detectionStatus": "moving",
    "sampleCount": 120
  }
}
```

- `detectionStatus`: `"moving"` (gibanje zaznano) ali `"stationary"` (mirovanje)

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | invalid `sensorType` ali `aggregationType` |
| 404 | `NOT_FOUND` | filter `deviceId` ne pripada uporabniku |

---

### POST `/api/measurements/aggregate` (admin only)

Ročno zaži agregiracijo (za testiranje/debugging).

**Request body:**

```json
{
  "aggregationType": "5min"
}
```

**Response 200:**

```json
{
  "message": "Agregacija 5min je bila uspesna",
  "result": {
    "aggregatedCount": 12,
    "devicesProcessed": 3
  }
}
```

**Napake:**
| Status | Code | Pomen |
|---|---|---|
| 400 | `VALIDATION_ERROR` | invalid `aggregationType` |
| 403 | `FORBIDDEN` | samo admin ima dostop |

---

## 7. Testiranje

```bash
cd RAI/server
npm test                                           # 109 jest testov (auth + devices)

# Smoke skripti (potrebuje ziv server na :5000)
node scripts/smoke-device-model.js                 # 16 model+validator testov
node scripts/smoke-devices-e2e.js                  # 31 devices CRUD testov
node scripts/smoke-measurements-ingest.js          # 33 ingestion testov
node scripts/smoke-measurements-read.js            # 29 read testov

# Novi smoke test-i za SCRUM-21 (raw + processed + MQTT)
node scripts/smoke-mqtt-ingest.js                  # MQTT ingestija + raw branje
node scripts/smoke-processed-measurements.js       # Processed measurements + aggregacija
```

### Kako testirati lokalno (step-by-step)

**Predpogoji:**
1. MongoDB na `localhost` (ali prilagodi `.env`)
2. MQTT broker (Mosquitto) na `localhost:1883`
3. RAI server na `localhost:5000`

**Korak 1: Zaženi MongoDB**
```bash
# Če imaš MongoDB lokalno
mongod
```

**Korak 2: Zaženi MQTT broker**
```bash
# Če imaš Mosquitto nameščen
mosquitto -p 1883

# Oziroma Docker:
docker run -p 1883:1883 eclipse-mosquitto
```

**Korak 3: Zaženi RAI server**
```bash
cd RAI/server
npm run dev
# Strežnik posluša na http://localhost:5000
```

**Korak 4: Zaženi smoke test-e (v novo okno)**
```bash
cd RAI/server

# Test MQTT ingestije in raw meritev
node scripts/smoke-mqtt-ingest.js

# Test processed measurements in agregiracijo
node scripts/smoke-processed-measurements.js
```

**Korak 5: Ročno testiranje (curl ali Postman)**

Registracija:
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "StrongP@ss123",
    "displayName": "Test User"
  }'
# Shrani accessToken
```

Registracija naprave:
```bash
curl -X POST http://localhost:5000/api/devices \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "test-device-1",
    "name": "Test Device",
    "platform": "android"
  }'
```

Branje raw meritev:
```bash
curl http://localhost:5000/api/measurements \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Branje processed meritev:
```bash
curl http://localhost:5000/api/measurements/processed \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Ročna agregiacija (admin):
```bash
curl -X POST http://localhost:5000/api/measurements/aggregate \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"aggregationType": "5min"}'
```
