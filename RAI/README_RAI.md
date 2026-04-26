# Analize masivnih podatkov za aplikacije v realnem svetu

Pri projektu boste analizirali podatke, ki jih boste pridobili iz različnih senzorjev. Za izboljšanje natančnosti, boste vključili tudi podatke, ki jih boste pridobili iz prosto dostopnih virov. 

V okviru projektnega dela pri predmetu Razvoj aplikacij za internet boste razvili spletno storitev, ki bo skrbela za hrambo vseh podatkov v podatkovni bazi. Izdelali boste spletno aplikacijo za vizualizacijo podatkov iz podatkovne baze. Sledi še izdelava spletne komponente za zajem podatkov iz spletnih virov.

## 1. Načrtovanje

Zapišite idejni načrt. Definirajte podatke, ki jih boste zbirali in obdelovali ter od kod jih boste pridobili. Opišite, kaj bodo vaši rezultati obdelave. Razdelite si delo med člane v mikroskupini in si določite interne roke za izvedbo posameznih opravil.

## 2. Naloga 1: Spletna storitev

Pripravite podatkovni model in vzpostavite podatkovno bazo, ki bo hranila vse podatke. V podatkovni model obvezno vključite podatke, ki jih boste zajemali iz različnih senzorjev (kamera, pospeškometri, GPS lokacija,...).

Shranjujte tudi obdelane podatke (razpoznani prometni znaki, ...).

Implementirajte spletno storitev, ki za komunikacijo uporablja protocol HTTP (RESTful API, SOAP,…). Storitev naj omogoča vnos podatkov ter branje podatkov iz podatkovne baze.

### Dodatno:

Izdelajte program (scrapper), ki bo iz izbranega spletnega vira prenesel podatke v surovi obliki (HTML, JSON,…) in iz nje izluščil podatke. Izluščene podatke pošiljite v API, ki jih bo shranil v podatkovno bazo. Primer scrapper-ja v Node.js najdete tukaj. Nekaj primerov virov podatkov:

- Statistični podatki o prometnih nesrečah (link1, link2, ...)
- Odprti podatki Slovenije
- Cestne kamere
- Števci prometa

## 3. Naloga 2: Spletni vmesnik

Implementirajte spletni vmesnik za vizualizacijo podatkov, ki ste jih zajeli v podatkovni bazi. Za vizualizacijo lokacijskih podatkov uporabite OpenStreetMaps.

### Dodatno:

Izdelajte še smiselno vizualizacijo za ostale podatke. Pomagate sl lahko s programskimi knjižnicami: Chart.js, D3.js,...

## 4. Predstavitev

Na koncu izdelajte še predstavitev vaše aplikacije. Predstavitev naj vključuje zaslonske posnetke, ki prikazujejo uporabo spletne storitve in uporabo spletnega vmesnika. Spletni vmesnik lahko predstavite tudi s kratkimi (10-15 sekund) video posnetki. Pripravljeno gradivo bo v pomoč pri izdelavi predstavitve ob zaključku študentskega projekta.

## 5. Potek dela

- Izdelava podatkovnega modela (19. 4. 2026)
- Izdelava spletne storitve za hrambo podatkov (17. 5. 2026)
- Izdelava spletnega vmesnika za vizualizacijo (31. 5. 2026)
- Izdelava predstavitve (7. 6. 2026)

Vso programsko kodo sproti oddajajte tudi na GIT repozitorij.

## 6. Ocenjevanje

Za pozitivno oceno je potrebno izdelati spletno storitev, ki omogoča hrambo in branje vseh podatkov ter vizualizacijo lokacijskih podatkov. Izdelati morate tudi končno predstavitev.

Za višjo oceno je potrebno v bazo in spletno storitev vključiti še podatke, ki jih zajamete iz spletnih virov ter izdelati smiselno vizualizacijo za ostale podatke.

Paket s predstavitvijo, programsko kodo, izvozom podatkovne baze in povezavo do GIT repozitorija oddate na e-študij.

## Kriterij:

- Osnovne funkcionalnosti (16 točk)
- Zajem podatkov iz spletnih storitev (8 točk)
- Vizualizacija ostalih podatkov (4 točke)
- Sprotno delo (6 točk)
- Skupaj: 34 točk


opomba:
(zagon)
# terminal1
cd RAI/server
npm install
npm run dev

# terminal2
cd RAI/client
npm install
npm start
