# Monitoring (SCRUM-43)

Cron skripte za VPS, kjer tece Docker stack. Opazijo padec backend-a, MQTT brokerja ali poln disk.

**Render:** uporabi [Health Checks](https://render.com/docs/health-checks) na `/health` + email alerts v dashboardu — cron na Render ne tece.

## Kaj preverjamo

| Skripta | Interval | Preveri |
|---------|----------|---------|
| `check-health.sh` | 5 min | `GET /health`, Docker containere, MQTT subscribe |
| `check-disk.sh` | 1 h | `df` root partition >= `DISK_THRESHOLD` |
| `backup-mongo.sh` | 02:00 | `mongodump` iz `rai-mongo` containerja |

Ob napaki: zapis v `/var/log/rai-monitor.log` + opcijsko Discord webhook.

## Hitra namestitev

```bash
cd SA/monitoring
cp monitoring.env.example monitoring.env   # DISCORD_WEBHOOK_URL, poti
chmod +x *.sh

# rocni test
./check-health.sh
./check-disk.sh

# cron (popravi pot do repozitorija)
crontab -e    # glej crontab.example
```

## Health endpoint

Backend ze izpostavlja [`GET /health`](../../RAI/server/src/app.js) z `status`, `database`, `uptimeSec`. Monitoring preveri HTTP 200 in da Mongo ni `disconnected`.

## Log rotacija

Mosquitto log volume in `rai-monitor.log` — glej [`log-rotate.md`](./log-rotate.md).

## Datoteke

| Datoteka | Namen |
|---|---|
| [`check-health.sh`](./check-health.sh) | backend + docker + MQTT |
| [`check-disk.sh`](./check-disk.sh) | alarm ob polnem disku |
| [`backup-mongo.sh`](./backup-mongo.sh) | dnevni mongodump |
| [`alert.sh`](./alert.sh) | log + Discord webhook |
| [`monitoring.env.example`](./monitoring.env.example) | konfiguracija |
| [`crontab.example`](./crontab.example) | primer cron vnosov |

Povezava: [`AUTH.md`](../../RAI/server/AUTH.md) (produkcijski checklist), [`DOCKER.md`](../../RAI/server/DOCKER.md).
