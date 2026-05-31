# MQTT broker (Mosquitto) - navodila za zagon

Naloge: **SCRUM-14** (setup), **SCRUM-36** (config), **SCRUM-37** (Docker
container + integracija z backendom).

Ta mapa vsebuje vso potrebno konfiguracijo za zagon Mosquitto brokerja
v lokalnem razvojnem okolju in osnovo za prehod v produkcijo (SCRUM-42).

Broker se da zagnati na dva podprta nacina:

- **standalone** preko `SA/mqtt/docker-compose.yml` (samo broker, brez backenda)
- **integrirano** preko `RAI/server/docker-compose.yml` (mongo + broker + backend
  na eni mrezi z service-name DNS)

Source-of-truth za `mosquitto.conf` je v tej mapi v obeh primerih.

## Vsebina

| Datoteka | Namen |
|---|---|
| [`mosquitto.conf`](./mosquitto.conf) | konfiguracija brokerja (listenerji, persistenca, logiranje) |
| [`mosquitto.secure.example.conf`](./mosquitto.secure.example.conf) | varnostni template brez anonimnega dostopa |
| [`acl.example`](./acl.example) | primer ACL pravil za NPO, RAI, monitoring in dashboard |
| [`validate-config.ps1`](./validate-config.ps1) | osnovno preverjanje skladnosti SCRUM-36 konfiguracije |
| [`topics.md`](./topics.md) | zavezujoca topic struktura projekta (prefix `smart-playgrounds/`) |
| [`docker-compose.yml`](./docker-compose.yml) | standalone broker container (SCRUM-36 + SCRUM-37) |
| [`scripts/smoke-test.sh`](./scripts/smoke-test.sh) | end-to-end preverjanje brokerja (SCRUM-37) |

## Predpogoji

- Docker Desktop (Windows / macOS) **ali** Docker Engine (Linux)
- prosti vrati 1883 (MQTT) in 9001 (WebSocket)

## SCRUM-36 konfiguracijski profil

Za lokalni razvoj se uporablja `mosquitto.conf`. Ta profil:

- odpira MQTT listener na `1883`,
- odpira WebSocket listener na `9001`,
- omogoca anonimni dostop samo za razvojno testiranje,
- vklopi persistenco sej in logiranje,
- ne vsebuje gesel ali skrivnosti.

Za varnostno pripravljeno okolje se uporabi
`mosquitto.secure.example.conf` skupaj z `acl.example`. Pred uporabo ga
kopiraj v Mosquitto config mapo in lokalno ustvari `passwd`:

```bash
mosquitto_passwd -c passwd npo-publisher
mosquitto_passwd passwd rai-consumer
mosquitto_passwd passwd monitoring
mosquitto_passwd passwd web-dashboard
```

Datoteke `passwd` ne commitaj v repozitorij.

## Preverjanje konfiguracije

Iz mape `SA/mqtt`:

```powershell
.\validate-config.ps1
```

Skripta preveri, da razvojni config, varnostni template in ACL primer
vsebujejo zahtevane listenerje, varnostne nastavitve in osnovne topic
pravice.

## Zagon brokerja

Imamo **dva podprta nacina zagona** — izberi glede na to, kaj testiras:

### Standalone (samo broker, brez backenda) — SCRUM-36

Primeren za NPO mobilni razvoj, kjer ti backend ni potreben:

```bash
docker compose -f SA/mqtt/docker-compose.yml up -d
docker ps --filter name=smart-playgrounds-mqtt
docker logs -f smart-playgrounds-mqtt
docker compose -f SA/mqtt/docker-compose.yml down       # ohrani podatke
docker compose -f SA/mqtt/docker-compose.yml down -v    # tudi izbrisi podatke
```

Container ime: `smart-playgrounds-mqtt`. Vrata: 1883 + 9001 na host.

### Integriran zagon (broker + mongo + backend skupaj) — SCRUM-37

Cel dev stack se vzpostavi z eno komando:

```bash
cd RAI/server
cp .env.docker.example .env.docker          # in nastavi sekrete!
docker compose up -d --build
docker compose ps                            # vsi servisi 'healthy'
docker compose logs -f                       # zdruzeni logi
```

Container imena: `rai-mqtt`, `rai-mongo`, `rai-backend`. Vsi servisi
na `rai-network`, dosegljivi medsebojno preko service name DNS:

- `mongodb://mongo:27017/rai`
- `mqtt://mosquitto:1883`
- `http://localhost:5000`

Source-of-truth za broker konfiguracijo je **`SA/mqtt/mosquitto.conf`**
v obeh nacinih — integrirani compose ga bind-mounta iz `../../SA/mqtt/`,
da je sprememba enkrat narejena vidna povsod.

> Obe compose datoteki **lahko tecejo hkrati** (razlicni container imeni,
> volumes in mreze). Pred mesanjem preveri, da imata host vrata 1883 in
> 9001 dovolj prostora — drugi zagon prevzeme drugacne vrednosti preko
> `MQTT_PORT` / `MQTT_WS_PORT` env spremenljivk v `.env.docker`.

