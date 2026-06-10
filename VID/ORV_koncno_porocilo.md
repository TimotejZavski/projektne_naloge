# PROJEKTNA NALOGA: Smart Playgrounds

**Srećko Ivanović · Azur Demirović · Timotej Žavski**

*Maribor, junij 2026 – ORV*

---

## Uvod

Pri predmetu Osnove računalniškega vida (ORV) smo razvili računalniško-vidni
del sistema **Smart Playgrounds** — platforme za spremljanje uporabe javnih
igrišč v Mariboru. Medtem ko NPO zajema senzorske podatke s telefonov
posameznih uporabnikov, ORV doda **drugi, anonimni vir podatkov**: iz
videoposnetka fiksne kamere nad igriščem ugotovi, **koliko igralcev je na
igrišču** in **kako se gibljejo po njem**.

Naša naloga ni bila zgolj zagnati vnaprej naučen model, ampak zgraditi celovit
cevovod računalniškega vida — od priprave podatkov, prek detekcije in sledenja
igralcev, do izpeljanih analitik (zasedenost, vročinska karta gibanja) — in ga
povezati v širši sistem (RAI spletni vmesnik). Delo smo razdelili po Jira
taskih (SCRUM-62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72) in vsak večji kos je
šel skozi svojo vejo in pull request.

Namenoma **nismo** izbrali primera dvofaktorske avtentikacije (2FA), ki ga
navodilo omenja kot eno možnost. Odločili smo se za **analizo gibanja in
zasedenosti igrišč**, ker se vsebinsko poveže z idejo Smart Playgrounds:
računalniški vid postane tretji vir podatkov za administratorja igrišč.

---

## Ideja produkta in tok uporabe

V realnem produktu bi nad vsakim igriščem stala fiksna kamera. Tok dela
administratorja je:

1. **Dodaj kamero/igrišče** — administrator v RAI panelu prilepi **stream
   povezavo** kamere (v demu je to naša povezava do gostovanega posnetka).
2. **Deklaracija igrišča** — sistem zajame en frame; administrator na njem
   **nariše igralno površino** (4 vogali). Sistem predlaga vogale (GrabCut),
   administrator jih po potrebi popravi. To se naredi **enkrat** na kamero.
3. **Sledenje igralcev** — sistem nato vsak frame zazna in sledi igralcem,
   **šteje samo tiste, ki stojijo na igrišču**, in gradi **vročinsko karto
   gibanja**.
4. **Pregled** — RAI panel prikazuje živi feed s številom igralcev (z
   zamegljenimi obrazi), status **Prosto/Zasedeno** na zemljevidu, zasedenost
   skozi čas, zaznane seje (igre) in vročinske karte (skupno in po ekipah).

Ključno: edini korak, specifičen za posamezno igrišče, je **risanje vogalov**
(kalibracija). Vse ostalo — detekcija, sledenje, štetje, heatmap — je generično
in deluje na poljubnem igrišču brez sprememb kode.

---

## Zajem in priprava podatkov

**Vir podatkov.** Za učenje modela smo uporabili javni dataset z Roboflow
Universe (`basketball-court-ecb9s`, licenca CC BY 4.0), ki vsebuje označene
slike košarkarskih iger. Originalni nabor je obsegal **85 slik** s petimi
razredi: `Ball`, `Court`, `Hoop`, `Player`, `Ref`.

Dataset smo izbrali, ker vsebuje **realne košarkarske prizore z višinskega
kota**, podobnega našemu scenariju fiksne kamere, in ima že označena razreda
`Player` in `Court`, ki ju potrebujemo. To je bilo bolj smiselno kot zbiranje in
ročno označevanje lastnih slik od nič, hkrati pa nam je pustilo dovolj dela pri
pripravi, čiščenju in augmentaciji, da je prispevek jasno naš.

