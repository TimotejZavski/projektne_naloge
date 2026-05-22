# Timotej aka Raca: Zajem, priprava in augmentacija podatkov

## Opravljeno delo (za delo preskoci na 6. poglavje)

### Predpriprava:
  * iskanje primernega/ih videjev
  * nalaganje videoposnetka/ov

### 1. Zajem podatkov (`capture.py`)
- Skripta ekstrahira frame na vsakih 5 sekund iz vseh .mp4 videov v `absolutely_raw/`
- Podpira poljubno stevilo videov ?aka vse kar je not v mapi?
- Frejmi shranjeni v `raw_frames/` z imeni `vidX_frame_MMmSSs.jpg`

### 2. Selekcija frameov (`curate_frames.py`)
- Izbere raznolike frame iz vseh 3 videov (enakomerno porazdeljeno)
- Preskoci prvih 50 frameov na video (title screen/intro)
- Uporablja pixel-wise razliko za detekcijo podobnih frameov
- Cilj: ~150 slik (~50 na video)

### 3. Anotacija (Label Studio)
- Ročno anotiranih ~94 slik (bounding boxi za Ball, Hoop, Player, Ref)
- Izvozeno v YOLO format v `export/`

### 4. Organizacija podatkov (`organize.py`)
- Zdruzi lastne anotacije z Roboflow datasetom
- Popravi class ID mismatch (manjkajoc Court class, zamaknjeni ID-ji)
- Razdeli tvoje slike v train/valid/test (70/15/15)
- Koncna struktura: `dataset/train`, `dataset/valid`, `dataset/test`

### 5. Lastna augmentacija (`augment.py`)
- Horizontalni flip (z bounding box transformacijo)
- Rotacija ±15° (z bounding box transformacijo)
- Svetlost/kontrast
- Gaussov sum
- Random center crop (z bounding box clipanjem)
- Vse implementirano rocno z OpenCV/NumPy, brez zunanjih knjiznic

### 6. Predobdelava (`preprocess.py`)
- Odstranjevanje suma (Gaussian, median)
- Sprememba velikosti (640x640)
- Pretvorba v barvne prostore (RGB, HSV, LAB, GRAY)
- Normalizacija ([0,1], ImageNet, standardizacija)
- Linearizacija sivinskih vrednosti (gamma, histogram equalization)
- Izrezovanje ROI (center crop, bbox ROI)
- Analiza train/val/test mnozic

## Struktura datotek

```
data_prep/
├── absolutely_raw/          # originalni videi
│   ├── videoplayback1.mp4
│   ├── videoplayback2.mp4
│   └── videoplayback3.mp4
├── raw_frames/              # vsi ekstrahirani frejmi
├── curated_frames/          # izbrani raznoliki frejmi
├── export/                  # Label Studio izvoz
│   └── export_unzipped/
│       ├── labels/          # YOLO format .txt
│       └── classes.txt
├── augmented_output/        # demonstracijski izhod augmentacij
├── preprocess_demo/         # demonstracijski izhod predobdelave
├── capture.py
├── curate_frames.py
├── organize.py
├── augment.py
├── preprocess.py
└── WORK_DONE.md

../dataset/                  # koncni zdruzeni dataset za YOLOv8
├── train/
│   ├── images/
│   └── labels/
├── valid/
│   ├── images/
│   └── labels/
├── test/
│   ├── images/
│   └── labels/
└── data.yaml
```

## Navodila za zagon (po vrsti)

```bash
cd data_prep

# 1. Ekstrakcija frameov (ze narejeno)
python capture.py

# 2. Selekcija raznolikih frameov (ze narejeno)
python curate_frames.py

# 3. (Ročna anotacija v Label Studio - ze narejeno)

# 4. Organizacija + zdruzitev z Roboflow
python organize.py

```bash
(base) timzav@Lenovo-ZenBook-13 data_prep % python organize.py
==================================================
1. Ujemanje labelov s slikami ...
Label datotek: 98
OPOZORILO: 3 labelov brez slike:
  - vid2_frame_04m10s
  - vid2_frame_04m15s
  - vid2_frame_04m20s
   Ujemanih: 95 parov

