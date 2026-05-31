# MQTT topic struktura

Naloga: **SCRUM-14 — MQTT streznik setup (Mosquitto + topics)**

Ta dokument je zavezujoca specifikacija topic strukture za projekt
Smart Playgrounds. Vsi proizvajalci (mobilna aplikacija, backend) in
porabniki (backend, spletni dashboard) se morajo dosledno drzati spodnjih
imen, formatov in QoS nastavitev. Tako preprecimo nezdruzljivosti med
NPO (publisher), RAI (consumer) in SA (broker).

## 1. Konvencija imenovanja

```
smart-playgrounds/<entiteta>/<podtip>/<akcija>
```

Vsi topici se zacnejo s **`smart-playgrounds/`** prefiksom. To je
projektni namespace — ce kdaj delimo broker z drugim sistemom, nasa
sporocila ostanejo izolirana.

Pravila:

- vse z malimi crkami,
- besede locene s `-` znotraj segmenta (npr. `weather-conditions`),
- segmenti loceni z `/`,
- `deviceId` je **string** identifikator iz mobilne aplikacije
  (glej `RAI/database/er-model.md`, poglavje 3),
- prepovedani znaki: `+`, `#`, presledki, sumniki.

## 2. Tematski seznam

| Topic | Smer | QoS | Retain | Format payloada | Opis |
|---|---|---|---|---|---|
| `smart-playgrounds/devices/<deviceId>/sensors/gps` | NPO -> backend | 1 | ne | `sensor-measurement.schema.json` (sensorType=`gps`) | GPS meritev |
| `smart-playgrounds/devices/<deviceId>/sensors/accelerometer` | NPO -> backend | 0 | ne | `sensor-measurement.schema.json` (sensorType=`accelerometer`) | Pospeskomer meritev |
| `smart-playgrounds/devices/<deviceId>/status/online` | NPO -> backend | 1 | da | `{ "online": true, "timestampUtc": "..." }` | Heartbeat (Last Will: `{ "online": false }`) |
| `smart-playgrounds/devices/<deviceId>/status/connect` | NPO -> backend | 1 | ne | `{ "platform": "Android\|iOS\|Windows", "appVersion": "..." }` | Naprava se je povezala |
| `smart-playgrounds/system/broker/status` | broker -> nadzor | 0 | da | `{ "status": "up", "since": "..." }` | Zdravje brokerja (objavlja monitoring skripta) |
| `smart-playgrounds/analytics/playground/<playgroundId>/occupancy` | backend -> spletni klient | 1 | da | `{ "uniqueDevices": <n>, "windowSec": 60 }` | Real-time stevec aktivnih naprav okoli igrisca |

## 3. Primeri konkretnih topicev

```
smart-playgrounds/devices/phone-azur-pixel8/sensors/gps
smart-playgrounds/devices/phone-azur-pixel8/sensors/accelerometer
smart-playgrounds/devices/phone-azur-pixel8/status/online
smart-playgrounds/analytics/playground/65fa1c9b3e0e8a7d2c3a9e14/occupancy
smart-playgrounds/system/broker/status
```

## 4. QoS razlogi (zakaj)

- **GPS = QoS 1** (at least once): redke, dragocene meritve, ne smejo se izgubiti.
- **Pospeskomer = QoS 0** (at most once): visoka frekvenca (10 Hz), izguba posameznih vzorcev je sprejemljiva, prekomerni overhead QoS 1 ni upravicen.
- **Status sporocila = QoS 1 + retain**: novi naroceniki morajo takoj videti zadnje znano stanje naprave.
- **Real-time analytics = QoS 1 + retain**: spletni klient se lahko naroci kadarkoli in dobi zadnjo vrednost takoj.

## 5. Last Will Testament (LWT)

Mobilna aplikacija ob povezavi s brokerjem nastavi LWT:

```json
{
  "topic":   "smart-playgrounds/devices/<deviceId>/status/online",
  "payload": "{ \"online\": false, \"reason\": \"unexpected-disconnect\" }",
  "qos":     1,
  "retain":  true
}
```

Tako tudi nepricakovano izklopljena naprava sporoci offline status.
Backend ta dogodek upostevi pri stetju trenutno povezanih naprav
(SCRUM-46, SCRUM-47).

## 6. Wildcard naroci (subscribe)

| Naroci | Pomen |
|---|---|
| `smart-playgrounds/devices/+/sensors/gps` | vse GPS meritve vseh naprav (uporablja backend ingestion) |
| `smart-playgrounds/devices/+/sensors/+` | vsi senzorji vseh naprav (samo za debug/dev orodja) |
| `smart-playgrounds/devices/+/status/#` | vsa status sporocila vseh naprav (uporablja "kdo je online") |
| `smart-playgrounds/analytics/#` | vsi izvedeni analiticni topici (uporablja spletni dashboard) |

## 7. Rezervirani podprefiksi

Vsi topici se zacnejo s `smart-playgrounds/`. Znotraj tega namespace-a
hranimo naslednje podprefikse za prihodnje uporabe — ne uporabljajte
jih za druge namene:

- `smart-playgrounds/system/...` — interna sporocila brokerja in monitoring skripte (SCRUM-43)
- `smart-playgrounds/analytics/...` — izhodi obdelovalnih cevovodov (poglavje 4 v `er-model.md`)
- `smart-playgrounds/commands/...` — ukazi proti napravam (npr. povecaj frekvenco vzorcenja)

## 8. Sklic

- [`mosquitto.conf`](./mosquitto.conf) — broker konfiguracija
- [`docker-compose.yml`](./docker-compose.yml) — kontejnerizacija
- [`../../RAI/schemas/sensor-measurement.schema.json`](../../RAI/schemas/sensor-measurement.schema.json) — JSON shema meritev
- [`../../RAI/database/er-model.md`](../../RAI/database/er-model.md) — `deviceId` konvencija