**Odločitev o razredih (SCRUM-62).** Za naš cilj (štetje in gibanje igralcev na
igrišču) so relevantni le **igralci** in **igralna površina**. Razrede `Ball`,
`Hoop` in `Ref` smo izpustili: za zasedenost in vročinsko karto niso potrebni, v
izvornem naboru pa so **redki** (žoga in sodnik se pojavita le na delu slik), kar
bi pri tako majhnem datasetu povzročilo **neuravnoteženost razredov** in šum pri
učenju. Nabor smo zato zožali na **`Player`** (detekcija oseb) in **`Court`**
(igralna površina za kontekst). Preoznačevanje so opravile namenske skripte
(`drop_ref_class.py`, `prepare_2class.py`, `prepare_player.py`), ki iz oznak
odstranijo izpuščene razrede in jih preslikajo v končni nabor.

**Predobdelava in augmentacija (SCRUM-63).** 85 slik je premalo za robusten
model — brez augmentacije bi se ta preveč prilagodil (overfit) peščici primerov.
Pred augmentacijo smo oznake očistili in jih **vizualno preverili**
(`viz_labels.py`, `preview.py`), da okvirji res ustrezajo igralcem in površini in
da preoznačevanje ni pustilo napačnih oznak. Nato smo nabor z augmentacijo
razširili na **960 slik** (≈11×), razdeljenih na:

| Množica | Slik |
|---|---|
| učna (train) | 750 |
| validacijska (valid) | 186 |
| testna (test) | 24 |

Postopki augmentacije so vključevali zrcaljenje, spremembe svetlosti in
kontrasta, rotacije, dodajanje šuma in izrez relevantnih delov slike — torej
transformacije, ki so za fiksno zunanjo kamero realistične (različna osvetlitev,
rahli premiki kadra). Slike so bile normalizirane in poenotene na YOLO format
(`data.yaml`). Pri delitvi smo pazili, da augmentirane različice iste slike ne
razpršimo med učno in testno množico (brez "data leakage"), sicer bi bile
metrike preveč optimistične. Velikih binarnih datotek (slike, uteži) namenoma ne
hranimo v gitu — verzioniramo le skripte za pripravo in oznake.

> **Težava → rešitev.** Glavni izziv je bil **zelo majhen osnovni nabor (85
> slik)** in neuravnoteženi razredi. Rešili smo z nadzorovano, a obsežno
> augmentacijo (poudarek na geometrijskih in svetlostnih transformacijah) ter z
> zožanjem na dva razreda, s čimer smo odpravili redke razrede (žoga, sodnik).
> Oznake smo pred učenjem vizualno preverili, da augmentacija ni razmnožila
> morebitnih napačnih okvirjev.

**Testni posnetki.** Za vrednotenje na realnem scenariju smo uporabili
videoposnetke fiksne kamere nad zunanjim igriščem (⟨vir posnetkov dopolniti⟩):
trije odseki po ~30 s, ločljivost **3840×2160 (4K)** pri **29,97 fps**. Posnetki
služijo kot "živi feed" za demo in kot testna množica za vrednotenje modela na
realnem (ne-učnem) gradivu, ločenem od učnih slik.

---

## Model in algoritem računalniškega vida

Računalniško-vidni del je zgrajen kot **cevovod štirih korakov**, kjer je vsak
korak samostojno zagonljiv in testabilen (brez spletne strani), Srećko pa isto
logiko kasneje pokliče prek API-ja.

### 1. Kalibracija igrišča (homografija)

Igrišče je v sliki popačeno (perspektiva fiksne kamere). Iz štirih vogalov, ki
jih določi administrator, izračunamo **homografijo** v "ptičjo perspektivo"
(top-down) s pravim razmerjem igrišča (28:15). To omogoča:

* test "ali igralec stoji na igrišču" (point-in-polygon),
* vročinsko karto na zravnani površini.

Kalibracija je **klasičen** postopek računalniškega vida (brez učenja). Za
pomoč pri risanju smo dodali **predlog vogalov** s segmentacijo GrabCut, ki ga
administrator nato popravi. Orodje `calibrate.py` ima povečevalnik (loupe) za
natančno klikanje in zavrne sploščen/neveljaven poligon. Rezultat je
`court.json` (vogali + homografija).

