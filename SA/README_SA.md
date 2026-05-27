# Verzioniranje kode projekta (20 točk)

V sklopu projektnih aktivnosti, boste pri predmetu Sistemska administracija skrbeli za ustrezno shranjevanje programske kode, pripravo razvojnega in produkcijskega okolja ter skrbeli za varnost vašega sistema. Za ustrezno shranjevanje programske kode boste uporabili sistem za verzioniranje git. Vsaka projektna mikro skupina mora ustvariti repozitorij v svoji organizaciji na githubu. Nato mora v tem repozitoriju skrbno dodajati nove funkcionalnosti iz vseh projektnih predmetov. Vsak nov večji "feature" mora obvezno potovati skozi novo vejo razvoja, nato pa se po "intenzivnem" testiranju vključi v glavno vejo z PR (pull request). Mikro skupina bo pri tej nalogi dobile točke takrat, ko bo izkazala naslednje:

- smiselno strukturiranje napredka projekta po fazah,
- uporaba vejenja programske kode pri dodajanju večjih funkcionalnosti, kjer se vsak večji feature doda v glavno vejo s PR. Vsak član mora sprožiti vsaj 2 PR:  (5 točk),
- vsaj 20 "commitov" posameznega uporabnika oz. njegovega prispevka k nastajanju projekta, pri vsakem projektnem predmetu (5 točk),
- vsi "commiti" morajo biti izvedeni v nekem širšem časovnem obdobju (tj. da se vidi napredek skozi čas oz. da niste naredili vseh commitov in dela v zadnjem dnevu) (2 točk)
- ko boste prevzeli "nalogo" za razvoj, boste VEDNO naredili novo vejo, v katerem boste feature potem tudi implementirali (8 točk)

Svetujemo vam, da se repozitorij organizira v mape, kjer bo vsaka mapa namenjena posameznemu predmetu.

V okviru tega predmeta boste izdelali tudi terminski plan projekta, katerega stanje se bo tudi ustrezno preverjalo (vsaj 2x). Stanje projekta se bo spremljajo čez preostanek semestra. To kar bo zapisano v terminskem planu, so more videti tudi v sledeh na repozitoriju. Za lažje sledenje, boste naloge v terminskem planu zapisali v orodje Jira.

## Dokumentacija projekta (20 točk)

Za vse projektne predmete boste pripravili dokumentacijo za namestitev in vsaj 2 primera uporabe. Predvidevati morate, da je dokumentacija za namestitev pripravljena za laike. (20 točk)

## Priprava terminskega plana projekta in projektno vodenje (20 točk)

Vsaka mikorskupina mora pripraviti terminski plan izvedbe projekta. V planu mora biti razvidno, kako boste funkcionalnosti pri projektu implementirali po posameznih fazah. Da boste lahko pripravili plan, se morate znotraj skupine posvetovati o načinu izvedbe projekta (kaj dejansko želite narediti). Plan projektnih aktivnosti mora zajemati vse projektne predmete. Npr. pri tem predmetu boste morali poskrbeti za ustrezne namestitve okolja, knjižnic, vzpostaviti boste morali ekosistem, v katerem bo vaša aplikacija živela. Med drugim boste morali razmisliti o varnosti aplikacije (uporaba požarnega zidu na zaledju). Seveda ne pozabite na uporabo git-a. Dokument, ki ga boste pripravili vam bo služil kot osnova za nadaljnji razvoj projekta. Dokument razdelite na 2 fazi. Prvi del naj predvsem zajema vzpostavitve okolij pri posameznih predmetih, drugi del naj zajema glavnino implementacij algoritmov integracijo "storitev" in algoritmov v končni produkt in testiranje. Napišite torej strukturirano poročilo, ki bo zajemalo terminski plan izvedbe. To poročilo boste v obliki taskov nato zapisali v orodju Jira, kjer boste poskrbeli, da boste ustrezno načrtovali delo in ga delegirali posameznem članu. Poročilo naj obsega vsaj 10 strani vsebine. Stanje taskov bomo redno spremljali v zadnjem delu semestra. (20 točk).

