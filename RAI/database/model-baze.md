# Model baze podatkov

Ta dokument opisuje predlagan MongoDB model za projekt Smart Playgrounds. Namen
SCRUM-6 je pregledati osnovni model baze in pripraviti popravke, da se podatki
iz mobilne aplikacije, spletnih virov in analitike lahko hranijo v enotni
strukturi.

## Glavne kolekcije

### users

Kolekcija hrani osnovne podatke uporabnikov.

Predvidena polja:

- `_id` - MongoDB identifikator
- `email` - e-postni naslov uporabnika
- `displayName` - prikazno ime
- `passwordHash` - hash gesla, ne navadno geslo
- `createdAtUtc` - datum registracije
- `lastLoginAtUtc` - zadnja prijava

### devices

Kolekcija hrani naprave, ki posiljajo senzorske podatke.

Predvidena polja:

- `_id` - MongoDB identifikator
- `deviceId` - identifikator naprave iz mobilne aplikacije
- `userId` - povezava na uporabnika
- `platform` - npr. Android, iOS ali Windows
- `isActive` - ali je naprava trenutno aktivna
- `lastSeenAtUtc` - cas zadnjega prejetega podatka

### sensor_measurements

Kolekcija hrani surove meritve iz senzorjev.

Predvidena polja:

- `_id` - MongoDB identifikator
- `deviceId` - naprava, ki je poslala meritev
- `userId` - uporabnik, ce je znan
- `sensorType` - `gps` ali `accelerometer`
- `timestampUtc` - cas meritve
- `data` - podatki meritve, odvisni od tipa senzorja
- `source` - npr. `mqtt` ali `http`

### playgrounds

Kolekcija hrani javna igrisca.

Predvidena polja:

- `_id` - MongoDB identifikator
- `name` - naziv igrisca
- `location` - GPS koordinate
- `sports` - seznam sportov
- `isPublic` - ali je igrisce javno
- `metadata` - dodatni podatki iz spletnih virov

### reservations

Kolekcija hrani rezervacije uporabnikov.

Predvidena polja:

- `_id` - MongoDB identifikator
- `userId` - uporabnik
- `playgroundId` - rezervirano igrisce
- `startsAtUtc` - zacetek rezervacije
- `endsAtUtc` - konec rezervacije
- `status` - `active`, `cancelled` ali `completed`

### weather_logs

Kolekcija hrani vremenske podatke za analitiko.

Predvidena polja:

- `_id` - MongoDB identifikator
- `sourceName` - ime zunanjega API vira
- `location` - lokacija meritve
- `fetchedAtUtc` - cas pridobivanja podatkov
- `temperatureC` - temperatura
- `condition` - opis vremena
- `rawData` - originalni odziv API-ja

### analytics

Kolekcija hrani obdelane podatke, ki se prikazujejo v nadzorni plosci.

Predvidena polja:

- `_id` - MongoDB identifikator
- `type` - vrsta analitike
- `playgroundId` - povezava na igrisce, ce je relevantno
- `periodStartUtc` - zacetek obdobja
- `periodEndUtc` - konec obdobja
- `result` - rezultat agregacije
- `createdAtUtc` - cas izracuna

## Predlagani indeksi

- `users.email` mora biti unikaten
- `devices.deviceId` mora biti unikaten
- `sensor_measurements.deviceId + timestampUtc` za hiter pregled meritev naprave
- `playgrounds.location` kot geografski indeks za prikaz na zemljevidu
- `reservations.userId + startsAtUtc` za pregled uporabnikovih rezervacij
- `weather_logs.fetchedAtUtc` za casovno analitiko

## Opombe za implementacijo

- Gesla se nikoli ne hranijo v navadnem tekstu.
- Surovi senzorski podatki in obdelani analiticni podatki so loceni.
- Vremenski in drugi spletni viri se hranijo loceno od podatkov naprav.
- `deviceId` povezuje MQTT/HTTP podatke z napravo v bazi.
