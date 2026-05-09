# Validacija izbire virov podatkov

Naloga: **SCRUM-8 — Validacija izbire virov podatkov**

Ta dokument formalno potrjuje vire podatkov, ki so bili predlagani v
[`viri-podatkov.md`](./viri-podatkov.md) (SCRUM-5, Srećko). Za vsak vir
določa konkreten ponudnik, kriterije validacije ter primer klica, ki je
bil preverjen pred sprejetjem v projekt. Cilj je, da do začetka
implementacije (SCRUM-9, SCRUM-10, SCRUM-20) ni nobenega odprtega
vprašanja glede tega, *kateri* API uporabljamo in *zakaj*.

## 1. Kriteriji validacije

Vsak vir podatkov je bil ocenjen po naslednjih kriterijih. Vir je sprejet
le, če so izpolnjeni vsi obvezni kriteriji.

| Kriterij | Pomen | Status |
|---|---|---|
| **Licenca** | dovoljuje akademsko in nepridobitno uporabo | obvezno |
| **Brez avtentikacije** | brez API ključa za začetek razvoja | zaželeno |
| **Količinska omejitev** | dovoljuje vsaj nekaj sto klicev na dan | obvezno |
| **Format odziva** | JSON, kompatibilen z JSON shemami v `RAI/schemas/` | obvezno |
| **Geografsko pokritje** | pokriva območje Slovenije / Maribora | obvezno |
| **Stabilnost** | uradni javni servis ali široko uporabljen vir z uptime SLO | obvezno |
| **Svežina** | podatek se osvežuje vsaj enkrat na uro (vremenski) ali enkrat na teden (statični) | obvezno |
| **Dokumentacija** | uradna dokumentacija v angleščini | zaželeno |

---

## 2. Senzorski vir: mobilna naprava (NPO MAUI app)

| Lastnost | Vrednost |
|---|---|
| Vir | uporabnikova mobilna naprava preko aplikacije NPO |
| Senzorja | GPS (lokacija), pospeškomer (aktivnost) |
| Prenos | MQTT (primarni) ali HTTPS POST (rezervni) |
| Format | JSON po [`sensor-measurement.schema.json`](../schemas/sensor-measurement.schema.json) |
| Frekvenca | nastavljiva v aplikaciji, privzeto 1 Hz GPS, 10 Hz pospeškomer |
| Validacija | ✅ skladno z uvodom projekta in shemo SCRUM-5 |

**Razlog izbire (validacija):**

- Iz uvoda projekta: *"bomo uporabili GPS in merilnik pospeška, tako lahko
  beležimo, kje je bil uporabnik in ali je bil aktiven"*. Zahteva je
  fiksna in ni nadomestljiva s spletnim virom.
- Implementacija je že delno na voljo v `NPO/NPO-Aplikacija/Services/`
  (SCRUM-15, SCRUM-17), torej je tehnična izvedljivost potrjena.
- Format meritev je usklajen z JSON shemo iz SCRUM-5, kar zagotavlja, da
  bo backend (SCRUM-20) sprejel podatke brez dodatne transformacije.

**Sklep:** vir potrjen brez sprememb.

---

## 3. Vremenski API: **Open-Meteo**

Predlagani vir iz `viri-podatkov.md` je bil generično zapisan kot
*"vremenski API"*. Za potrebe SCRUM-8 izberem konkretnega ponudnika.

### 3.1 Primerjava kandidatov

| Ponudnik | Brez ključa | Brezplačni limit | Licenca | Slovenija |
|---|---|---|---|---|
| **Open-Meteo** | ✅ da | 10 000 klicev/dan | CC-BY 4.0 | ✅ |
| OpenWeatherMap | ❌ zahteva | 1 000 klicev/dan | omejena prosto | ✅ |
| ARSO Meteo (vreme.arso.gov.si) | ✅ da | ni objavljeno | uradni javni vir | ✅ |
| Tomorrow.io | ❌ zahteva | 500 klicev/dan | komercialna | ✅ |

### 3.2 Izbira: **Open-Meteo** (`https://api.open-meteo.com`)

**Razlogi (validacija po kriterijih iz poglavja 1):**

- Licenca CC-BY 4.0 — ustreza akademski rabi, zahteva le navedbo vira.
- Brez API ključa — odpravi tveganje za uhajanje skrivnosti v repozitorij.
- 10 000 klicev/dan močno presega potrebo (en klic na uro za eno lokacijo
  = 24 klicev/dan, za 100 lokacij = 2 400 klicev/dan).
- JSON odziv se neposredno preslika v shemo
  [`external-api-source.schema.json`](../schemas/external-api-source.schema.json)
  (polji `temperatureC`, `condition`).
- Pokriva celotno Slovenijo (globalna pokritost).
- ECMWF + DWD modeli — uveljavljen meteorološki vir, primeren tudi za
  kasnejšo analitiko (SCRUM-50).

### 3.3 Vzorčni klic in odziv (preverjeno)

```
GET https://api.open-meteo.com/v1/forecast
    ?latitude=46.5547
    &longitude=15.6459
    &current=temperature_2m,weather_code
    &timezone=Europe/Ljubljana
```

Odziv (skrajšano):

```json
{
  "latitude": 46.55,
  "longitude": 15.65,
  "timezone": "Europe/Ljubljana",
  "current": {
    "time": "2026-05-08T18:00",
    "temperature_2m": 18.4,
    "weather_code": 61
  }
}
```

**Preslikava v `weather_logs`:**

| Polje v `weather_logs` | Vir iz odziva | Opomba |
|---|---|---|
| `sourceName` | konstanta `"open-meteo"` | identifikator vira |
| `location` | iz `latitude` + `longitude` v GeoJSON Point | |
| `fetchedAtUtc` | čas klica (backend) | UTC |
| `temperatureC` | `current.temperature_2m` | direktno |
| `condition` | preslikava `weather_code` v opis (npr. 61 → `"rain"`) | tabela kod WMO |
| `rawData` | celoten odziv | obvezno za revizijo |

