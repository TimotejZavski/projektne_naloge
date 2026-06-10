# ORV storitev (računalniški vid)

FastAPI servis, ki demo videe gosti kot "kamera" toke in hrani konfiguracijo
kamere/kalibracije na igrišče. Del Smart Playgrounds (SCRUM-65..68).

## Zagon

```bash
cd VID
.venv/Scripts/python.exe -m uvicorn service.orv.main:app --reload --port 8000
```

Zdravje: <http://localhost:8000/health> · API docs: <http://localhost:8000/docs>

## "Naša stream povezava"

Storitev skenira `VID/dataset/valid/videos/` (nastavljivo z `ORV_STREAM_DIR`)
in vsak video izpostavi kot MJPEG tok:

```
GET /streams              -> seznam povezav (id, name, url)
GET /streams/{id}         -> živi MJPEG tok (kot mrežna kamera)
```

Te povezave (npr. `http://localhost:8000/streams/q4-side-300-330`) operater
prilepi v "+" dialog v RAI panelu.

## Tok dodajanja kamere na igrišče

```
POST   /orv/courts                  {raiCourtId, streamUrl, name?} -> zajem frejma, status CALIBRATING
GET    /orv/courts                  seznam ORV-registriranih igrišč
GET    /orv/courts/{id}             zapis (status, kalibracija, frameUrl)
GET    /orv/courts/{id}/frame       zajeti frame za risanje igrišča
PUT    /orv/courts/{id}/calibration {corners:[{x,y}*4]} -> status READY
DELETE /orv/courts/{id}             odstrani registracijo
```

Vir za branje je enoten: naša povezava se razreši na lokalno datoteko, prava
`rtsp://`/`http` povezava pa gre naravnost v `cv2.VideoCapture` — produkcijski
prehod brez spremembe kode.

## Okoljske spremenljivke

| var | privzeto | opis |
|---|---|---|
| `ORV_STREAM_DIR` | `VID/dataset/valid/videos` | mapa izvornih videov (kamer) |
| `ORV_MEDIA_DIR` | `service/media` | runtime podatki (gitignored) |
| `ORV_PUBLIC_URL` | `http://localhost:8000` | javni naslov za povezave |
| `ORV_CORS_ORIGINS` | `http://localhost:3000,...` | dovoljeni CORS izvori |
| `ORV_PROC_WIDTH` | `960` | širina obdelave/predvajanja |

Runtime podatki (`service/media/`) so lokalni in niso v gitu.
