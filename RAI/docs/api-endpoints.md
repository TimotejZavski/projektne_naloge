# SCRUM-34 API endpointi za branje podatkov

Backend bere iz lokalne MongoDB baze prek query layerja v `RAI/server/src/query`.
UI naj uporablja spodnje specifične endpointe, ker vračajo stabilen JSON
format:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 0
  }
}
```

## Endpointi

| Metoda | Pot | Namen |
| --- | --- | --- |
| `GET` | `/health` | Preverjanje delovanja serverja |
| `GET` | `/api/playgrounds` | Seznam igrisc za UI prikaz |
| `GET` | `/api/playgrounds/nearby` | Igrisca okoli koordinat z uporabo `2dsphere` indeksa |
| `GET` | `/api/sensor-measurements` | Surove meritve za real-time ali diagnostični pregled |
| `GET` | `/api/query/devices/:deviceId` | Naprava z zadnjimi meritvami prek `$lookup` |
| `GET` | `/api/reservations` | Rezervacije po uporabniku, igriscu ali statusu |
| `GET` | `/api/weather-logs` | Vremenski zapisi iz zunanjih virov |
| `GET` | `/api/analytics` | Agregirani podatki za grafe |
| `GET` | `/api/query/:collection` | Varovan fallback za dovoljene kolekcije |
| `GET` | `/api/query/:collection/:id` | Branje posameznega dokumenta po Mongo `_id` |

## Skupni query parametri

- `page` in `limit` za paginacijo, privzeto `page=1&limit=50`.
- `from` in `to` za casovni filter, kjer endpoint izbere smiselno polje
  (`timestampUtc`, `startsAtUtc`, `fetchedAtUtc` ali `periodStartUtc`).
- `sortBy` in `sortDirection=asc|desc`, omejeno na dovoljena polja endpointa.

## Primeri

```http
GET /api/playgrounds?q=park&sport=basketball&page=1&limit=20
GET /api/playgrounds/nearby?lat=46.5547&lng=15.6459&radiusMeters=1000
GET /api/sensor-measurements?deviceId=device-1&sensorType=gps&limit=25
GET /api/query/devices/device-1&limit=25
GET /api/analytics?type=playground_popularity_hourly&from=2026-05-01
```

Output pipeline pretvori `_id` v `id`, datume v ISO stringe in odstrani
notranja polja, kot sta `__v` in `passwordHash`.