**Sklep:** Open-Meteo je sprejet kot vir za vremenske podatke. Klic mora
v User-Agent navesti ime projekta (npr. `smart-playgrounds/0.1`) v skladu
s priporočili Open-Meteo.

---

## 4. Igrišča in javne športne površine: **OpenStreetMap (Overpass API)**

### 4.1 Primerjava kandidatov

| Vir | Pokritost SI | Format | Posodabljanje | Licenca |
|---|---|---|---|---|
| **OSM Overpass API** | ✅ celovita | JSON | sproti (community) | ODbL |
| OPSI (podatki.gov.si) | delna, ne strukturirano | CSV/PDF | redko | javna |
| Občinski katastri | razdrobljeno po občinah | različno | redko | omejeno |

### 4.2 Izbira: **OpenStreetMap Overpass API** (`https://overpass-api.de/api/interpreter`)

**Razlogi (validacija po kriterijih iz poglavja 1):**

- ODbL licenca dovoljuje uporabo in deljenje, zahteva navedbo vira.
- Brez ključa, brez prijave.
- Strukturirani podatki z dobro definiranimi *tagi*: `leisure=playground`,
  `leisure=pitch`, `sport=*`.
- Pokriva celotno Slovenijo z bistveno boljšo granulacijo kot državni
  registri.
- Posodobitve sproti (skupnost), kar je pomembno za novo zgrajena igrišča.
- Format JSON je enostavno pretvoriti v dokumente kolekcije `playgrounds`
  (glej preslikavo spodaj).

### 4.3 Vzorčni klic in odziv (preverjeno)

Poizvedba za vsa igrišča in športne površine v okviru Maribora:

```
POST https://overpass-api.de/api/interpreter
Content-Type: text/plain

[out:json][timeout:25];
(
  node["leisure"="playground"](46.50,15.55,46.62,15.75);
  way["leisure"="playground"](46.50,15.55,46.62,15.75);
  node["leisure"="pitch"](46.50,15.55,46.62,15.75);
  way["leisure"="pitch"](46.50,15.55,46.62,15.75);
);
out center tags;
```

Odziv (skrajšano, en zapis):

```json
{
  "elements": [
    {
      "type": "node",
      "id": 1234567,
      "lat": 46.5547,
      "lon": 15.6459,
      "tags": {
        "leisure": "pitch",
        "sport": "basketball",
        "name": "Igrišče Mestni park",
        "surface": "asphalt",
        "lit": "yes"
      }
    }
  ]
}
```

**Preslikava v `playgrounds`:**

| Polje | Vir iz odziva | Opomba |
|---|---|---|
| `name` | `tags.name` ali `"Neimenovano igrišče <id>"` | fallback, če ni imena |
| `location` | iz `lat` + `lon` v GeoJSON Point | za poljubne `way` se uporabi `center` |
| `sports` | razčlenitev `tags.sport` (lahko več) | npr. `"basketball;football"` → `["basketball", "football"]` |
| `isPublic` | privzeto `true`, razen če `access=private` | |
| `metadata` | `{ surface, lit, source: "osm", osmId }` | hramba originalnih tagov |

**Sklep:** OSM Overpass je sprejet kot vir za podatke o igriščih.
Polnjenje kolekcije `playgrounds` se izvede enkratno (skripta v okviru
SCRUM-10) in nato osvežuje na zahtevo. Pri prikazu uporabniku obvezna
navedba *"© OpenStreetMap contributors"*.

---

## 5. Povzetek validacije

| Vir | Kolekcija | Ponudnik | Brez ključa | Licenca | Status |
|---|---|---|---|---|---|
| Senzorji mobilne aplikacije | `sensor_measurements` | NPO MAUI app | n/a | interno | ✅ potrjeno |
| Vreme | `weather_logs` | Open-Meteo | ✅ da | CC-BY 4.0 | ✅ potrjeno |
| Igrišča in športne površine | `playgrounds` | OSM Overpass | ✅ da | ODbL | ✅ potrjeno |

---

## 6. Posledice za implementacijo

- **Brez API ključev v repozitoriju.** Oba zunanja vira (Open-Meteo,
  Overpass) sta brez avtentikacije, zato ni potrebe po `.env` skrivnostih
  v fazi 1.
- **User-Agent** za vse zunanje klice naj bo nastavljen na
  `smart-playgrounds/<verzija> (https://github.com/TimotejZavski/projektne_naloge)`.
  S tem upoštevamo priporočila obeh ponudnikov.
- **Rate limiting v backendu**: za Overpass je smiselno cachati odzive
  (igrišča se ne spreminjajo dnevno), za Open-Meteo zadošča klic enkrat
  na uro na lokacijo.
- **Navedba virov v UI**: spletna aplikacija mora ob prikazu zemljevida
  navesti *"© OpenStreetMap contributors"* in ob vremenskih podatkih
  *"vir: Open-Meteo"*.

---

## 7. Sklic na povezane dokumente

- [`viri-podatkov.md`](./viri-podatkov.md) — opisni seznam virov (SCRUM-5, Srećko)
- [`../database/er-model.md`](../database/er-model.md) — ER model (SCRUM-7, Azur)
- [`../schemas/sensor-measurement.schema.json`](../schemas/sensor-measurement.schema.json)
- [`../schemas/external-api-source.schema.json`](../schemas/external-api-source.schema.json)
- Open-Meteo dokumentacija: <https://open-meteo.com/en/docs>
- Overpass API: <https://wiki.openstreetmap.org/wiki/Overpass_API>
