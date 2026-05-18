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
