# Požarni zid (SCRUM-42)

`ufw` na **Linux VPS**, kjer tece celoten Docker stack (`SA/setup.sh`).  
**Render** tega ne potrebuje — tam varnost uredi platforma.

## Arhitektura

```
Internet
   |
   |  :22 SSH (opcijsko samo fakultetna IP)
   |  :80 / :443  reverse proxy (Caddy/Nginx) -> React + /api
   v
 [ VPS + ufw ]
   |
   +-- Docker mreza smart-playgrounds (interno)
         mongo:27017
         backend:5000
         mosquitto:1883
```

Uporabniki dostopajo do spletne strani in API-ja **preko 443**, ne direktno na port 5000.  
MongoDB in MQTT **nikoli** nista javna — povezava z [`AUTH.md`](../../RAI/server/AUTH.md) (produkcijski checklist).

## Porti

| Port | Servis | ufw | Opomba |
|------|--------|-----|--------|
| 22 | SSH | allow | omeji z `ALLOWED_SSH_CIDR` v `ufw.env` |
| 80 | HTTP | allow | redirect na HTTPS |
| 443 | HTTPS | allow | frontend + API preko reverse proxy |
| 5000 | RAI backend | **deny** | samo interno / localhost za proxy |
| 27017 | MongoDB | **deny** | samo Docker mreza |
| 1883 | MQTT | **deny** | NPO/RAI preko interne mreze |
| 9001 | MQTT WebSocket | **deny** | dev only, na VPS zaprto |

## Namestitev

```bash
cd SA
./setup.sh                              # 1. stack tece

cd firewall
cp ufw.env.example ufw.env              # 2. nastavi ALLOWED_SSH_CIDR
sudo ./ufw-rules.sh                     # 3. aktiviraj pravila
sudo ufw status verbose                 # 4. preveri
```

## Docker + ufw (pomembno)

Docker lahko **obide ufw** za porte iz `ports:` v `docker-compose.yml`.  
Na VPS zato:

- odstrani `ports:` pri `mongo` in `mosquitto`, **ali**
- bindaj na localhost: `127.0.0.1:5000:5000` (reverse proxy na istem hostu)

Lokalni razvoj (macOS/Windows) ufw **ne zaganjaj** — tam so porti namenoma odprti za debug.

## Datoteke

| Datoteka | Namen |
|---|---|
| [`ufw-rules.sh`](./ufw-rules.sh) | idempotentno nastavi in omogoci ufw |
| [`ufw.env.example`](./ufw.env.example) | predloga za SSH CIDR |
