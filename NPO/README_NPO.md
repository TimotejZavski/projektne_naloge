# Projektna naloga

V okviru projektnega dela boste razvili preprosto mobilno aplikacijo, ki omogoča:

- zajem senzorskih podatkov,
- pošiljanje podatkov preko MQTT protokola,
- prikaz podatkov na odjemalski (spletni) aplikaciji.

Aplikacija lahko opcijsko služi tudi kot rešitev za 2FA (two-factor authentication) v okviru drugih predmetov (npr. ORV).

Projektno delo nadgrajuje naloge iz predmeta RAIN.

## Arhitektura sistema

Sistem naj bo sestavljen iz treh glavnih komponent:

- **Mobilna aplikacija** - deluje kot publisher (pošiljatelj podatkov)
- **MQTT strežnik (broker)** - posrednik sporočil (priporočena uporaba Mosquitto)
- **Spletna aplikacija** - deluje kot subscriber (sprejemnik in prikaz podatkov)

Priporočena tehnologija za broker:

- https://mosquitto.org/

## Zahteve projekta

### 1. Mobilna aplikacija (40 točk)

Aplikacija mora vključevati:

- registracijo in prijavo uporabnika,
- zajem vsaj enega senzorskega podatka, npr.:
	- pospeškomer,
	- GPS,
	- žiroskop,
- pošiljanje podatkov preko MQTT protokola (priporočena uporaba JSON formata).

**Opomba:** Aplikacija naj ne bo omejena izključno na Android (upoštevajte prenosljivost ali večplatformske rešitve).

### 2. Prikaz podatkov na odjemalcu (10 točk)

Izdelajte ali dopolnite spletno aplikacijo, ki:

- prikazuje podatke vseh povezanih naprav,
- omogoča sprotni (real-time) prikaz ali periodično osveževanje.

### 3. MQTT infrastruktura (20 točk)

Vzpostavite lasten MQTT strežnik:

- uporaba Mosquitto brokerja,
- zagon v Docker vsebniku,
- avtomatizirana postavitev.

### 4. Integracija z drugimi sistemi (30 točk)

Rešitev povežite z aplikacijami ali sistemi, ki jih razvijate pri drugih predmetih.

Obvezno implementirajte:

- mehanizem za zaznavanje aktivnih naprav (uporabnikov), npr.:
	- heartbeat sporočila,
	- last will (MQTT),
	- štetje trenutno povezanih naprav.

## Delo v skupini

- Vsak član skupine mora enakovredno prispevati k projektu.
- Prispevki posameznikov bodo preverjeni na zagovoru (git commits).
- Posameznik, ki ni prispeval k določenemu delu, bo prejel ustrezno manj točk.
- Točke zapisane ob vsaki postavki so maksimalne točke, ki jih lahko dobi posamezni član skupine.

## Oddaja projekta

Oddajte kratek pregled projekta, ki vključuje:

- opis implementacije,
- arhitekturo sistema,
- uporabljene tehnologije,
- navodila za zagon (vključno z Docker okoljem),
- opis prispevkov posameznih članov.

Dokument naj bo v PDF formatu.


opomba:
maui->android/ios (blazor one..)

## MQTT JSON format

Mobilna aplikacija po zajemu podatkov pripravi MQTT sporočilo v JSON formatu.
Privzeti broker je `localhost:1883`, osnovni topic pa `smart-playgrounds`.

Topic format:

```text
smart-playgrounds/devices/{deviceId}/sensors/{sensorType}
```

## SCRUM-27 Dashboard view

NPO aplikacija ima dashboard na zacetni poti `/` in dodatni poti `/dashboard`.
Dashboard prikazuje:

- vse trenutno podprte senzorske naprave,
- aktivno ali neaktivno stanje naprave,
- zadnjo zajeto meritev za vsako napravo,
- skupno stevilo lokalno zajetih meritev,
- kratek seznam zadnjih meritev iz lokalnega repository-ja.

Podatki se berejo iz obstojecih `ISensorService` in `ISensorDataRepository`
storitev, zato dashboard ne uvaja novega vzporednega vira podatkov.

## SCRUM-28 Pregled posameznih naprav in meritev

NPO aplikacija ima stran za pregled posamezne naprave na poti `/devices`.
Podprti sta tudi direktni poti:

- `/devices/gps`
- `/devices/accelerometer`

Stran omogoca izbiro naprave, prikaz aktivnega stanja, zadnje meritve,
casa zadnje meritve in tabelarni pregled lokalno zajetih meritev iz
`ISensorDataRepository`.

## SCRUM-39 Spletni vmesnik - osnovni layout

NPO aplikacija uporablja skupni spletni layout v `MainLayout.razor`.
Layout vsebuje:

- levo navigacijo z locenima skupinama Pregledi in Sistem,
- zgornji header z nazivom aplikacije in osnovnimi statusnimi oznakami,
- centralni vsebinski prostor z omejeno sirino za dashboard in detail poglede,
- globalne UI tokene za barve, povrsine, obrobe, gumbe in tabele,
- odzivno prilagoditev za ozke zaslone.

Novi NPO pogledi naj uporabljajo obstojeci `MainLayout` in naj svoje
specificne stile omejijo na pripadajoce `.razor.css` datoteke.

Primer GPS sporočila:

```json
{
  "schemaVersion": "1.0",
  "deviceId": "device-1",
  "sensorType": "gps",
  "timestampUtc": "2026-05-08T12:00:00Z",
  "data": {
    "latitude": 46.5547,
    "longitude": 15.6459
  }
}
```

Primer pospeškometra:

```json
{
  "schemaVersion": "1.0",
  "deviceId": "device-1",
  "sensorType": "accelerometer",
  "timestampUtc": "2026-05-08T12:00:00Z",
  "data": {
    "x": 0.12,
    "y": 0.03,
    "z": 9.81
  }
}
```
