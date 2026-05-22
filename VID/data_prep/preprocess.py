"""
PREDOBDELAVA SLIK za YOLOv8 model.
Demonstrira vse postopke iz README zahtev za Clana 1:

  1. Odstranjevanje suma (Gaussian blur, median blur)
  2. Sprememba velikosti slik (resize 640x640)
  3. Pretvorba v barvne prostore (BGR -> RGB, HSV)
  4. Normalizacija vrednosti slikovnih pik ([0,1] in ImageNet std)
  5. Linearizacija sivinskih vrednosti
  6. Izrezovanje relevantnih delov slike (ROI)
  7. Priprava ucne/validacijske/testne mnozice

Vsak korak shrani vmesni rezultat za pregled.
"""

from pathlib import Path

import cv2
import numpy as np

BASE = Path(__file__).parent
OUTPUT_DIR = BASE / "preprocess_demo"
IMAGE_SIZE = (640, 640)  # YOLOv8 default


# ============================================================
#  KORAK 1: OBSTRANJEVANJE SUMA
# ============================================================


def remove_noise_gaussian(img: np.ndarray, kernel_size: int = 5) -> np.ndarray:
    """Gaussov blur - odstrani visokofrekvencni sum."""
    ksize = kernel_size if kernel_size % 2 == 1 else kernel_size + 1
    return cv2.GaussianBlur(img, (ksize, ksize), 0)


def remove_noise_median(img: np.ndarray, kernel_size: int = 5) -> np.ndarray:
    """Median blur - odstrani 'salt and pepper' sum."""
    ksize = kernel_size if kernel_size % 2 == 1 else kernel_size + 1
    return cv2.medianBlur(img, ksize)


# ============================================================
#  KORAK 2: SPREMEMBA VELIKOSTI SLIK
# ============================================================


def resize_stretch(img: np.ndarray, size: tuple = IMAGE_SIZE) -> np.ndarray:
    """Direkten resize - raztegne sliko (pokvari razmerje). Samo za demo."""
    return cv2.resize(img, size, interpolation=cv2.INTER_LINEAR)


def resize_letterbox(
    img: np.ndarray, size: tuple = IMAGE_SIZE, color: tuple = (114, 114, 114)
) -> np.ndarray:
    """
    Letterbox resize - ohrani razmerje slike, doda padding.
    Takole dela YOLOv8 interno (ohrani obliko igralcev).
    """
    h, w = img.shape[:2]
    target_w, target_h = size

    # Izracunaj faktor zmanjsanja (ohrani razmerje)
    scale = min(target_w / w, target_h / h)
    new_w = int(w * scale)
    new_h = int(h * scale)

    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

    # Ustvari platno ciljne velikosti in centriraj
    canvas = np.full((target_h, target_w, 3), color, dtype=np.uint8)
    x_offset = (target_w - new_w) // 2
    y_offset = (target_h - new_h) // 2
    canvas[y_offset : y_offset + new_h, x_offset : x_offset + new_w] = resized

    return canvas


# ============================================================
#  KORAK 3: PRETVORBA V BARVNE PROSTORE
# ============================================================


def convert_color_spaces(img_bgr: np.ndarray) -> dict:
    """
    Pretvori BGR v razlicne barvne prostore.
    Vrne dict z vsemi verzijami.
    """
    return {
        "BGR": img_bgr,
        "RGB": cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB),
        "HSV": cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV),
        "LAB": cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB),
        "GRAY": cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY),
    }


# ============================================================
#  KORAK 4: NORMALIZACIJA VREDNOSTI SLIKOVNIH PIK
# ============================================================

# ImageNet povprecje in std (RGB vrednosti)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def normalize_minmax(img: np.ndarray) -> np.ndarray:
    """Normalizacija na obmocje [0, 1]."""
    return img.astype(np.float32) / 255.0


def normalize_imagenet(img_rgb: np.ndarray) -> np.ndarray:
    """Normalizacija z ImageNet parametri (pricakuje RGB, [0,1])."""
    img = img_rgb.astype(np.float32) / 255.0
    return (img - IMAGENET_MEAN) / IMAGENET_STD


