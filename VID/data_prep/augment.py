"""
LASTNA IMPLEMENTACIJA augmentacije podatkov za YOLOv8 dataset.
Vsaka augmentacija je implementirana rocno z OpenCV + bounding box transformacijo.

Augmentacije:
  1. Horizontalni flip
  2. Rotacija ±15°
  3. Svetlost / kontrast
  4. Gaussov sum
  5. Random crop (center)

Uporaba: python augment.py
"""

import shutil
from pathlib import Path
from random import Random, uniform

import cv2
import numpy as np

# --- POTI ---
BASE = Path(__file__).parent
DATASET = BASE.parent / "dataset"
AUG_OUTPUT = BASE / "augmented_output"  # vmesni izhod za pregled

SEED = 42
rng = Random(SEED)


# ============================================================
#  BRALNE FUNKCIJE
# ============================================================


def read_yolo_labels(label_path: Path) -> list[tuple[int, float, float, float, float]]:
    """Prebere YOLO label file. Vrne [(class_id, xc, yc, w, h), ...]."""
    labels = []
    if not label_path.exists():
        return labels
    with open(label_path) as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) == 5:
                cls = int(parts[0])
                xc, yc, w, h = map(float, parts[1:])
                labels.append((cls, xc, yc, w, h))
    return labels


def write_yolo_labels(label_path: Path, labels: list[tuple]):
    """Zapise YOLO format labelov."""
    with open(label_path, "w") as f:
        for cls, xc, yc, w, h in labels:
            f.write(f"{cls} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")


# ============================================================
#  AUGMENTACIJA 1: HORIZONTALNI FLIP
# ============================================================


def augment_flip_horizontal(
    img: np.ndarray, labels: list[tuple]
) -> tuple[np.ndarray, list[tuple]]:
    """Zrcali sliko horizontalno. xc -> 1.0 - xc."""
    flipped = cv2.flip(img, 1)
    new_labels = []
    for cls, xc, yc, w, h in labels:
        new_labels.append((cls, 1.0 - xc, yc, w, h))
    return flipped, new_labels


# ============================================================
#  AUGMENTACIJA 2: ROTACIJA ±15°
# ============================================================


def augment_rotate(
    img: np.ndarray, labels: list[tuple], angle_deg: float = None
) -> tuple[np.ndarray, list[tuple]]:
    """
    Zavrti sliko za nakljucen kot med -15° in +15°.
    Bounding boxe transformira z rotacijsko matriko okoli centra slike.
    """
    if angle_deg is None:
        angle_deg = uniform(-15, 15)

    h, w = img.shape[:2]
    center = (w / 2, h / 2)
    M = cv2.getRotationMatrix2D(center, angle_deg, 1.0)

    # Izracunaj novo velikost bounding boxa za rotirano sliko
    cos = abs(M[0, 0])
    sin = abs(M[0, 1])
    new_w = int(h * sin + w * cos)
    new_h = int(h * cos + w * sin)
    M[0, 2] += new_w / 2 - center[0]
    M[1, 2] += new_h / 2 - center[1]

    rotated = cv2.warpAffine(img, M, (new_w, new_h), borderMode=cv2.BORDER_REFLECT)

    # Transformiraj bounding boxe
    new_labels = []
    for cls, xc, yc, bw, bh in labels:
        # YOLO relativne -> absolutne koordinate center tocke
        cx_abs = xc * w
        cy_abs = yc * h

        # Rotiraj center tocke
        pt = np.array([[cx_abs, cy_abs]], dtype=np.float32)
        pt_rot = cv2.transform(pt.reshape(1, 1, 2), M).reshape(2)
        cx_new, cy_new = pt_rot

        # Priblizno transformiraj sirino in visino (ohranimo razmerje)
        bw_new = bw * (new_w / w)
        bh_new = bh * (new_h / h)

        # Nazaj v relativne
        xc_rel = cx_new / new_w
        yc_rel = cy_new / new_h
        w_rel = bw_new
        h_rel = bh_new

        # Clip na [0, 1]
        if 0.0 <= xc_rel <= 1.0 and 0.0 <= yc_rel <= 1.0:
            new_labels.append((cls, xc_rel, yc_rel, w_rel, h_rel))

    return rotated, new_labels


# ============================================================
#  AUGMENTACIJA 3: SVETLOST IN KONTRAST
# ============================================================


def augment_brightness_contrast(
    img: np.ndarray,
    labels: list[tuple],
    alpha: float = None,  # kontrast: 1.0 = nespremenjeno
    beta: float = None,  # svetlost: 0 = nespremenjeno
) -> tuple[np.ndarray, list[tuple]]:
    """
    alpha: kontrast (0.5 - 1.5)
    beta:  svetlost (-30 do +30)
    Bounding boxi se ne spremenijo.
    """
    if alpha is None:
        alpha = uniform(0.6, 1.4)
    if beta is None:
        beta = uniform(-30, 30)

    adjusted = cv2.convertScaleAbs(img, alpha=alpha, beta=beta)
    return adjusted, labels  # boxi ostanejo isti


# ============================================================
#  AUGMENTACIJA 4: GAUSSOV SUM
# ============================================================


def augment_gaussian_noise(
    img: np.ndarray, labels: list[tuple], sigma: float = None
) -> tuple[np.ndarray, list[tuple]]:
    """
    Doda Gaussov sum s standardnim odklonom sigma.
    Boxi se ne spremenijo.
    """
    if sigma is None:
        sigma = uniform(5, 25)

    noise = np.random.normal(0, sigma, img.shape).astype(np.float32)
    noisy = cv2.add(img.astype(np.float32), noise)
    noisy = np.clip(noisy, 0, 255).astype(np.uint8)
    return noisy, labels


