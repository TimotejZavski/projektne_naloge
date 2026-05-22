"""
Zdruzi lastne anotacije (iz Label Studio exporta) z Roboflow datasetom.
- Popravi class ID mismatch (Label Studio: 0=Ball,1=Hoop,2=Player,3=Ref ->
  Roboflow: 0=Ball,1=Court,2=Hoop,3=Player,4=Ref)
- Razdeli tvoje slike v train/val/test (70/15/15)
- Zdruzi z Roboflow v enotno strukturo: dataset/train, dataset/valid, dataset/test
"""

import shutil
from pathlib import Path
from random import Random

# --- POTI ---
BASE = Path(__file__).parent
LABEL_DIR = BASE / "export" / "export_unzipped" / "labels"
IMAGE_DIR = BASE / "curated_frames"
ROBOFLOW_ROOT = BASE.parent / "Basketball court.v1i.yolov8"
OUTPUT_ROOT = BASE.parent / "dataset"

# --- REMAP: tvoj class ID -> Roboflow class ID ---
# Tvoje:   0=Ball, 1=Hoop, 2=Player, 3=Ref
# Roboflow: 0=Ball, 1=Court, 2=Hoop, 3=Player, 4=Ref
REMAP = {0: 0, 1: 2, 2: 3, 3: 4}

# --- SPLIT RAZMERJA ---
TRAIN_RATIO = 0.70
VALID_RATIO = 0.15
# TEST_RATIO = 0.15  (ostanek)

SEED = 42


def extract_clean_name(label_filename: str) -> str:
    """
    Label Studio lahko doda hash prefix.
    '3c75fcb6__vid2_frame_04m15s.txt' -> 'vid2_frame_04m15s.txt'
    'vid1_frame_04m10s.txt' -> 'vid1_frame_04m10s.txt'
    """
    name = label_filename  # najprej odstrani .txt ce je
    if name.endswith(".txt"):
        name = name[:-4]

    # ce vsebuje __, vzemi kar je za drugim __
    if "__" in name:
        name = name.split("__", 1)[1]

    return name


def match_labels_to_images():
    """Vrne dict: clean_name -> (label_path, image_path)."""
    # Preberi vse labele
    label_files = list(LABEL_DIR.glob("*.txt"))
    print(f"Label datotek: {len(label_files)}")

    matched = {}
    missing_images = []

    for lf in label_files:
        clean = extract_clean_name(lf.name)
        img_path = IMAGE_DIR / f"{clean}.jpg"

        if img_path.exists():
            matched[clean] = (lf, img_path)
        else:
            missing_images.append(clean)

    if missing_images:
        print(f"OPOZORILO: {len(missing_images)} labelov brez slike:")
        for m in missing_images[:5]:
            print(f"  - {m}")
        if len(missing_images) > 5:
            print(f"  ... in se {len(missing_images) - 5}")

    return matched


def remap_labels(label_path: Path) -> list[str]:
    """Prebere label file, remappa class ID-je, vrne vrstice."""
    remapped = []
    with open(label_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) != 5:
                continue
            old_id = int(parts[0])
            new_id = REMAP.get(old_id, old_id)
            parts[0] = str(new_id)
            remapped.append(" ".join(parts))
    return remapped


def split_data(matched: dict) -> dict:
    """Razdeli v train/val/test."""
    rng = Random(SEED)
    names = sorted(matched.keys())
    rng.shuffle(names)

    n = len(names)
    n_train = int(n * TRAIN_RATIO)
    n_valid = int(n * VALID_RATIO)

    return {
        "train": names[:n_train],
        "valid": names[n_train : n_train + n_valid],
        "test": names[n_train + n_valid :],
    }


def copy_custom_data(splits: dict, matched: dict):
    """Kopiraj tvoje slike + remappane labele v output strukturo."""
    for subset, names in splits.items():
        img_out = OUTPUT_ROOT / subset / "images"
        lbl_out = OUTPUT_ROOT / subset / "labels"
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)

        for name in names:
            label_path, image_path = matched[name]

            # Kopiraj sliko
            shutil.copy2(image_path, img_out / f"{name}.jpg")

            # Remappaj in shrani label
            remapped = remap_labels(label_path)
            dest_label = lbl_out / f"{name}.txt"
            with open(dest_label, "w") as f:
                f.write("\n".join(remapped) + "\n")

        print(f"  {subset}: {len(names)} slik")


def merge_roboflow(subset: str):
    """Kopiraj Roboflow slike in labele v output, ce se ne obstajajo."""
    # Roboflow uporablja 'valid' namesto 'val'
    rf_subset = "valid" if subset == "valid" else subset

    src_img = ROBOFLOW_ROOT / rf_subset / "images"
    src_lbl = ROBOFLOW_ROOT / rf_subset / "labels"
    dst_img = OUTPUT_ROOT / subset / "images"
    dst_lbl = OUTPUT_ROOT / subset / "labels"
    dst_img.mkdir(parents=True, exist_ok=True)
    dst_lbl.mkdir(parents=True, exist_ok=True)

    if not src_img.exists():
        print(f"  Roboflow {rf_subset} ne obstaja, preskakujem.")
        return

    count = 0
    for img in src_img.glob("*"):
        if img.suffix.lower() in (".jpg", ".jpeg", ".png"):
            dest = dst_img / img.name
            if not dest.exists():
                shutil.copy2(img, dest)
                count += 1

    for lbl in src_lbl.glob("*.txt"):
        dest = dst_lbl / lbl.name
        if not dest.exists():
            shutil.copy2(lbl, dest)

    print(f"  Roboflow {rf_subset}: {count} slik dodanih")


def main():
    print("=" * 50)
    print("1. Ujemanje labelov s slikami ...")
    matched = match_labels_to_images()
    print(f"   Ujemanih: {len(matched)} parov\n")

    print("2. Delitev na train/valid/test (70/15/15) ...")
    splits = split_data(matched)
    for s, names in splits.items():
        print(f"   {s}: {len(names)}")

    print("\n3. Kopiranje tvojih podatkov ...")
    copy_custom_data(splits, matched)

    print("\n4. Dodajanje Roboflow podatkov ...")
    for subset in ["train", "valid", "test"]:
        merge_roboflow(subset)

    # Skopiraj tudi data.yaml
    yaml_src = ROBOFLOW_ROOT / "data.yaml"
    yaml_dst = OUTPUT_ROOT / "data.yaml"
    shutil.copy2(yaml_src, yaml_dst)
    print(f"\n5. data.yaml skopiran v {yaml_dst}")

    # Izpisi statistiko
    print("\n" + "=" * 50)
    print("KONCNA STRUKTURA:")
    for subset in ["train", "valid", "test"]:
        imgs = list((OUTPUT_ROOT / subset / "images").glob("*"))
        lbls = list((OUTPUT_ROOT / subset / "labels").glob("*.txt"))
        print(f"  {subset}: {len(imgs)} slik, {len(lbls)} labelov")
    print(f"\nVse v: {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
