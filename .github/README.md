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

## publish.yml

Sprozi se **po uspesni izvedbi** `ci.yml` na `main` veji. Zgradi in objavi
Docker slike na Docker Hub:

- `smart-playgrounds/rai-backend` — RAI backend (Node.js)
- `smart-playgrounds/sap-backup` — SA backup servis (Node.js + mongodump)

Vsaka slika dobi dve oznaki:

- `latest` — zadnja uspesna izdaja
- `git-short-sha` (npr. `a1b2c3d`) — natancen commit

### Potrebni GitHub secrets

| Secret            | Opis                                  |
|-------------------|---------------------------------------|
| `DOCKER_USERNAME` | Docker Hub uporabnisko ime            |
| `DOCKER_PASSWORD` | Docker Hub access token (ali geslo)   |

Ce ne zelis samodejne objave, preprosto ne nastavi teh secretov — workflow
se bo sprozil, a padel pri login koraku.