## Hiter test brez kode

V dveh locenih oknih (Mosquitto orodja so v sliki, lahko jih uporabis
preko `docker exec`). Container ime spodaj je za standalone zagon —
za integriran zagon zamenjaj `smart-playgrounds-mqtt` z `rai-mqtt`.

**Naroci se na vse meritve neke testne naprave:**

```bash
docker exec -it smart-playgrounds-mqtt \
  mosquitto_sub -h localhost -t "smart-playgrounds/devices/test-azur/sensors/+" -v
```

**V drugem oknu objavi testno meritev:**

```bash
docker exec -it smart-playgrounds-mqtt \
  mosquitto_pub -h localhost -t "smart-playgrounds/devices/test-azur/sensors/gps" -m '{
    "schemaVersion": "1.0",
    "deviceId": "test-azur",
    "sensorType": "gps",
    "timestampUtc": "2026-05-08T18:00:00Z",
    "data": { "latitude": 46.5547, "longitude": 15.6459 }
  }'
```

V prvem oknu mora takoj izpisati prejeti payload. Ce ne, glej razdelek
"Tezave".

## Avtomatiziran end-to-end test (SCRUM-37)

Za hermeticni preizkus celotne verige (compose validacija → pravilni
listenerji v logu → MQTT round-trip → WebSocket dosegljivost) zazeni:

```bash
bash SA/mqtt/scripts/smoke-test.sh
```

Skripta zaganja vse v locenih throwaway containerjih (z unikatnimi
imeni na `$$-$RANDOM`), tako da ne moti standalone ali integriranega
zagona, ki ga morda ze imas pokoncu. trap na EXIT pociscuje resurse
tudi ob napaki ali Ctrl-C.

Sedem korakov, vsak preveri eno trditev:

1. `docker compose config` validira `SA/mqtt/docker-compose.yml`
2. `eclipse-mosquitto:2.0` je pullable
3. Broker se zazene s priklopljenim `SA/mqtt/mosquitto.conf`
4. Broker sprejema `mosquitto_sub` CONNECT (30s readiness)
5. Oba listenerja (MQTT 1883 + WebSocket 9001) sta v startup logu
6. `mosquitto_pub` -> `mosquitto_sub` round-trip na wildcardu
   `smart-playgrounds/devices/+/sensors/+` deluje s pravim payloadom
7. TCP-level dosegljivost porta 9001 (WS handshake covers brskalniski
   klient v produkciji)

Exit 0 samo na popolnem uspehu; vsaka napaka pove tocno na katerem
koraku.

## Povezava iz mobilne aplikacije (NPO)

```
Host:     <ip-host-stroja>      (npr. 192.168.1.10, NE 'localhost' iz mobilnega telefona)
Port:     1883
Protokol: mqtt
QoS:      glej topics.md
```

`MqttSensorPublisher` v `NPO/NPO-Aplikacija/Services/` mora pri vzpostavitvi
povezave nastaviti **Last Will** sporocilo (glej `topics.md`, poglavje 5).

## Povezava iz backenda (RAI)

V `RAI/server/` (SCRUM-20) bo MQTT subscriber poslusal:

```
smart-playgrounds/devices/+/sensors/gps
smart-playgrounds/devices/+/sensors/accelerometer
smart-playgrounds/devices/+/status/#
```

in vpisoval prejete meritve v MongoDB kolekcijo `sensor_measurements`
po validaciji proti shemi `RAI/schemas/sensor-measurement.schema.json`.

## Tezave

| Simptom | Resitev |
|---|---|
| `Address already in use` na vratih 1883 | drug Mosquitto / iot servis tece lokalno; ustavi ga ali spremeni mapping v `docker-compose.yml` |
| `Connection refused` iz mobilne naprave | `localhost` na telefonu pomeni telefon, ne razvojni racunalnik. Uporabi LAN IP. |
| Sporocila ne pridejo do subscriberja | preveri, da topic v `pub` in `sub` natanko ujema (vkljucno z velikostjo crk) |
| Broker se ne zazene | `docker logs smart-playgrounds-mqtt`; najpogostejsi vzrok je napaka v `mosquitto.conf` |

## Pred prehodom v produkcijo (SCRUM-42)

- nastavi `allow_anonymous false` in dodaj `password_file`
- omeji listener na interni Docker network namesto `0.0.0.0`
- v ufw (SCRUM-42) odpri vrata 1883 samo za backend container (po PDF terminskem planu)
- razmisli o TLS listenerju na 8883 za zunanji dostop

## Sklic

- [`topics.md`](./topics.md) — uradna topic specifikacija
- [`../../RAI/schemas/sensor-measurement.schema.json`](../../RAI/schemas/sensor-measurement.schema.json) — JSON shema, ki jo broker preposilja
- Mosquitto dokumentacija: <https://mosquitto.org/documentation/>