> **Težava → rešitev.** Sprva je samodejno razvrščanje vogalov kolabiralo, če so
> bili vogali skoraj vodoravno poravnani (sploščeno igrišče). Rešili smo z
> robustnim razvrščanjem (delitev po višini) in zavrnitvijo degeneriranih
> poligonov.

### 2. Detekcija igralcev (YOLOv8)

Za detekcijo uporabljamo **YOLOv8** (Ultralytics). Kot izhodišče smo uporabili
vnaprej naučen model (COCO, razred `person`), nato pa ga **fine-tunali** na
našem košarkarskem datasetu (razreda `Player`/`Court`) — s tem se model nauči
specifik igralcev (majhne, prekrite, dresi), ki jih generični model ne pokriva.
Vsaka detekcija ima **"foot" točko** (sredina spodnjega roba okvirja = kjer
igralec stoji), ki jo uporabita štetje in heatmap.

Za izboljšanje priklica (zaznati **vse** igralce, tudi v gneči) smo uporabili
večji model (`yolov8s`), višjo ločljivost obdelave in nižji prag zaupanja —
napačne detekcije zunaj igrišča pa odstrani filter igrišča (spodaj).

### 3. Sledenje igralcev (ByteTrack, obstojni ID-ji)

Za **per-igralec** analitiko potrebujemo obstojne identitete skozi frejme. Za to
uporabljamo **ByteTrack** (vgrajen v Ultralytics, `model.track()`), ki vsaki
osebi dodeli ID. Ker se igralci prekrivajo in zapuščajo kader, se ID-ji
fragmentirajo; rešili smo z daljšim spominom sledilnika.

> **Evalvacija sledenja.** Na testnem posnetku (900 frejmov) smo primerjali:
>
> | Konfiguracija | Unikatnih ID-jev |
> |---|---|
> | ByteTrack (privzeti buffer 30) | 80 |
> | **ByteTrack `persist` (buffer 150)** | **44** |
> | BoT-SORT + ReID (videz) | 87 |
>
> ReID (ponovna identifikacija po videzu) je delovala **slabše**, ker obe
> ekipi nosita **enake drese** — videzne značilke ne ločijo igralcev. To je
> znana težava sledenja v ekipnih športih. Zato uporabljamo motion-based
> ByteTrack z daljšim spominom. Obe konfiguraciji sta **court-agnostični**
> (vezani na FPS/okluzijo, ne na izgled igrišča).

### 4. Štetje na igrišču (SCRUM-66)

Z homografijo in poligonom igrišča za vsako detekcijo preverimo, ali njena
"foot" točka **leži znotraj igrišča** (point-in-polygon). S tem ločimo igralce
na igrišču od gledalcev ob ograji in ljudi v ozadju. Na testnem posnetku je
filter obdržal v povprečju **~10–11 igralcev na igrišču** (od ~19 vseh zaznanih
oseb v kadru).

### 5. Izpeljane analitike: zasedenost, status, seje, gledalci (SCRUM-66)

Iz štetja igralcev na igrišču skozi čas izpeljemo analitike, ki jih RAI panel
prikaže administratorju. Vse izhajajo iz istega vira — "foot" točk in filtra
igrišča — torej ne dodajamo novega modela, le interpretiramo obstoječe detekcije.

* **Zasedenost skozi čas (`count.py`).** Za vsak frame zabeležimo število
  igralcev na igrišču in zgradimo **krivuljo zasedenosti** ter določimo **uro
  največje zasedenosti** ("najbolj obiskano ob 18:00"). Izhod je `counts.csv` +
  graf. To zrcali obstoječi RAI prikaz "kdaj je gneča", le da podatek prihaja iz
  videa.