## Uporaba Dockerja (20 točk)

Razmislite, kako boste vašo aplikacijo v celoti/delno zapakirali v Docker zabojnike. Celoten sistem vašega projekta se more vzpostaviti zgolj z eno skripto. Vsak član mikroskupine naj bo zadolžen za kontejnerizacijo vsaj ene funkcionalnosti. (20 točk). 

## CI/CD cevovod (20 točk)

Vsak član miksroskupine bo zadolžen, da za določeno kodo v okviru projekta napiše teste, ki jih boste potem lahko uporabljali v okviru github actions. Hkrati poskrbite tudi za deploy končnega izdelka/sistema na dockerhub repozitorij. (20 točk).

## 100 t

Rok oddaje do	7. 6. 2026 ob 23:55:00

Naloga je obvezna	Število oddaj: 0/3

## 3.	Projektna naloga

Oddajte terminski plan vašega projekta, z vsemi aktivnostmi pri posmaeznih projektnih predmetih.

Rok oddaje do	26. 4. 2026 ob 23:55:00

Naloga je obvezna	Število oddaj: 0/3



## Avtomatizirana namestitev in zagon (SCRUM-38)

Celoten lokalni stack (MongoDB + RAI backend + MQTT broker) se vzpostavi z enim ukazom.

### Predpogoji

- Docker Desktop (macOS/Windows) ali Docker Engine (Linux)
- Prosti porti: `5000` (backend), `27017` (MongoDB), `1883` / `9001` (MQTT)

### Hitri zagon

```bash
# iz korena repozitorija
./SA/setup.sh

# ali iz mape SA
cd SA && ./setup.sh
```

`setup.sh` naredi:

1. preveri Docker
2. ustvari `.env` iz `.env.example` in generira JWT sekrete
3. `docker compose up -d --build` (mongo + mosquitto + backend)
4. pocaka na healthcheck vseh servisov
5. inicializira MongoDB kolekcije (`RAI/database/init_script.js`, idempotentno)
6. smoke test (`/health`, Mongo ping, MQTT subscribe)

### Rocni zagon

```bash
cd SA
cp .env.example .env          # nastavi JWT sekrete
docker compose up -d --build
docker compose ps
curl http://localhost:5000/health
```

Ustavitev: `docker compose down` (podatki ostanejo) ali `docker compose down -v` (brise volumes).

### Render (produkcija RAI)

Render hosta samo RAI backend brez MQTT brokerja. Polni stack z MQTT tece lokalno ali na VPS preko `SA/setup.sh`. Na Render nastavi `MQTT_ENABLED=false`.

### Datoteke

| Datoteka | Namen |
|---|---|
| [`setup.sh`](./setup.sh) | glavni entry point |
| [`docker-compose.yml`](./docker-compose.yml) | orchestrator: mongo + backend + mosquitto |
| [`.env.example`](./.env.example) | predloga okoljskih spremenljivk |
| [`scripts/init-env.sh`](./scripts/init-env.sh) | priprava `.env` |
| [`scripts/wait-healthy.sh`](./scripts/wait-healthy.sh) | cakanje na healthcheck |
| [`scripts/init-db.sh`](./scripts/init-db.sh) | inicializacija MongoDB |
| [`scripts/smoke-test.sh`](./scripts/smoke-test.sh) | preverjanje delovanja |

## Požarni zid (SCRUM-42)

Na **Linux VPS** po `setup.sh` aktiviraj ufw — zapre direkten dostop do Mongo/MQTT/API portov, odpre 80/443 za reverse proxy in SSH.

```bash
cd SA/firewall
cp ufw.env.example ufw.env    # ALLOWED_SSH_CIDR = fakultetna IP
sudo ./ufw-rules.sh
```

Podrobnosti: [`firewall/README.md`](./firewall/README.md). Render ufw ne potrebuje.

---

opomba:
tu pride Dockerfile, docker-compose.yml, GitHub Actions skripte (.github/workflows), nastavitve požarnega zidu (npr. iptables rules), skripte za namestitev (setup.sh), Jira exporte ipd.