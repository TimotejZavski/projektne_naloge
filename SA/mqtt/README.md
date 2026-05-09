# MQTT broker (Mosquitto) - navodila za zagon

Naloga: **SCRUM-14 — MQTT streznik setup**

Ta mapa vsebuje vso potrebno konfiguracijo za zagon Mosquitto brokerja
v lokalnem razvojnem okolju in pripravo na produkcijski zagon (SCRUM-37,
SCRUM-38).

## Vsebina

| Datoteka | Namen |
|---|---|
| [`mosquitto.conf`](./mosquitto.conf) | konfiguracija brokerja (listenerji, persistenca, logiranje) |
| [`topics.md`](./topics.md) | zavezujoca topic struktura projekta |
| [`docker-compose.yml`](./docker-compose.yml) | kontejnerizacija brokerja |

## Predpogoji

- Docker Desktop (Windows / macOS) **ali** Docker Engine (Linux)
- prosti vrati 1883 (MQTT) in 9001 (WebSocket)

## Zagon brokerja

Iz korena repozitorija:

```bash
docker compose -f SA/mqtt/docker-compose.yml up -d
```

Preveri stanje:

```bash
docker ps --filter name=smart-playgrounds-mqtt
docker logs -f smart-playgrounds-mqtt
```

Ustavitev:

```bash
docker compose -f SA/mqtt/docker-compose.yml down
```

Brisanje persistentnih podatkov (samo ce zelis cisti zagon):

```bash
docker compose -f SA/mqtt/docker-compose.yml down -v
```

## Hiter test brez kode

V dveh locenih oknih (Mosquitto orodja so v sliki, lahko jih uporabis
preko `docker exec`):

**Naroci se na vse meritve neke testne naprave:**

```bash
docker exec -it smart-playgrounds-mqtt \
  mosquitto_sub -h localhost -t "devices/test-azur/sensors/+" -v
```

**V drugem oknu objavi testno meritev:**

```bash
docker exec -it smart-playgrounds-mqtt \
  mosquitto_pub -h localhost -t "devices/test-azur/sensors/gps" -m '{
    "schemaVersion": "1.0",
    "deviceId": "test-azur",
    "sensorType": "gps",
    "timestampUtc": "2026-05-08T18:00:00Z",
    "data": { "latitude": 46.5547, "longitude": 15.6459 }
  }'
```

V prvem oknu mora takoj izpisati prejeti payload. Ce ne, glej razdelek
"Tezave".

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
devices/+/sensors/gps
devices/+/sensors/accelerometer
devices/+/status/#
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

## Pred prehodom v produkcijo (SCRUM-37, SCRUM-42)

- nastavi `allow_anonymous false` in dodaj `password_file`
- omeji listener na interni Docker network namesto `0.0.0.0`
- v ufw (SCRUM-42) odpri vrata 1883 samo za backend container (po PDF terminskem planu)
- razmisli o TLS listenerju na 8883 za zunanji dostop

## Sklic

- [`topics.md`](./topics.md) — uradna topic specifikacija
- [`../../RAI/schemas/sensor-measurement.schema.json`](../../RAI/schemas/sensor-measurement.schema.json) — JSON shema, ki jo broker preposilja
- Mosquitto dokumentacija: <https://mosquitto.org/documentation/>
