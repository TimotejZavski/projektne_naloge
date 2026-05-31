# GitHub Actions

Projekt uporablja workflow `.github/workflows/ci.yml` za preverjanje pull
requestov in feature vej.

Preverjanja:

- RAI server: `npm ci` in `npm test`
- RAI client: `npm ci`, `npm test` in `npm run build`
- SA backup: `npm install` in `npm test`
- NPO aplikacija: Windows MAUI build za `net10.0-windows10.0.19041.0`
- Docker: build preverjanje za RAI sliko in SA backup sliko

Workflow ne vsebuje produkcijskih skrivnosti in ne izvaja samodejnega deploya.
Deploy na Render ali drugo okolje naj ostane locen korak z nastavitvami v
zunanjem okolju.