2. Delitev na train/valid/test (70/15/15) ...
   train: 66
   valid: 14
   test: 15

3. Kopiranje tvojih podatkov ...
  train: 66 slik
  valid: 14 slik
  test: 15 slik

4. Dodajanje Roboflow podatkov ...
  Roboflow train: 0 slik dodanih
  Roboflow valid: 0 slik dodanih
  Roboflow test: 0 slik dodanih

5. data.yaml skopiran v /Users/timzav/Desktop/projektne_naloge/VID/dataset/data.yaml

==================================================
KONCNA STRUKTURA:
  train: 750 slik, 750 labelov
  valid: 186 slik, 186 labelov
  test: 24 slik, 24 labelov

Vse v: /Users/timzav/Desktop/projektne_naloge/VID/dataset
(base) timzav@Lenovo-ZenBook-13 data_prep % 
```

# 5. Augmentacija (ustvari 5x vec slik)
python augment.py
```bash
(base) timzav@Lenovo-ZenBook-13 data_prep % python augment.py
Augmentacija podatkov (lastna implementacija)
==================================================

--- train ---

--- valid ---

==================================================
REZULTAT:
  train: 3875 slik (original: 125, augmentiranih: 3750)
  valid: 961 slik (original: 31, augmentiranih: 930)
  test: 24 slik (original: 24, augmentiranih: 0)

Vse v: /Users/timzav/Desktop/projektne_naloge/VID/dataset
```

# 6. Demonstracija predobdelave
python preprocess.py
```

```bash
(base) timzav@Lenovo-ZenBook-13 data_prep % python preprocess.py
PREDOBDELAVA SLIK - DEMO
============================================================
Nasel 3875 slik v train/images (125 originalov)
Demonstracija na prvih 3 slikah:


Obdelujem: Basket_mp4-0000_jpg.rf.65ab0d32e83c535522550d86a72fa48f.jpg
  Original dimenzije: 640x640
  Stretch (pokvari ratio)    -> 02a_resize_stretch_640x640.jpg
  Letterbox (ohrani ratio)    -> 02b_resize_letterbox_640x640.jpg
  -> shranjeno v /Users/timzav/Desktop/projektne_naloge/VID/data_prep/preprocess_demo/Basket_mp4-0000_jpg.rf.65ab0d32e83c535522550d86a72fa48f

Obdelujem: Basket_mp4-0001_jpg.rf.5630c39947007bccaea00fabcac7092b.jpg
  Original dimenzije: 640x640
  Stretch (pokvari ratio)    -> 02a_resize_stretch_640x640.jpg
  Letterbox (ohrani ratio)    -> 02b_resize_letterbox_640x640.jpg
  -> shranjeno v /Users/timzav/Desktop/projektne_naloge/VID/data_prep/preprocess_demo/Basket_mp4-0001_jpg.rf.5630c39947007bccaea00fabcac7092b

Obdelujem: Basket_mp4-0003_jpg.rf.6983c0931d11963993456d16d6a69783.jpg
  Original dimenzije: 640x640
  Stretch (pokvari ratio)    -> 02a_resize_stretch_640x640.jpg
  Letterbox (ohrani ratio)    -> 02b_resize_letterbox_640x640.jpg
  -> shranjeno v /Users/timzav/Desktop/projektne_naloge/VID/data_prep/preprocess_demo/Basket_mp4-0003_jpg.rf.6983c0931d11963993456d16d6a69783

--- Informacije o mnozici ---
  train : 3875 slik, 3875 labelov
  valid : 961 slik, 961 labelov
  test  : 24 slik, 24 labelov

Vsi rezultati v: /Users/timzav/Desktop/projektne_naloge/VID/data_prep/preprocess_demo

Koncano! Preglej mape v preprocess_demo/ za vse vmesne rezultate.
(base) timzav@Lenovo-ZenBook-13 data_prep % 

```