* **Status Prosto / Zasedeno.** Igrišče označimo kot **zasedeno**, ko je na njem
  vsaj N igralcev (privzeto N=2) skozi kratko časovno okno (glajenje, da
  posamezen frame ne preklaplja statusa). Zelena/rdeča značka se prikaže
  neposredno na **zemljevidu igrišč v RAI panelu** — administrator na prvi pogled
  vidi, katera igrišča so prosta in katera zasedena.

* **Zaznavanje sej / iger.** Prehod igrišča iz **prazno → zasedeno → prazno**
  obravnavamo kot eno **sejo (igro)**. Za vsako sejo zabeležimo začetek, konec,
  trajanje in vrh števila igralcev. S tem ORV proizvede isto abstrakcijo
  **"obisk"**, kot jo RAI že uporablja pri senzorskih podatkih — kar omogoča
  enoten prikaz uporabe igrišča ne glede na vir podatkov.

* **Štetje gledalcev.** Oseb, ki jih filter igrišča izloči (stojijo **zunaj**
  poligona), ne zavržemo, ampak jih preštejemo kot **gledalce**. Tako dobimo
  bogatejšo sliko uporabe prostora — npr. "12 igra, 8 gleda".

### 6. Vročinska karta gibanja (skupna + po ekipah)

"Foot" točke skozi čas preslikamo v top-down prostor in seštejemo (z Gaussovim
razmazom) → **vročinska karta gibanja**. Naredimo dve vrsti:

* **Skupna** — kje na igrišču se zadržuje gibanje (ne potrebuje ID-jev,
  robustno).
* **Po ekipah** — igralce **generično** razvrstimo v 2 ekipi po **prevladujoči
  barvi dresa** (mediana torzo regije v barvnem prostoru Lab + k-means, k=2).
  Barv ne predpisujemo — odkrijemo ju iz podatkov, zato deluje za rumeno/belo
  danes in črno/belo (ali poljubni dve) jutri.

Na testnem posnetku je razvrščanje samodejno odkrilo **belo** in **rumeno**
ekipo; vročinski karti pokažeta različno prostorsko razporeditev (ena ekipa bolj
levo, druga bolj desno/sredina) — kar je smiselna taktična informacija.

### 7. Zasebnost: anonimno štetje in zamegljevanje obrazov

ORV je zasnovan **zasebnostno**: ne shranjujemo identitet, obrazov ali drugih
osebnih podatkov — vsa analitika je **anonimna** (štejemo in sledimo okvirjem,
ne ljudem; ID-ji sledilnika so zgolj začasne številke v enem posnetku). Dodatno
**zameglimo obraze**: zgornji del vsakega okvirja igralca (predel glave)
zameglimo z Gaussovim zameglevanjem, preden frame shranimo ali prikažemo
(annotated video, živi feed). Za mesto, ki bi kamere postavilo nad javna
igrišča, je to ključna lastnost — sistem meri **uporabo prostora**, ne
posameznikov.

> **Težava → rešitev.** Zamegljevanje celega okvirja bi pokvarilo detekcijo in
> sledenje v naslednjih frejmih; zato obraze zameglimo **šele po
> detekciji/sledenju**, na izhodnem frejmu, surov frame za model pa ostane oster.

### Optimizacija hiperparametrov in vrednotenje (SCRUM-70, 71)

Model smo učili in optimizirali hiperparametre ⟨navesti: število epoch,
batch, learning rate, imgsz, izbira yolov8n/s/m⟩. Za vrednotenje smo uporabili
standardne metrike detekcije:

| Metrika | Vrednost |
|---|---|
| Precision | ⟨…⟩ |
| Recall | ⟨…⟩ |
| mAP@0.5 | ⟨…⟩ |
| mAP@0.5:0.95 | ⟨…⟩ |

Poleg metrik na testni množici smo model **kvalitativno preverili na realnem
videu** (testni posnetki igrišča), kjer ocenimo priklic igralcev v gneči in
stabilnost sledenja. ⟨Številke dopolnimo po končnem učenju.⟩

