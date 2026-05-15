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
