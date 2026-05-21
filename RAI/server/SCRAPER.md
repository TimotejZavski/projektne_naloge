# Scraper

SCRUM-31 doda osnovno strukturo za zajem podatkov iz zunanjih virov.

Trenutno je scraper namerno locen od API ingestion in DB pipeline dela. To pomeni, da lahko lokalno pobere surove podatke iz konfiguriranih virov ali fixture datotek, naslednji task pa iz tega izlusci uporabne podatke.

## Struktura

- `src/scraper/sources.js` - seznam virov podatkov
- `src/scraper/HttpSourceClient.js` - branje fixture datotek ali HTTP virov
- `src/scraper/ScraperRunner.js` - skupen tok za zbiranje surovih podatkov
- `src/scraper/fixtures/` - lokalni vzorcni podatki za testiranje brez zunanjega API-ja
- `scripts/smoke-scraper-structure.js` - hiter smoke test

## Zagon

```bash
cd RAI/server
npm run scraper:smoke
```

Smoke test trenutno uporablja lokalni fixture, zato ne potrebuje delujoce baze, API endpointov ali omrezja.

## Ekstrakcija podatkov

SCRUM-32 doda ekstrakcijo relevantnih podatkov iz surovih scraper rezultatov.
Trenutno je podprt primer prometnih stevcev, ki vrne normalizirane zapise z
lokacijo, stevilom vozil, povprecno hitrostjo in casom meritve.

```bash
cd RAI/server
npm run scraper:extract:smoke
```

Ta korak samo pripravi podatke za nadaljnjo obdelavo. Ne klice API-ja in ne
zapisuje v MongoDB, zato ne posega v SCRUM-33 ali SCRUM-35.

## Vnos podatkov v bazo (SCRUM-33)

SCRUM-33 doda celoten **scraper -> extractor -> MongoDB** tok in API
endpoint-e za branje stanovanih meritev.

### Komponente

- `src/models/TrafficCounterMeasurement.js` - Mongoose model
  (unique compound index `(sourceId, stationId, measuredAt)` -> idempotentnost)
- `src/scraper/ingestion/ScraperIngestionService.js` - vnos logika
  (`ingestExtracted`, `runPipeline`)
- `src/routes/scraper.routes.js` + `src/controllers/scraper.controller.js`
  - rest API za sprozeni in branje

### API endpointi (vsi zahtevajo prijavo)

| Metoda | Pot | Opis |
| --- | --- | --- |
| `POST` | `/api/scraper/run` | Sprozi pipeline za vse vire ali podan podseznam (`{ sourceIds: ["..."] }`). V `NODE_ENV=production` samo admin role. |
| `POST` | `/api/scraper/output` | Sprejme ze ekstrahiran scraper output (`{ records: [...] }`) in ga poslje v DB ingestion pipeline. V `NODE_ENV=production` samo admin role. |
| `GET`  | `/api/scraper/measurements` | Bere shranjene meritve s filtri `sourceId`, `stationId`, `from`, `to`, `limit` (default 100, max 1000). |
| `GET`  | `/api/scraper/stations` | Distinct postaje z zadnjo meritvijo (za select v UI / popup na zemljevidu). |

Odgovor `POST /run` vrne podroben `summary`:

```json
{
  "summary": {
    "sourcesAttempted": 1,
    "sourcesOk": 1,
    "sourcesFailed": 0,
    "extractedCount": 2,
    "ingestion": {
      "totalCount": 2,
      "insertedCount": 2,
      "modifiedCount": 0,
      "matchedCount": 0,
      "skippedCount": 0,
      "skipped": [],
      "errors": []
    },
    "failedSources": []
  }
}
```

### Smoke test

```bash
cd RAI/server
npm run scraper:ingest:smoke
```

Skripta uporabi `mongodb-memory-server`, zato ne potrebuje produkcijskega
Mongo-ja. Preveri tudi idempotentnost: drugi run ne sme vstavit novih
zapisov.

### Idempotentnost in upsert semantika

`ingestExtracted` uporabi `updateOne(..., { upsert: true })` z kljucem
`(sourceId, stationId, measuredAt)`. Posledice:

- Isti scraper snapshot, dvakrat zagnan -> `insertedCount = 0`
  (zapisi se prepoznajo kot dupli).
- Spremenjene metrike (`vehicleCount`, `averageSpeedKmh`) **se posodobijo**
  v obstojecem dokumentu (`modifiedCount > 0`).
- Nikoli ne brisemo zapisov - zgodovino ohranjamo.