---

## Aplikacijska integracija in API

Računalniško-vidni del je izpostavljen kot **ORV storitev** (FastAPI), tako da
ga RAI spletni vmesnik in NPO zaslon uporabljata prek HTTP-ja. Storitev je
samostojna in jo je mogoče kontejnerizirati ločeno.

**Stream strežnik ("naša stream povezava").** Demo videoposnetke gostujemo kot
neskončne MJPEG tokove, tako da se vedejo kot mrežna kamera:

```
GET /streams              -> seznam povezav (id, name, url)
GET /streams/{id}         -> živi MJPEG tok (kot IP kamera)
```

**API za igrišča in kalibracijo.**

```
POST   /orv/courts                  {raiCourtId, streamUrl} -> zajem frejma, CALIBRATING
GET    /orv/courts                  seznam ORV-registriranih igrišč
GET    /orv/courts/{id}             stanje, kalibracija, frameUrl
GET    /orv/courts/{id}/frame       zajeti frame za risanje igrišča
PUT    /orv/courts/{id}/calibration {corners:[{x,y}*4]} -> homografija, READY
GET    /orv/courts/{id}/status      Prosto/Zasedeno + trenutno število igralcev
GET    /orv/courts/{id}/occupancy   krivulja zasedenosti + ura največje gneče
GET    /orv/courts/{id}/sessions    zaznane seje (začetek/konec/trajanje/vrh)
GET    /orv/courts/{id}/heatmap     vročinske karte (skupna + po ekipah)
```

Vir za branje je **enoten**: naša povezava se razreši na lokalno datoteko, prava
`rtsp://`/`http` povezava pa gre naravnost v `cv2.VideoCapture` — produkcijski
prehod na pravo kamero brez spremembe kode.

**Integracija v RAI panel (SCRUM-69).** Vsako od 46 (strgano z `maribor.si`)
igrišč v RAI panelu dobi v profilu novo sekcijo **"live feed"** z gumbom **"+"**
za dodajanje kamere (stream povezave). Po kalibraciji sekcija prikazuje živi
feed z okvirji igralcev (z zamegljenimi obrazi), trenutnim številom na igrišču,
**zasedenostjo skozi čas**, **seznamom sej** in **vročinskimi kartami**. Srećko
je te poglede povezal z ORV API-jem (`/status`, `/occupancy`, `/sessions`,
`/heatmap`), tako da RAI panel bere analitiko neposredno iz ORV storitve. Živi
feed je v brskalniku prikazan kar prek `<img>` elementa (MJPEG multipart tok),
grafe zasedenosti pa izriše z obstoječimi RAI Chart.js pomočniki, da ostane
vizualni jezik enoten z ostalim panelom.

Na **zemljevidu igrišč** vsak marker dobi **živo značko Prosto/Zasedeno**
(zelena/rdeča), ki jo Srećko napaja iz `/orv/courts/{id}/status`. Tako
administrator na prvi pogled vidi stanje vseh igrišč hkrati — natanko tisto, kar
od dashboarda pričakuje skrbnik mestnih igrišč.

**NPO mock live-feed zaslon (SCRUM-68).** Ločen zaslon, ki simulira živo kamero:
predvaja posnetek in sproti prikazuje število igralcev na igrišču ter gradnjo
vročinske karte v živo (`live.py`).

**Docker (SCRUM-67).** ORV storitev je zapakirana v Docker vsebnik (Python 3.11 +
OpenCV + Ultralytics + FastAPI, skupaj z naučenimi utežmi modela). Vsebnik
izpostavi port 8000 in se vključi v skupni `docker-compose`. Pri kontejnerizaciji
je bilo treba upoštevati **velikost slike** (torch/ultralytics naredita vsebnik
velik ~GB) in **inferenco brez GPU-ja** v vsebniku — privzeto teče na CPU, kar je
za demo (zankan posnetek) zadostno; model in ločljivost obdelave sta izbrana tako,
da ostane sprejemljivo hiter.

