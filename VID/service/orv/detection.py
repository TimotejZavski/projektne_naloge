"""Detekcija igralcev — jedro (deljeno med CLI in API).

Privzeto uporablja vnaprej naucen YOLOv8 (COCO 'person', razred 0) kot izhodisce.
Kasneje (SCRUM-65 fine-tune) zamenjamo utezi z modelom, naucenim na kosarkarskem
datasetu; vmesnik ostane enak.

Vsaka detekcija ima 'foot' tocko (sredina spodnjega roba okvirja) = kjer igralec
stoji. To tocko uporabita stetje (point-in-court) in heatmap.
"""

from __future__ import annotations

import cv2
import numpy as np

_MODEL_CACHE: dict[str, object] = {}


def load_model(weights: str = "yolov8n.pt"):
    """Nalozi (in predpomni) YOLO model. Lazy import, da je cv2-only del lahek."""
    if weights not in _MODEL_CACHE:
        from ultralytics import YOLO
        _MODEL_CACHE[weights] = YOLO(weights)
    return _MODEL_CACHE[weights]


def _boxes_to_dets(res) -> list[dict]:
    dets: list[dict] = []
    boxes = res.boxes
    if boxes is None:
        return dets
    for b in boxes:
        x1, y1, x2, y2 = (float(v) for v in b.xyxy[0].tolist())
        dets.append({
            "xyxy": [x1, y1, x2, y2],
            "conf": float(b.conf[0]),
            "cls": int(b.cls[0]),
            "foot": [(x1 + x2) / 2.0, y2],
            "id": int(b.id[0]) if b.id is not None else -1,
        })
    return dets


def detect_people(model, frame: np.ndarray, conf: float = 0.30,
                  classes: tuple[int, ...] = (0,), imgsz: int = 640) -> tuple[list[dict], dict]:
    """Detekcija na enem frejmu (brez ID-jev; id = -1)."""
    res = model.predict(frame, conf=conf, classes=list(classes), imgsz=imgsz, verbose=False)[0]
    return _boxes_to_dets(res), res.names


def track_people(model, frame: np.ndarray, conf: float = 0.30,
                 classes: tuple[int, ...] = (0,), imgsz: int = 640,
                 tracker: str = "bytetrack.yaml") -> tuple[list[dict], dict]:
    """
    Detekcija + sledenje: vsaki osebi dodeli obstojni ID skozi frejme (ByteTrack).
    Kliči zaporedno na frejmih istega toka (persist=True ohranja stanje sledilnika).
    ID omogoča per-igralec heatmap in trajektorije.
    """
    res = model.track(frame, conf=conf, classes=list(classes), imgsz=imgsz,
                      persist=True, tracker=tracker, verbose=False)[0]
    return _boxes_to_dets(res), res.names


def color_for_id(tid: int) -> tuple[int, int, int]:
    """Stabilna barva na ID (za vizualno ločevanje igralcev)."""
    if tid < 0:
        return (0, 200, 0)
    rng = (tid * 2654435761) & 0xFFFFFFFF  # Knuth hash
    return (int(50 + (rng & 0xFF) * 0.7),
            int(50 + ((rng >> 8) & 0xFF) * 0.7),
            int(50 + ((rng >> 16) & 0xFF) * 0.7))


def draw_detections(frame: np.ndarray, dets: list[dict], names: dict | None = None,
                    inside_flags: list[bool] | None = None) -> np.ndarray:
    """Nariši okvirje + 'foot' tocke. Po želji obarvaj glede na 'znotraj igrisca'."""
    out = frame
    for i, d in enumerate(dets):
        x1, y1, x2, y2 = (int(v) for v in d["xyxy"])
        inside = inside_flags[i] if inside_flags is not None else True
        tid = d.get("id", -1)
        color = color_for_id(tid) if inside else (120, 120, 120)
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        fx, fy = (int(v) for v in d["foot"])
        cv2.circle(out, (fx, fy), 4, (0, 0, 255), -1)
        label = f"#{tid}" if tid >= 0 else f"{names[d['cls']] if names else d['cls']}"
        label += f" {d['conf']:.2f}"
        cv2.putText(out, label, (x1, max(12, y1 - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    return out
