# Log rotacija — Mosquitto (SCRUM-43)

MQTT broker zapisuje loge v Docker volume `mosquitto_log` (glej `SA/mqtt/docker-compose.yml`).

## Kje so logi

```bash
docker volume inspect mosquitto_log
# ali
docker exec smart-playgrounds-mqtt ls -la /mosquitto/log/
```

## Priporocilo za VPS

1. **Docker logging driver** (opcijsko): v `docker-compose.yml` nastavi `logging: max-size: 10m, max-file: 3` pri servisu `mosquitto`.
2. **logrotate** na hostu — ce mountas log volume na pot:

```bash
# /etc/logrotate.d/smart-playgrounds-mqtt
/var/lib/docker/volumes/mosquitto_log/_data/mosquitto.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
    copytruncate
}
```

3. **Monitoring log** `/var/log/rai-monitor.log` — enaka logrotate pravila:

```bash
# /etc/logrotate.d/rai-monitor
/var/log/rai-monitor.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
}
```

`copytruncate` je varen za procese, ki drzijo datoteko odprto (Mosquitto, cron redirect).
