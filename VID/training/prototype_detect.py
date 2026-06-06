"""
SCRUM-64: Prototip detekcije na eni slicici (vnaprej naucen model).

Cilj: dokazati, da vnaprej naucen YOLO model najde igralce (osebe) na sliki
kosarkarskega igrisca, PREDEN investiramo cas v ucenje/fine-tuning.

Model je nastavljiv prek MODEL_PATH:
  - privzeto "yolov8n.pt" (COCO, razred 'person') -> deluje takoj, brez API kljuca
  - za SCRUM-65 ga zamenjamo z Roboflow kosarkarskimi utezmi (training/models/*.pt)

Uporaba:
    .venv/Scripts/python.exe training/prototype_detect.py [pot/do/slike.jpg]

Brez argumenta vzame prvo sliko iz dataset/test/images/.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
from ultralytics import YOLO

BASE = Path(__file__).resolve().parent
DATASET_TEST = BASE.parent / "dataset" / "test" / "images"
OUT_DIR = BASE / "prototype_out"

# Za prototip uporabimo stock COCO model. Za SCRUM-65 pokazi na Roboflow utezi.
MODEL_PATH = "yolov8n.pt"

# COCO 'person' razred ima id 0. To je proxy za "igralca" v tem prototipu.
PERSON_CLASS_ID = 0
CONF_THRES = 0.25


def pick_image() -> Path:
    imgs = sorted(DATASET_TEST.glob("*.jpg"))
    if not imgs:
        sys.exit(f"Ni slik v {DATASET_TEST}")
    return imgs[0]


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)

    img_path = Path(sys.argv[1]) if len(sys.argv) > 1 else pick_image()
    if not img_path.exists():
        sys.exit(f"Slika ne obstaja: {img_path}")

    print(f"Model:  {MODEL_PATH}")
    print(f"Slika:  {img_path.name}")

    model = YOLO(MODEL_PATH)
    results = model(str(img_path), conf=CONF_THRES, verbose=False)
    r = results[0]

    img = cv2.imread(str(img_path))
    persons = 0

    for box in r.boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        if cls_id != PERSON_CLASS_ID:
            continue
        persons += 1
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            img, f"player {conf:.2f}", (x1, max(0, y1 - 6)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA
        )

    cv2.putText(
        img, f"Najdenih igralcev: {persons}", (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2, cv2.LINE_AA
    )

    out_path = OUT_DIR / f"proto_{img_path.stem}.jpg"
    cv2.imwrite(str(out_path), img)

    print(f"Najdenih igralcev (razred person): {persons}")
    print(f"Anotirana slika shranjena -> {out_path}")


if __name__ == "__main__":
    main()
