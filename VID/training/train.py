"""
SCRUM-65: Ucenje (fine-tuning) modela za prepoznavo igralcev in igrisca.

Fine-tuna vnaprej naucen YOLOv8 model na nasem kosarkarskem datasetu.
Base utezi so nastavljive prek BASE_WEIGHTS:
  - "yolov8n.pt" (privzeto) -> COCO pretrained, transfer learning (lokalno, brez API)
  - "models/roboflow_basketball.pt" -> Roboflow kosarkarske utezi (glej README)

Dataset: VID/dataset/data.yaml (relativne poti razresi ultralytics glede na yaml).

Uporaba:
    .venv/Scripts/python.exe training/train.py
    .venv/Scripts/python.exe training/train.py --weights models/roboflow_basketball.pt --epochs 80

Rezultat: runs/orv_detector/<name>/weights/best.pt
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO

BASE = Path(__file__).resolve().parent
# Privzeto 1-razredni Player dataset; glej prepare_player.py.
DATA_YAML = BASE.parent / "dataset_player" / "data.yaml"
PROJECT_DIR = BASE / "runs"

# Privzete vrednosti — utemeljene v porocilu, optimizirane v SCRUM-70.
DEFAULTS = dict(
    weights="yolov8n.pt",   # base za transfer learning
    epochs=60,
    imgsz=640,
    batch=8,                # RTX 3060 Laptop (6 GB) — dvigni na 16 ce gre
    device=0,               # GPU; "cpu" ce ni CUDA
    name="finetune_v1",
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fine-tune YOLOv8 na ORV kosarkarskem datasetu")
    p.add_argument("--weights", default=DEFAULTS["weights"], help="base utezi (.pt)")
    p.add_argument("--data", default=str(DATA_YAML), help="pot do data.yaml")
    p.add_argument("--epochs", type=int, default=DEFAULTS["epochs"])
    p.add_argument("--imgsz", type=int, default=DEFAULTS["imgsz"])
    p.add_argument("--batch", type=int, default=DEFAULTS["batch"])
    p.add_argument("--device", default=DEFAULTS["device"])
    p.add_argument("--name", default=DEFAULTS["name"])
    return p.parse_args()


def main() -> None:
    args = parse_args()

    data_yaml = Path(args.data)
    if not data_yaml.exists():
        raise SystemExit(f"Ni data.yaml: {data_yaml}")

    print("=" * 60)
    print("ORV fine-tuning")
    print(f"  base utezi: {args.weights}")
    print(f"  dataset:    {data_yaml}")
    print(f"  epochs={args.epochs} imgsz={args.imgsz} batch={args.batch} device={args.device}")
    print("=" * 60)

    model = YOLO(args.weights)
    results = model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=str(PROJECT_DIR),
        name=args.name,
        patience=15,          # early stopping
        seed=42,              # ponovljivost
    )

    best = PROJECT_DIR / args.name / "weights" / "best.pt"
    print("\nKoncano.")
    print(f"  najboljse utezi -> {best}")
    print(f"  rezultati/grafi -> {PROJECT_DIR / args.name}")


if __name__ == "__main__":
    main()
