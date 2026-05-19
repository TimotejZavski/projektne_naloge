Projektna naloga: Uporaba računalniškega vida v aplikativnem sistemu
Pri predmetu Osnove računalniškega vida boste v okviru projektne naloge razvili aplikativno rešitev, ki vključuje vsaj en mehanizem s področja računalniškega vida.

Osnovna ideja projekta je razvoj sistema, ki zna na podlagi slike ali video posnetka prepoznati določen vizualni vzorec, predmet, obraz, gesto, objekt, stanje okolja ali drugo vizualno informacijo. Rešitev naj bo vključena v širši aplikativni sistem, na primer v spletno aplikacijo, mobilno aplikacijo, API-storitev ali drug uporaben prototip.

Ena izmed možnih rešitev je sistem za dodatno preverjanje identitete uporabnika, kjer uporabnik ob prijavi v spletno aplikacijo potrdi svojo identiteto s pomočjo mobilne aplikacije. Mobilna aplikacija zajame sliko izbranega predmeta, obraza ali drugega vizualnega elementa, sistem pa na podlagi računalniškega vida preveri, ali je prijava dovoljena. Takšen sistem lahko predstavlja preprost primer dvofaktorske avtentikacije oziroma dodatnega varnostnega preverjanja.

To je zgolj ena izmed možnih idej. Ekipe lahko razvijejo tudi popolnoma drugačno rešitev, če je vsebinsko povezana s področjem računalniškega vida. Primeri možnih tem so:

prepoznava obrazov ali predmetov,
klasifikacija slik,
detekcija objektov,
segmentacija slik,
sledenje objektom,
prepoznava gest,
analiza gibanja,
uporaba računalniškega vida v mobilni ali spletni aplikaciji,
uporaba računalniškega vida kot dela večjega informacijskega sistema.
Projekt naj bo zastavljen tako, da ima vsak član ekipe jasno določeno nalogo in je prispevek vsakega člana razviden iz sistema za verzioniranje kode.

Zahteve glede izvedbe projekta
Projekt mora vsebovati naslednje osnovne komponente:

zajem in pripravo podatkov,
model ali algoritem računalniškega vida,
aplikacijsko integracijo, na primer API, spletno aplikacijo, mobilno aplikacijo ali drug uporaben vmesnik,
navodila za zagon in uporabo sistema,
poročilo, v katerem je jasno opisana rešitev, uporabljeni postopki in razdelitev dela med člani ekipe.
Vsaka ekipa mora uporabljati sistem za verzioniranje kode, na primer Git. Iz zgodovine repozitorija mora biti razvidno, kaj je prispeval posamezni član ekipe.

Predlagana razdelitev dela med člane ekipe
Spodnja razdelitev je priporočena za ekipo s tremi člani. Če ima ekipa drugačno število članov ali drugačno organizacijo dela, lahko naloge smiselno prerazporedi. Pomembno je, da ima vsak član jasno določeno odgovornost.

Član 1: Zajem, priprava in augmentacija podatkov ter del aplikacijske logike
Član 1 je odgovoren za pripravo podatkovnega dela projekta. Njegove naloge vključujejo:

pripravo postopka za zajem učnih podatkov,
izdelavo skript ali programov za zajem slik oziroma video posnetkov,
organizacijo podatkov v smiselno strukturo map ali datotek,
pripravo podatkov za učenje oziroma testiranje,
osnovno predobdelavo slik,
implementacijo lastnih postopkov augmentacije podatkov,
sodelovanje pri integraciji rešitve v končno aplikacijo.
Pri pripravi podatkov je treba po potrebi izvesti ustrezne postopke, kot so:

odstranjevanje šuma,
sprememba velikosti slik,
pretvorba v ustrezne barvne prostore,
normalizacija vrednosti slikovnih pik,
linearizacija sivinskih vrednosti,
izrezovanje relevantnih delov slike,
priprava učne, validacijske in testne množice.
Če projekt vključuje primer dodatnega preverjanja identitete ali prijave v sistem, lahko Član 1 sodeluje tudi pri implementaciji dela 2FA logike, na primer pri prikazu zahteve za potrditev, potisnem obvestilu, potrditvi v mobilni aplikaciji ali omogočanju vstopa v spletno aplikacijo.