**Enovit zagon (SCRUM-72).** Celoten sistem (ORV storitev + RAI backend + MongoDB
+ MQTT) se vzpostavi z eno skripto `start.sh`, ki zažene `docker-compose`, počaka
na healthcheck servisov in pripravi zankan demo posnetek kot vir kamere, tako da
je sistem takoj pripravljen za prikaz.

> **Težava → rešitev.** Pri integraciji je bilo nekaj ponavljajočih se izzivov:
> **CORS** med RAI clientom (:3000) in ORV storitvijo (:8000) smo rešili z
> eksplicitnim dovoljenjem izvora v FastAPI; **prikaz MJPEG toka** v brskalniku
> smo izvedli kar z `<img src=".../streams/{id}">` (multipart x-mixed-replace),
> brez dodatnih predvajalnikov; **preslikavo** med RAI igriščem (`court._id` v
> MongoDB) in ORV zapisom kamere smo rešili tako, da ORV store uporablja isti
> `raiCourtId` kot ključ. Storitev je namenoma **razklopljena** (svoj JSON
> store), RAI panel pa analitiko bere izključno prek HTTP — kar omogoča ločeno
> kontejnerizacijo in razvoj.

---

## Arhitektura

```
[Fiksna kamera / posnetek]
        |  (stream povezava: rtsp/http/MJPEG)
        v
[ORV storitev (FastAPI, Python)]
        |   - stream strežnik (MJPEG)
        |   - kalibracija igrišča (homografija)
        |   - detekcija (YOLOv8) + sledenje (ByteTrack)
        |   - štetje na igrišču (point-in-polygon)
        |   - heatmap (skupna + po ekipah)
        |
        |--- HTTP (REST/JSON) --->  [RAI admin panel: zemljevid Prosto/Zasedeno,
        |                            live feed, zasedenost, seje, heatmap]
        |--- HTTP --------------->  [NPO mock live-feed zaslon: število igralcev]
        v
[court.json / detections.json / counts.csv / heatmap slike]
```

ORV storitev je **vir analitike**; RAI panel in NPO zaslon sta odjemalca, ki
prek API-ja prikazujeta rezultate.

---

## Uporabljene tehnologije

★ **Računalniški vid (ORV)**
- Python 3.11
- OpenCV (cv2): kalibracija, homografija, barvna segmentacija, vizualizacija
- Ultralytics YOLOv8: detekcija (`Player`/`Court`)
- ByteTrack / BoT-SORT: sledenje z obstojnimi ID-ji
- NumPy: numerične operacije, k-means (barve dresov)

★ **Storitev / API**
- FastAPI + Uvicorn: REST API in MJPEG stream strežnik
- Pydantic: validacija vhodov

★ **Integracija (RAI)**
- React: spletni vmesnik (live-feed sekcija, "+" dodajanje kamere)
- Node.js/Express + MongoDB: obstoječe RAI zaledje

★ **Infrastruktura (SA)**
- Docker + Docker Compose: kontejnerizacija ORV storitve
- Bash skripta (`start.sh`): avtomatiziran zagon

★ **Orodja**
- Git + GitHub: verzioniranje, veje, pull requesti
- Jira (SCRUM taski): projektno vodenje

---

## Navodila za zagon

**Predpogoji:** Python 3.11 z virtualnim okoljem (`VID/.venv`), nameščene
knjižnice (`pip install -r service/requirements.txt`; `cv2`, `ultralytics`,
`numpy` so že v okolju). Prosti port: **8000** (ORV storitev).

### A) Cevovod modela (samostojno, brez spletne strani)

