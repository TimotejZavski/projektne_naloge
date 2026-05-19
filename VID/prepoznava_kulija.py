import cv2
import numpy as np
from pathlib import Path

"""

SAMO KOT PRIMER ABSOLUTNO NI TO PROD/BETA/ALPHA ipd ready...


"""



# Barvni razponi v HSV (H:0-180, S:0-255, V:0-255)
BARVE = {
    "rdeca": ([160, 100, 50], [180, 255, 255]),
    "rdeca2": ([0, 100, 50], [10, 255, 255]),
    "modra": ([100, 120, 50], [140, 255, 255]),
    "zelena": ([35, 80, 50], [85, 255, 255]),
    "crna": ([0, 0, 0], [180, 255, 50])
}


def compute_color_centroids(data_dir: Path) -> dict:
    """Compute mean HSV centroid for each color folder found in data_dir.
    Falls back to reasonable defaults if no samples found.
    Returns mapping color_name -> HSV centroid (numpy array)
    """
    centroids = {}
    # map folder name prefixes to canonical color keys
    mapping = {
        'rdec': 'rdeca',
        'rdeca': 'rdeca',
        'modr': 'modra',
        'zelen': 'zelena',
        'crn': 'crna'
    }

    for child in data_dir.iterdir():
        if not child.is_dir():
            continue
        key = None
        name = child.name.lower()
        for pref, k in mapping.items():
            if name.startswith(pref):
                key = k
                break
        if key is None:
            continue

        sums = np.zeros(3, dtype=np.float64)
        count = 0
        for img_path in child.glob('*'):
            if img_path.suffix.lower() not in ('.jpg', '.jpeg', '.png'):
                continue
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            # take central region to avoid background
            h, w = hsv.shape[:2]
            cx1, cy1 = int(w*0.25), int(h*0.25)
            cx2, cy2 = int(w*0.75), int(h*0.75)
            crop = hsv[cy1:cy2, cx1:cx2]
            mean = cv2.mean(crop)[:3]
            sums += np.array(mean)
            count += 1

        if count > 0:
            centroids[key] = (sums / count).astype(np.float32)

    # fallback defaults if not computed
    defaults = {
        'rdeca': np.array([5.0, 200.0, 150.0], dtype=np.float32),
        'modra': np.array([120.0, 200.0, 120.0], dtype=np.float32),
        'zelena': np.array([60.0, 180.0, 120.0], dtype=np.float32),
        'crna': np.array([0.0, 0.0, 20.0], dtype=np.float32)
    }
    for k, v in defaults.items():
        if k not in centroids:
            centroids[k] = v

    return centroids


def color_from_contour(hsv_img: np.ndarray, contour, centroids: dict):
    """Estimate color name and confidence for given contour using centroids.
    Returns (best_color_name, confidence [0..1], mean_hsv)
    """
    x, y, w, h = cv2.boundingRect(contour)
    roi = hsv_img[y:y+h, x:x+w]
    if roi.size == 0:
        return None, 0.0, None
    mask = np.zeros(roi.shape[:2], dtype=np.uint8)
    cnt_shift = contour - [x, y]
    cv2.drawContours(mask, [cnt_shift], -1, 255, -1)
    mean_h = cv2.mean(roi, mask=mask)[:3]
    mean_h = np.array(mean_h, dtype=np.float32)

    dists = {}
    for name, centroid in centroids.items():
        dists[name] = np.linalg.norm(mean_h - centroid)

    best = min(dists, key=dists.get)
    # convert distance to confidence (simple)
    dist = dists[best]
    conf = 1.0 / (1.0 + dist)
    return best, float(conf), mean_h


def get_color_from_folder_path(slika_path: Path) -> str:
    """Extract color name from folder path.
    E.g., data/rdec_kuli/slika.jpg -> 'rdeca'
    """
    parent = slika_path.parent.name.lower()
    mapping = {
        'rdec_kuli': 'rdeca',
        'rdeca_kuli': 'rdeca',
        'modr_kuli': 'modra',
        'zeleni_kuli': 'zelena',
        'crn_kuli': 'crna'
    }
    for key, val in mapping.items():
        if parent.startswith(key.split('_')[0]):
            return val
    return None