Član 2: Model ali algoritem računalniškega vida
Član 2 je odgovoren za razvoj, učenje, testiranje in vrednotenje modela oziroma algoritma računalniškega vida.

Naloge vključujejo:

izbiro primernega pristopa za obravnavani problem,
pripravo modela ali algoritma za prepoznavo, klasifikacijo, detekcijo, segmentacijo ali drugo izbrano nalogo,
učenje modela oziroma nastavitev algoritma,
izbiro in razlago hiperparametrov,
optimizacijo hiperparametrov,
vrednotenje uspešnosti rešitve,
pripravo naučenega modela za uporabo v aplikaciji.
Ekipa lahko uporabi različne pristope, na primer:

lasten klasični algoritem računalniškega vida,
lasten ali prilagojen model strojnega učenja,
konvolucijsko nevronsko mrežo,
prenosno učenje,
uporabo vnaprej naučenega modela z dodatnim prilagajanjem,
kombinacijo klasičnih metod računalniškega vida in strojnega učenja.
Če ekipa uporabi prenosno učenje ali vnaprej naučen model, mora biti jasno razvidno, kaj je bilo dodano, prilagojeno ali naučeno v okviru projektne naloge. Samo uporaba že pripravljene knjižnice brez razumevanja, prilagoditve in vrednotenja ni dovolj.

V poročilu mora biti jasno predstavljeno:

kateri model oziroma algoritem je bil uporabljen,
zakaj je bil izbran,
kako je potekalo učenje oziroma nastavljanje algoritma,
kateri hiperparametri so bili optimizirani,
kako je potekala optimizacija hiperparametrov,
katere metrike so bile uporabljene za vrednotenje,
kakšni so bili rezultati na testnih podatkih.
Član 3: API, integracija sistema in priprava okolja za zagon
Član 3 je odgovoren za povezovanje posameznih delov sistema v delujočo celoto.

Naloge vključujejo:

pripravo aplikacijskega vmesnika oziroma API-ja,
povezavo naučenega modela z aplikacijo,
pripravo komunikacije med mobilno aplikacijo, spletno aplikacijo in strežniškim delom, če projekt to vključuje,
pripravo enostavnega načina zagona celotnega sistema,
pripravo Docker vsebnika za model oziroma strežniški del,
pripravo navodil za uporabo sistema.
API je obvezen del projekta, razen če ekipa izbere rešitev, pri kateri API smiselno ni potreben. V tem primeru mora ekipa v poročilu jasno utemeljiti drugačno arhitekturo sistema.

API mora omogočati uporabo modela v aplikaciji. Tipičen primer je, da aplikacija pošlje sliko na strežnik, API pa vrne rezultat obdelave, na primer:

prepoznani razred,
verjetnost,
odločitev, ali je uporabnik potrjen,
lokacije detektiranih objektov,
segmentacijsko masko,
drugo relevantno informacijo.
Celoten sistem se mora vzpostaviti čim bolj enostavno. Priporočljivo je, da se sistem zažene z eno skripto, na primer:

./start.sh
Opombe
Ekipe imajo pri izbiri projektne ideje proste roke. Rešitev ni nujno vezana na prepoznavo obraza, predmetov ali 2FA. Pomembno je, da projekt smiselno vključuje metode računalniškega vida in da je iz oddanega dela jasno razvidno:

kaj je bil cilj projekta,
kateri postopki računalniškega vida so bili uporabljeni,
kako je bil sistem implementiran,
kako uspešna je bila rešitev,
kaj je prispeval posamezni član ekipe.
Posebej se bo upoštevala samostojnost rešitve, razumevanje uporabljenih metod, kakovost implementacije in sposobnost povezovanja računalniškega vida z uporabno aplikacijo.