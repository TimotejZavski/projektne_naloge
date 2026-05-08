# Viri podatkov

Ta dokument opisuje glavne vire podatkov za projekt Smart Playgrounds. Namen je,
da imajo backend, mobilna aplikacija in kasnejsa vizualizacija enak dogovor o
obliki podatkov.

## Senzorski podatki

Mobilna aplikacija zbira podatke iz senzorjev uporabnikove naprave. V prvi fazi
uporabljamo:

- GPS lokacijo za preverjanje obiska igrisca in prikaz lokacij na zemljevidu
- pospeskomer za grobo zaznavanje aktivnosti uporabnika

Senzorski podatki se lahko posljejo prek MQTT ali HTTP API-ja, vendar naj imajo
enako osnovno JSON strukturo. Vsaka meritev vsebuje:

- `deviceId` - identifikator naprave
- `userId` - identifikator uporabnika, ce je uporabnik prijavljen
- `sensorType` - tip senzorja (`gps` ali `accelerometer`)
- `timestampUtc` - cas meritve v UTC formatu
- `data` - vrednosti meritve, odvisne od tipa senzorja

## Spletni API viri

Za analitiko bomo kasneje dodali podatke iz javnih spletnih virov. Predvideni
viri so:

- vremenski API za temperaturo, padavine in vremensko stanje
- odprti podatki o javnih sportnih povrsinah ali lokacijah igrisc
- dodatni prometni ali okoljski podatki, ce bodo uporabni za analitiko

Ti podatki se hranijo loceno od surovih senzorskih meritev, ker prihajajo iz
zunanjih sistemov in imajo drugacen cas osvezevanja.

## Predvidena uporaba podatkov

Podatki bodo uporabljeni za:

- prikaz lokacij uporabnikov in naprav
- preverjanje, ali je bil uporabnik blizu rezerviranega igrisca
- osnovno analitiko aktivnosti
- primerjavo uporabe igrisc z vremenskimi pogoji
- pripravo grafov in pregledov v spletni aplikaciji

## Povezane JSON sheme

JSON sheme so zapisane v mapi `RAI/schemas`:

- `sensor-measurement.schema.json` za GPS in pospeskomer
- `external-api-source.schema.json` za podatke iz zunanjih spletnih API-jev
