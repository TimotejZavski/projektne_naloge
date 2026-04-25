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