def normalize_standardize(img: np.ndarray) -> np.ndarray:
    """Standardizacija: (x - mean) / std za celotno sliko."""
    img_f = img.astype(np.float32)
    mean = np.mean(img_f)
    std = np.std(img_f)
    if std == 0:
        std = 1.0
    return (img_f - mean) / std


# ============================================================
#  KORAK 5: LINEARIZACIJA SIVINSKIH VREDNOSTI
# ============================================================


def linearize_grayscale(img_gray: np.ndarray) -> np.ndarray:
    """
    Linearizacija sivinskih vrednosti z gamma korekcijo.
    Raztegne temne predele, stisne svetle.
    """
    # Gamma korekcija: I_out = I_in ^ gamma
    # gamma < 1 -> posvetli sence; gamma > 1 -> potemni svetle dele
    gamma = 0.8  # rahlo posvetli temne predele
    img_f = img_gray.astype(np.float32) / 255.0
    corrected = np.power(img_f, gamma)
    return (corrected * 255).astype(np.uint8)


def equalize_histogram(img_gray: np.ndarray) -> np.ndarray:
    """Histogramska izenacitev - izboljsa kontrast."""
    return cv2.equalizeHist(img_gray)


# ============================================================
#  KORAK 6: IZREZOVANJE RELEVANTNIH DELOV SLIKE (ROI)
# ============================================================


def extract_roi_center(img: np.ndarray, roi_percent: float = 0.75) -> np.ndarray:
    """Izreze osrednji del slike (npr. 75% centra)."""
    h, w = img.shape[:2]
    new_h = int(h * roi_percent)
    new_w = int(w * roi_percent)
    y = (h - new_h) // 2
    x = (w - new_w) // 2
    return img[y : y + new_h, x : x + new_w]


def extract_roi_bboxes(img: np.ndarray, label_path: Path) -> list[np.ndarray]:
    """Izreze ROI okoli vsakega bounding boxa iz YOLO labela."""
    h, w = img.shape[:2]
    rois = []

    if not label_path.exists():
        return rois

    with open(label_path) as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) != 5:
                continue
            xc, yc, bw, bh = map(float, parts[1:])
            cx = int(xc * w)
            cy = int(yc * h)
            half_w = int(bw * w / 2)
            half_h = int(bh * h / 2)

            x1 = max(0, cx - half_w)
            y1 = max(0, cy - half_h)
            x2 = min(w, cx + half_w)
            y2 = min(h, cy + half_h)

            if x2 > x1 and y2 > y1:
                rois.append(img[y1:y2, x1:x2])

    return rois


# ============================================================
#  KORAK 7: PRIPRAVA UCNE / VALIDACIJSKE / TESTNE MNOZICE
# ============================================================


def demo_split_info(data_dir: Path):
    """Demonstracija: izpise statistiko train/val/test delitve."""
    print("\n--- Informacije o mnozici ---")
    for subset in ["train", "valid", "test"]:
        imgs = data_dir / subset / "images"
        lbls = data_dir / subset / "labels"
        n_imgs = len(list(imgs.glob("*.jpg"))) if imgs.exists() else 0
        n_lbls = len(list(lbls.glob("*.txt"))) if lbls.exists() else 0
        print(f"  {subset:6s}: {n_imgs} slik, {n_lbls} labelov")


# ============================================================
#  DEMO: PRIKAZI VSE KORAKE NA ENI SLIKI
# ============================================================