```bash
cd VID

# 1) Kalibracija igrišča (klik 4 vogale; tipke: g predlog, s shrani, q izhod)
.venv/Scripts/python.exe service/calibrate.py dataset/valid/videos/Q4_side_300-330.mp4

# 2) Detekcija + sledenje + filter igrišča (+ zamegljeni obrazi) -> annotated.mp4 + detections.json
.venv/Scripts/python.exe service/detect.py dataset/valid/videos/Q4_side_300-330.mp4 \
    --court court_out/court.json --save-json

# 3) Zasedenost skozi čas + status + seje + gledalci -> counts.csv
.venv/Scripts/python.exe service/count.py

# 4) Vročinska karta (skupna + po ekipah)
.venv/Scripts/python.exe service/heatmap.py

# 5) Živi prikaz: feed + heatmap v gradnji
.venv/Scripts/python.exe service/live.py
```

Vsak korak zapiše izhod, ki ga vizualno preverimo (`overlay.jpg`, `topdown.jpg`,
`annotated.mp4`, `heatmaps_montage.jpg`).

### B) ORV storitev (API)

```bash
cd VID
.venv/Scripts/python.exe -m uvicorn service.orv.main:app --port 8000
# zdravje:  http://localhost:8000/health
# API docs: http://localhost:8000/docs
# seznam tokov: http://localhost:8000/streams
```

### C) Celoten sistem (Docker)

```bash
./start.sh        # zažene ORV storitev skupaj z RAI/MQTT/Mongo stackom
```

---

## Testiranje

Delovanje smo preverjali **po korakih** (vsak korak cevovoda ima vizualni izhod
za potrditev) in **kvantitativno**:

* **Kalibracija:** preverjena vizualno (`overlay.jpg` se ujema z robom igrišča,
  `topdown.jpg` zravnan v pravokotnik).
* **Detekcija:** povprečno ~10–11 igralcev na igrišču na testnem posnetku;
  metrike na testni množici (precision/recall/mAP) ⟨po končnem učenju⟩.
* **Sledenje:** evalvacija konfiguracij — ByteTrack `persist` zmanjša fragmentacijo
  z 80 na 44 unikatnih ID-jev; ReID evalviran in zavrnjen (enaki dresi).
* **Štetje / heatmap:** preverjeno na 9493 "foot" točkah; ekipi prostorsko
  ločljivi.
* **Zasedenost / status / seje:** krivulja zasedenosti in ura vrha izračunani iz
  `counts.csv`; status Prosto/Zasedeno preverjen z glajenjem (brez tresenja);
  zaznane seje (prazno→zasedeno→prazno) z začetkom/koncem/trajanjem.
* **Zasebnost:** zamegljevanje obrazov preverjeno vizualno na annotated videu in
  živem feedu (obrazi zamegljeni, detekcija/sledenje nedotaknjena).
* **API:** preverjeni endpointi `/health`, `/streams`, `/orv/courts` (zajem
  frejma, kalibracija), `/status`, `/occupancy`, `/sessions`.
* **CI:** ⟨GitHub Actions preverjanje za ORV storitev — dopolniti/uskladiti s
  Srećkovim CI.⟩

---

## Prispevki članov

**Azur Demirović (Član 2 – model in algoritem).** Zgradil je celoten
računalniško-vidni cevovod: kalibracijo igrišča s homografijo in GrabCut
predlogom (SCRUM-65), detekcijo igralcev z YOLOv8 in fine-tune na košarkarskem
datasetu, sledenje z ByteTrack ter evalvacijo sledilnikov (SCRUM-65),
logiko štetja igralcev na igrišču (point-in-polygon, SCRUM-66) ter iz nje
izpeljane analitike — zasedenost skozi čas, status Prosto/Zasedeno, zaznavanje
sej (iger) in štetje gledalcev. Implementiral je vročinske karte (skupno +
per-ekipa z generičnim razvrščanjem po barvi dresa), zasebnostno zamegljevanje
obrazov ter optimizacijo hiperparametrov in vrednotenje modela (SCRUM-70, 71).
Postavil je tudi ORV FastAPI storitev (stream strežnik + API za igrišča,
zasedenost, seje, status) in NPO mock live-feed zaslon (SCRUM-68).

