# Scraper — Javna igrišča Maribor

Scraper zajema podatke o javnih otroških igriščih iz uradne spletne strani
Mestne občine Maribor in jih shrani v MongoDB za prikaz v dashboardu (zemljevid)
in spletni aplikaciji.

**Vir:** https://maribor.si/mestni-servis/otroci/javna-igrisca/

## Kaj se scrape-a

Stran uporablja WordPress paginacijo (`?stran=1..5`), vsaka stran vsebuje
HTML tabelo v `div.pins_table_wrap_parent > table`. Vsaka vrstica ima:

| Stolpec | Primer |
|---------|--------|
| Ime igrišča | Igrišče Mestni park |
| Naslov | Igrala V Mestnem Parku MB, Maribor |
| Povezava | (prazno) |

Skupaj ~37 igrišč na 5 straneh.

## Geokodiranje

Ker stran ne vsebuje GPS koordinat, scraper **geokodira naslove prek Nominatim
API-ja** (OpenStreetMap, brezplačno, max 1 req/s). Za znane lokacije so
koordinate že ročno vnešene v `MANUAL_GEOCODE` (PlaygroundScraper.js), kar
pospeši scrape.

Rezultat: vsako igrišče dobi `location: { latitude, longitude }` za prikaz
na OpenStreetMap zemljevidu.

## Struktura

```
src/scraper/
  ├── index.js                # barrel export
  ├── sources.js              # definicije virov
  └── PlaygroundScraper.js    # scrape + ekstrakcija + geokodiranje

src/models/Playground.js      # Mongoose model

src/controllers/scraper.controller.js   # runScraper, listPlaygrounds
src/routes/scraper.routes.js           # /api/scraper/*
```

## API endpointi

| Metoda | Pot | Avtentikacija | Opis |
|--------|-----|---------------|------|
| `POST` | `/api/scraper/run` | requireAuth | Sproži scrape vseh 5 strani, geokodira in shrani v bazo |
| `GET` | `/api/scraper/playgrounds` | javno | Vrne vsa shranjena igrišča z lokacijami |

### Primer odgovora `POST /run`:

```json
{
  "summary": {
    "totalScraped": 37,
    "totalGeocoded": 35,
    "inserted": 35,
    "updated": 0,
    "skipped": 2,
    "skippedDetails": [
      {"name": "Igrala Zrkovci", "reason": "geocoding_failed"}
    ],
    "errors": []
  }
}
```

### Primer odgovora `GET /playgrounds`:

```json
{
  "playgrounds": [
    {
      "name": "Igrišče Mestni park",
      "address": "Igrala V Mestnem Parku MB, Maribor",
      "location": {"latitude": 46.5607, "longitude": 15.6451},
      "sourceUrl": "https://maribor.si/mestni-servis/otroci/javna-igrisca/",
      "scrapedAt": "2026-05-26T..."
    }
  ],
  "count": 35
}
```

## Zagon

```bash
cd RAI/server

# Smoke test (preveri parsanje in realni scrape)
npm run scraper:smoke

# Ročno proženje prek API-ja (potrebuje running server)
curl -X POST http://localhost:5000/api/scraper/run \
  -H "Authorization: Bearer <jwt_token>"

# Branje igrišč
curl http://localhost:5000/api/scraper/playgrounds
```

## Idempotentnost

`POST /run` uporablja `findOneAndUpdate` z `upsert: true` na ključu
`(sourceId, name)`. Ponoven zagon istega vira **ne podvoji** zapisov,
ampak posodobi naslov, lokacijo in `scrapedAt`.

## Ročne koordinate

Za igrišča, kjer Nominatim ne vrne pravilnih koordinat (ali vrne napačne),
dodaj vnos v `MANUAL_GEOCODE` mapo v `PlaygroundScraper.js`. Koordinate
lahko dobiš z desnim klikom na OpenStreetMap → "Prikaži naslov".