def prepoznaj_kuli(pot_do_slike: Path, pot_za_shranjevanje: Path):
    """
    Prepozna kuli specifične barve iz dane mape.
    Iščemo samo barvo, ki je specifična za to mapo.
    """
    slika = cv2.imread(str(pot_do_slike))
    if slika is None:
        print(f"Napaka: Slike ni bilo mogoče naložiti s poti {pot_do_slike}")
        return

    # Determine color from folder
    barva = get_color_from_folder_path(pot_do_slike)
    if barva is None:
        print(f"Napaka: Ne morem определiti barvo iz poti {pot_do_slike.parent.name}")
        return

    sivinska_slika = cv2.cvtColor(slika, cv2.COLOR_BGR2GRAY)
    zamegljena_slika = cv2.GaussianBlur(slika, (11, 11), 0)
    hsv_slika = cv2.cvtColor(zamegljena_slika, cv2.COLOR_BGR2HSV)

    # Get color range for this specific color
    if barva not in BARVE:
        print(f"Napaka: Barva '{barva}' ni znana")
        return

    spodnja = np.array(BARVE[barva][0], dtype="uint8")
    zgornja = np.array(BARVE[barva][1], dtype="uint8")
    maska = cv2.inRange(hsv_slika, spodnja, zgornja)

    # Special handling for red (two ranges)
    if barva == "rdeca" and "rdeca2" in BARVE:
        spodnja2 = np.array(BARVE["rdeca2"][0], dtype="uint8")
        zgornja2 = np.array(BARVE["rdeca2"][1], dtype="uint8")
        maska2 = cv2.inRange(hsv_slika, spodnja2, zgornja2)
        maska = cv2.bitwise_or(maska, maska2)

    # Morphological cleaning
    h_img, w_img = sivinska_slika.shape
    ksize = max(3, int(min(h_img, w_img) * 0.01) | 1)
    maska = cv2.medianBlur(maska, ksize)
    maska = cv2.erode(maska, None, iterations=1)
    maska = cv2.dilate(maska, None, iterations=2)

    konture, _ = cv2.findContours(maska.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    najboljsi_kandidat = None
    najvisja_ocena = -1

    # Min area threshold: 3% of image for this color
    img_area = h_img * w_img
    min_area = max(200, int(img_area * 0.003))

    for kontura in konture:
        area = cv2.contourArea(kontura)
        if area < min_area:
            continue

        x, y, w, h = cv2.boundingRect(kontura)
        # Kuli je dolg, tanek objekt - strict aspect ratio
        razmerje = float(h) / w if w > 0 else 0
        razmerje_rev = float(w) / h if h > 0 else 0

        # Stroga filtracija: kuli mora biti vsaj 2.5x daljši kot širši
        if razmerje < 2.5 and razmerje_rev < 2.5:
            continue

        # Ignoriraj če je premajhna širina/višina (šum)
        if min(w, h) < 10:
            continue

        # Merjenje ostrine
        roi = sivinska_slika[y:y+h, x:x+w]
        if roi.size == 0:
            continue
        ostrina = cv2.Laplacian(roi, cv2.CV_64F).var()

        # Relativna velikost
        velikost_rel = area / img_area

        # Kombinirana ocena: preferiraj velike, ostre, dolge objekte
        ocena = ostrina * (1 + velikost_rel * 100) * (0.5 + razmerje / 10.0)

        if ocena > najvisja_ocena:
            najvisja_ocena = ocena
            najboljsi_kandidat = kontura

    if najboljsi_kandidat is not None:
        ((x, y), radij) = cv2.minEnclosingCircle(najboljsi_kandidat)

        # narišemo obrobo in oznako barve
        cv2.circle(slika, (int(x), int(y)), int(radij), (0, 255, 255), 2)
        cv2.circle(slika, (int(x), int(y)), 5, (0, 0, 255), -1)
        cv2.putText(slika, barva.upper(), (int(x - radij), int(y - radij - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
        print(f"✓ {pot_do_slike.name}: Najden '{barva}' kuli (score {najvisja_ocena:.1f})")
    else:
        print(f"✗ {pot_do_slike.name}: Ni najden noben '{barva}' kuli.")

    pot_za_shranjevanje.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(pot_za_shranjevanje), slika)
    print(f"Obdelana slika shranjena v {pot_za_shranjevanje}")


if __name__ == '__main__':
    trenutna_mapa = Path(__file__).parent
    podatkovna_mapa = trenutna_mapa / 'data'
    # results folder inside data (matches your structure)
    mapa_za_rezultate = podatkovna_mapa / 'rezultati'

    slike_za_obdelavo = []
    if podatkovna_mapa.is_dir():
        for podm in sorted(podatkovna_mapa.iterdir()):
            # skip the results folder itself
            if not podm.is_dir() or podm.name == 'rezultati':
                continue
            # collect images from each color folder
            slike_za_obdelavo.extend(list(podm.glob('*.jpg')))
            slike_za_obdelavo.extend(list(podm.glob('*.png')))
    else:
        print(f"Napaka: mapa 'data' ne obstaja v {trenutna_mapa}")

    if not slike_za_obdelavo:
        print("Ni najdenih slik za obdelavo v podmapah 'data/'.")
    else:
        mapa_za_rezultate.mkdir(parents=True, exist_ok=True)
        for slika_path in slike_za_obdelavo:
            ime_datoteke = slika_path.name
            pot_za_shranjevanje = mapa_za_rezultate / ime_datoteke
            prepoznaj_kuli(slika_path, pot_za_shranjevanje)