# ============================================================
#  AUGMENTACIJA 5: RANDOM CROP (CENTER)
# ============================================================


def augment_center_crop(
    img: np.ndarray, labels: list[tuple], scale: float = None
) -> tuple[np.ndarray, list[tuple]]:
    """
    Izreze osrednji del slike (zoom-in efekt).
    scale: faktor zmanjsanja (0.7 = obdrzi 70% slike).
    Boxe transformira glede na crop.
    """
    if scale is None:
        scale = uniform(0.7, 0.95)

    h, w = img.shape[:2]
    new_h = int(h * scale)
    new_w = int(w * scale)

    # Center crop
    y_start = (h - new_h) // 2
    x_start = (w - new_w) // 2
    cropped = img[y_start : y_start + new_h, x_start : x_start + new_w]

    # Transformiraj bounding boxe
    new_labels = []
    for cls, xc, yc, bw, bh in labels:
        # Prevedi YOLO relativne v absolutne koordinate originalne slike
        cx_abs = xc * w
        cy_abs = yc * h
        bw_abs = bw * w
        bh_abs = bh * h

        # Prevedi v koordinate croppane slike
        cx_new = cx_abs - x_start
        cy_new = cy_abs - y_start

        # Clip na crop obmocje
        left = cx_new - bw_abs / 2
        right = cx_new + bw_abs / 2
        top = cy_new - bh_abs / 2
        bottom = cy_new + bh_abs / 2

        # Ce je vsaj del boxa viden, ga obdrzimo (clippanega)
        if right > 0 and left < new_w and bottom > 0 and top < new_h:
            left_c = max(0, left)
            top_c = max(0, top)
            right_c = min(new_w, right)
            bottom_c = min(new_h, bottom)

            # Novi YOLO koeficienti v croppani sliki
            xc_rel = ((left_c + right_c) / 2) / new_w
            yc_rel = ((top_c + bottom_c) / 2) / new_h
            w_rel = (right_c - left_c) / new_w
            h_rel = (bottom_c - top_c) / new_h

            new_labels.append((cls, xc_rel, yc_rel, w_rel, h_rel))

    return cropped, new_labels


# ============================================================
#  GLAVNA ZANKA
# ============================================================

AUGMENTATIONS = [
    ("flip", augment_flip_horizontal, {}),
    ("rotate", augment_rotate, {}),
    ("brightness", augment_brightness_contrast, {}),
    ("noise", augment_gaussian_noise, {}),
    ("crop", augment_center_crop, {}),
]


def process_subset(subset: str):
    """Za vsako sliko v subsetu ustvari augmentirane razlicice."""
    src_img = DATASET / subset / "images"
    src_lbl = DATASET / subset / "labels"

    if not src_img.exists():
        return

    for img_path in sorted(src_img.glob("*.jpg")):
        lbl_path = src_lbl / f"{img_path.stem}.txt"
        if not lbl_path.exists():
            continue

        img = cv2.imread(str(img_path))
        if img is None:
            continue

        labels = read_yolo_labels(lbl_path)
        if not labels:
            continue

        base_name = img_path.stem

        for aug_name, aug_fn, _ in AUGMENTATIONS:
            try:
                aug_img, aug_labels = aug_fn(img, labels)
            except Exception as e:
                print(f"  ERROR {aug_name} na {img_path.name}: {e}")
                continue

            if aug_img is None or not aug_labels:
                continue

            aug_img_name = f"{base_name}_{aug_name}.jpg"
            aug_lbl_name = f"{base_name}_{aug_name}.txt"

            cv2.imwrite(str(src_img / aug_img_name), aug_img)
            write_yolo_labels(src_lbl / aug_lbl_name, aug_labels)

        # Demonstracijski izhod (samo prvih 5 slik)
        if AUG_OUTPUT.exists():
            demo_dir = AUG_OUTPUT / subset / base_name
            demo_dir.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(demo_dir / "original.jpg"), img)
            for aug_name, aug_fn, _ in AUGMENTATIONS:
                try:
                    aug_img, _ = aug_fn(img, labels)
                    if aug_img is not None:
                        cv2.imwrite(str(demo_dir / f"{aug_name}.jpg"), aug_img)
                except Exception:
                    pass


def main():
    print("Augmentacija podatkov (lastna implementacija)")
    print("=" * 50)

    subsets = ["train", "valid"]

    for subset in subsets:
        print(f"\n--- {subset} ---")
        process_subset(subset)

    # Izpisi koncno statistiko
    print("\n" + "=" * 50)
    print("REZULTAT:")
    AUG_SUFFIXES = ["flip", "rotate", "brightness", "noise", "crop"]
    for subset in ["train", "valid", "test"]:
        imgs_dir = DATASET / subset / "images"
        if imgs_dir.exists():
            all_jpg = list(imgs_dir.glob("*.jpg"))
            augmented = [
                p
                for p in all_jpg
                if any(p.stem.endswith(f"_{s}") for s in AUG_SUFFIXES)
            ]
            original = len(all_jpg) - len(augmented)
            print(
                f"  {subset}: {len(all_jpg)} slik "
                f"(original: {original}, augmentiranih: {len(augmented)})"
            )

    print(f"\nVse v: {DATASET}")


if __name__ == "__main__":
    main()
