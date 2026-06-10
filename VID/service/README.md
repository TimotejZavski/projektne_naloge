# ORV storitev (racunalniski vid)

FastAPI servis, ki demo videe gosti kot "kamera" toke in hrani konfiguracijo
kamere/kalibracije na igrisce. Del Smart Playgrounds (SCRUM-65..68).

## Lokalni zagon

```bash
cd VID
.venv/Scripts/python.exe -m uvicorn service.orv.main:app --reload --port 8000
```

Zdravje: <http://localhost:8000/health>

API dokumentacija: <http://localhost:8000/docs>

## Docker zagon (SCRUM-67)

ORV storitev lahko zazenemo tudi kot samostojen Docker vsebnik. Docker slika
vkljuci FastAPI servis, OpenCV sistemske knjiznice in Python odvisnosti iz
`requirements.txt`.

```powershell
cd VID/service
Copy-Item .env.example .env
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://localhost:8000/health
```

Swagger dokumentacija je nato dostopna na <http://localhost:8000/docs>.

Docker Compose uporabi dva bind mounta:

- `./media:/app/service/media` za lokalne runtime podatke, kalibracije, zajete
  frame-e in rezultate obdelave,
- `../dataset/valid/videos:/app/dataset/valid/videos:ro` za demo video tokove,
  kadar so prisotni lokalno.

Za preverjanje konfiguracije brez zagona servisa:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\validate-docker.ps1
```

Ko je vsebnik ze zagnan, lahko dodamo se health preverjanje:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\validate-docker.ps1 -CheckHealth
```

## "Nasa stream povezava"

Storitev skenira `VID/dataset/valid/videos/` (nastavljivo z `ORV_STREAM_DIR`)
in vsak video izpostavi kot MJPEG tok:

```text
GET /streams              -> seznam povezav (id, name, url)
GET /streams/{id}         -> zivi MJPEG tok (kot mrezna kamera)
```

Te povezave (npr. `http://localhost:8000/streams/q4-side-300-330`) operater
prilepi v "+" dialog v RAI panelu.

## Tok dodajanja kamere na igrisce

```text
POST   /orv/courts                  {raiCourtId, streamUrl, name?} -> zajem frejma, status CALIBRATING
GET    /orv/courts                  seznam ORV-registriranih igrisc
GET    /orv/courts/{id}             zapis (status, kalibracija, frameUrl)
GET    /orv/courts/{id}/frame       zajeti frame za risanje igrisca
PUT    /orv/courts/{id}/calibration {corners:[{x,y}*4]} -> status READY
POST   /orv/courts/{id}/process     zagon detect/count/heatmap cevovoda
DELETE /orv/courts/{id}             odstrani registracijo
```

Vir za branje je enoten: nasa povezava se razresi na lokalno datoteko, prava
`rtsp://`/`http` povezava pa gre naravnost v `cv2.VideoCapture`; produkcijski
prehod ne zahteva spremembe kode.

## Okoljske spremenljivke

| var | privzeto | opis |
|---|---|---|
| `ORV_STREAM_DIR` | `VID/dataset/valid/videos` | mapa izvornih videov (kamer) |
| `ORV_MEDIA_DIR` | `service/media` | runtime podatki (gitignored) |
| `ORV_PYTHON` | trenutni Python | interpreter za detect/count/heatmap pipeline |
| `ORV_PUBLIC_URL` | `http://localhost:8000` | javni naslov za povezave |
| `ORV_CORS_ORIGINS` | `http://localhost:3000,...` | dovoljeni CORS izvori |
| `ORV_PROC_WIDTH` | `960` | sirina obdelave/predvajanja |
| `ORV_JPEG_QUALITY` | `80` | kakovost MJPEG/JPEG odgovorov |

Runtime podatki (`service/media/`) so lokalni in niso v gitu.