**Timotej Žavski (Član 1 – podatki).** Pripravil je celoten podatkovni del
računalniškega vida. Izbral in ovrednotil je izvorni dataset (Roboflow
basketball-court) glede na ustreznost našemu scenariju fiksne kamere ter sprejel
**odločitev o razredih** — zožanje s petih (`Ball`, `Court`, `Hoop`, `Player`,
`Ref`) na dva (`Player`, `Court`, SCRUM-62), ker so ostali razredi redki in za
štetje ter heatmap nepotrebni. Za preoznačevanje je pripravil skripte
(`drop_ref_class.py`, `prepare_2class.py`, `prepare_player.py`), oznake pa pred
učenjem **vizualno preveril** (`viz_labels.py`, `preview.py`). Izvedel je
predobdelavo in augmentacijo, s katero je nabor razširil z 85 na **960 slik**
(SCRUM-63), pri čemer je pazil na delitev učne/validacijske/testne množice brez
prepuščanja (data leakage). Pripravil je tudi začetni **prototip detekcije** na
eni sliki (SCRUM-64), s katerim smo potrdili pristop, preden smo gradili celoten
cevovod. Glavni izziv njegovega dela je bil majhen in neuravnotežen izvorni
nabor, kar je rešil z nadzorovano augmentacijo in zožanjem razredov.

**Srećko Ivanović (Član 3 – integracija in okolje).** Poskrbel je, da
računalniško-vidni del zaživi kot del sistema. **Kontejneriziral** je ORV
storitev v Docker vsebnik (Python + OpenCV + Ultralytics + FastAPI + uteži,
SCRUM-67), pri čemer je obvladal velikost slike in inferenco brez GPU-ja.
**Integriral** je storitev v RAI admin panel (SCRUM-69): dodal je live-feed
sekcijo v profil igrišča z gumbom "+" za dodajanje kamere, prikaz živega MJPEG
toka v brskalniku (`<img>`), grafe zasedenosti (RAI Chart.js), seznam sej in
vročinske karte, ter **žive značke Prosto/Zasedeno na zemljevidu igrišč** (iz
`/status`). Reševal je izzive povezovanja — CORS med RAI clientom in ORV
storitvijo, prikaz multipart MJPEG toka v Reactu in preslikavo med RAI igriščem
(`court._id`) in ORV zapisom kamere. Vse je povezal v **enovit zagon** prek
`start.sh` z zankanim demo posnetkom (SCRUM-72), tako da se celoten sistem zažene
z eno skripto.

---

## Zaključek

Pri predmetu ORV smo razvili računalniško-vidni del Smart Playgrounds, ki iz
videoposnetka fiksne kamere ugotovi zasedenost igrišča in zgradi vročinsko karto
gibanja. Rešitev pokriva vse zahtevane komponente: **zajem in pripravo
podatkov** (dataset + augmentacija), **model/algoritem** (kalibracija + YOLOv8
detekcija + ByteTrack sledenje + štetje + zasedenost/status/seje + heatmap),
**aplikacijsko integracijo** (FastAPI storitev, RAI panel z značkami
Prosto/Zasedeno, NPO zaslon) in **navodila za zagon** (cevovod po korakih +
Docker). Sistem je zasnovan **zasebnostno** — anonimno štetje in zamegljeni
obrazi — kar je nujno za postavitev kamer nad javna mestna igrišča.

Poseben poudarek je bil na **samostojnosti in razumevanju**: kalibracija je naš
klasičen algoritem (homografija), detekcijo smo prilagodili (fine-tune) in
ovrednotili, sledenje pa eksperimentalno primerjali (ByteTrack vs. ReID) z
jasnim, pošteno dokumentiranim zaključkom o enakih dresih. Rešitev je zasnovana
**generično** — edini korak, specifičen za posamezno igrišče, je risanje
vogalov; vse ostalo deluje na poljubnem igrišču brez sprememb kode.

*Maribor, junij 2026 – ORV*