def demo_full_pipeline(img_path: Path, label_path: Path = None):
    """Prikaze vse korake predobdelave na eni sliki."""
    img = cv2.imread(str(img_path))
    if img is None:
        print(f"  ERROR: ne morem brati {img_path}")
        return

    print(f"\nObdelujem: {img_path.name}")
    h, w = img.shape[:2]
    print(f"  Original dimenzije: {w}x{h}")

    # Shrani vse vmesne rezultate
    out_subdir = OUTPUT_DIR / img_path.stem
    out_subdir.mkdir(parents=True, exist_ok=True)

    # Korak 0: Original
    cv2.imwrite(str(out_subdir / "00_original.jpg"), img)

    # Korak 1: Odstranjevanje suma
    denoised_g = remove_noise_gaussian(img)
    denoised_m = remove_noise_median(img)
    cv2.imwrite(str(out_subdir / "01_denoised_gaussian.jpg"), denoised_g)
    cv2.imwrite(str(out_subdir / "01_denoised_median.jpg"), denoised_m)

    # Korak 2: Resize (obe metodi za primerjavo)
    resized_stretch = resize_stretch(img)
    resized_letterbox = resize_letterbox(img)
    cv2.imwrite(str(out_subdir / "02a_resize_stretch_640x640.jpg"), resized_stretch)
    cv2.imwrite(str(out_subdir / "02b_resize_letterbox_640x640.jpg"), resized_letterbox)
    print(f"  Stretch (pokvari ratio)    -> 02a_resize_stretch_640x640.jpg")
    print(f"  Letterbox (ohrani ratio)    -> 02b_resize_letterbox_640x640.jpg")

    # Korak 3: Barvni prostori
    colors = convert_color_spaces(img)
    cv2.imwrite(
        str(out_subdir / "03_RGB.jpg"), cv2.cvtColor(colors["RGB"], cv2.COLOR_RGB2BGR)
    )
    cv2.imwrite(str(out_subdir / "03_HSV.jpg"), colors["HSV"])
    cv2.imwrite(str(out_subdir / "03_LAB.jpg"), colors["LAB"])
    cv2.imwrite(str(out_subdir / "03_GRAY.jpg"), colors["GRAY"])

    # Korak 4: Normalizacija
    normalized = normalize_minmax(img)
    # shrani kot 8-bit za vizualni pregled
    cv2.imwrite(
        str(out_subdir / "04_normalized_0_1.jpg"), (normalized * 255).astype(np.uint8)
    )

    # Korak 5: Linearizacija sivinskih vrednosti
    gray = colors["GRAY"]
    linearized = linearize_grayscale(gray)
    equalized = equalize_histogram(gray)
    cv2.imwrite(str(out_subdir / "05_gamma_corrected.jpg"), linearized)
    cv2.imwrite(str(out_subdir / "05_histogram_equalized.jpg"), equalized)

    # Korak 6: Izrezovanje ROI
    roi_center = extract_roi_center(img, 0.75)
    cv2.imwrite(str(out_subdir / "06_roi_center.jpg"), roi_center)
    if label_path and label_path.exists():
        rois = extract_roi_bboxes(img, label_path)
        for i, roi in enumerate(rois[:5]):  # max 5
            cv2.imwrite(str(out_subdir / f"06_roi_bbox_{i}.jpg"), roi)

    print(f"  -> shranjeno v {out_subdir}")


# ============================================================
#  MAIN
# ============================================================


def main():
    print("PREDOBDELAVA SLIK - DEMO")
    print("=" * 60)

    # Pripravi izhodno mapo
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Najdi dataset
    dataset_dir = BASE.parent / "dataset"
    train_dir = dataset_dir / "train" / "images"

    if not train_dir.exists():
        print("ERROR: dataset/train/images ne obstaja. Najprej pozoni organize.py!")
        return

    # Demonstracija na prvih 3 slikah iz train mnozice
    images = sorted(train_dir.glob("*.jpg"))
    # Vzemi samo originale (brez augmentiranih)
    original_images = [
        p
        for p in images
        if not any(
            p.stem.endswith(f"_{a}")
            for a in ["flip", "rotate", "brightness", "noise", "crop"]
        )
    ]

    print(
        f"Nasel {len(images)} slik v train/images ({len(original_images)} originalov)"
    )

    demo_count = min(3, len(original_images))
    print(f"Demonstracija na prvih {demo_count} slikah:\n")

    for img_path in original_images[:demo_count]:
        lbl_path = train_dir.parent / "labels" / f"{img_path.stem}.txt"
        demo_full_pipeline(img_path, lbl_path if lbl_path.exists() else None)

    # Korak 7: Informacije o mnozicah
    demo_split_info(dataset_dir)

    print(f"\nVsi rezultati v: {OUTPUT_DIR}")
    print("\nKoncano! Preglej mape v preprocess_demo/ za vse vmesne rezultate.")


if __name__ == "__main__":
    main()
