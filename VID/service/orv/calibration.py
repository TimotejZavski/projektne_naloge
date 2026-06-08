"""Kalibracija igrisca — jedro (brez GUI), uporabljeno v CLI in v API-ju.

Operater na enem frejmu doloci 4 ogljisca igralne povrsine. Iz njih zgradimo
homografijo v "ptičjo perspektivo" (top-down), kar omogoca:
  * test "ali je igralec znotraj igrisca" (point-in-polygon),
  * heatmap gibanja na zravnani povrsini (SCRUM-66).

Funkcije so ciste in vracajo numpy/python tipe; GUI risanje je v calibrate.py.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np


# ──────────────────────────────────────────────────────────────────────
def read_frame(source: str, frame_index: int = 120, proc_width: int | None = 960) -> np.ndarray:
    """Preberi en frame iz videa/slike, po potrebi zmanjsan na proc_width."""
    low = source.lower()
    if low.endswith((".jpg", ".jpeg", ".png", ".bmp")):
        frame = cv2.imread(source)
        if frame is None:
            raise FileNotFoundError(f"Slike ni mogoce odpreti: {source}")
    else:
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            raise FileNotFoundError(f"Vira ni mogoce odpreti: {source}")
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        idx = max(0, min(frame_index, total - 1)) if total > 0 else frame_index
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        cap.release()
        if not ok:
            raise RuntimeError(f"Branje frejma {idx} ni uspelo: {source}")
    if proc_width and frame.shape[1] > proc_width:
        h, w = frame.shape[:2]
        frame = cv2.resize(frame, (proc_width, int(round(h * proc_width / w))))
    return frame


# ──────────────────────────────────────────────────────────────────────
def order_quad(pts: np.ndarray) -> np.ndarray:
    """
    Uredi tocke v TL, TR, BR, BL — robustno tudi za sploscena (foreshortened)
    igrisca. N>4 (npr. konveksna ovojnica) najprej reduciramo na 4 skrajne tocke,
    nato razdelimo po Y (zgornji/spodnji par) in znotraj para po X.
    """
    pts = np.asarray(pts, dtype=np.float32).reshape(-1, 2)
    if len(pts) < 4:
        raise ValueError("order_quad potrebuje vsaj 4 tocke")
    if len(pts) > 4:
        s = pts.sum(axis=1)
        d = pts[:, 0] - pts[:, 1]
        pts = pts[[np.argmin(s), np.argmax(d), np.argmax(s), np.argmin(d)]]
    order = np.argsort(pts[:, 1])           # po visini
    top = pts[order[:2]]
    bottom = pts[order[2:]]
    tl, tr = top[np.argsort(top[:, 0])]     # levo/desno zgoraj
    bl, br = bottom[np.argsort(bottom[:, 0])]  # levo/desno spodaj
    return np.array([tl, tr, br, bl], dtype=np.float32)


def quad_is_degenerate(corners: np.ndarray, frame_area: float) -> bool:
    """True, ce poligon ni smiseln (premajhna ploscina / sploscen v crto)."""
    poly = np.asarray(corners, dtype=np.float32).reshape(-1, 1, 2)
    return cv2.contourArea(poly) < 0.02 * frame_area


# Razmerje pravega igrisca (širina:višina). FIBA polni teren = 28:15.
# Top-down kanvas uporablja TO razmerje (ne slikovnih robov), da homografija
# odstrani perspektivo namesto da bi zapekla foreshortening v sliko.
COURT_ASPECT = 28.0 / 15.0


def topdown_size(corners: np.ndarray, target_width: int = 840,
                 aspect: float = COURT_ASPECT) -> tuple[int, int]:
    """Kanonična velikost top-down pravokotnika (de-foreshorten, pravo razmerje)."""
    out_w = int(target_width)
    out_h = int(round(target_width / aspect))
    return out_w, out_h


def compute_homography(corners: np.ndarray, out_w: int, out_h: int) -> np.ndarray:
    """Homografija: 4 ogljisca v sliki -> top-down pravokotnik (out_w x out_h)."""
    src = np.asarray(corners, dtype=np.float32).reshape(4, 2)
    dst = np.array([[0, 0], [out_w, 0], [out_w, out_h], [0, out_h]], dtype=np.float32)
    return cv2.getPerspectiveTransform(src, dst)


def warp_topdown(frame: np.ndarray, H: np.ndarray, out_w: int, out_h: int) -> np.ndarray:
    return cv2.warpPerspective(frame, H, (out_w, out_h))


def point_in_court(x: float, y: float, corners: np.ndarray) -> bool:
    """Ali tocka (slikovne koord.) lezi znotraj poligona igrisca."""
    poly = np.asarray(corners, dtype=np.float32).reshape(-1, 1, 2)
    return cv2.pointPolygonTest(poly, (float(x), float(y)), False) >= 0


# ──────────────────────────────────────────────────────────────────────
def suggest_corners(frame: np.ndarray) -> np.ndarray:
    """
    Predlog 4 ogljisc (za gumb 'Suggest'): GrabCut iz grobega centralnega
    pravokotnika -> najvecja kontura -> konveksna ovojnica -> 4 skrajna ogljisca.
    Operater predlog nato popravi (povlece ogljisca).
    """
    h, w = frame.shape[:2]
    rect = (int(0.06 * w), int(0.30 * h), int(0.88 * w), int(0.50 * h))
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(frame, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, k, iterations=3)
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        # fallback: cel kader malo navznoter
        return order_quad(np.array([[0.1*w, 0.35*h], [0.9*w, 0.35*h],
                                    [0.9*w, 0.85*h], [0.1*w, 0.85*h]]))
    hull = cv2.convexHull(max(cnts, key=cv2.contourArea)).reshape(-1, 2)
    return order_quad(hull)


# ──────────────────────────────────────────────────────────────────────
def draw_overlay(frame: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """Nariši poligon igrisca + oznaceno/oznacena ogljisca (za preverjanje)."""
    out = frame.copy()
    pts = np.asarray(corners, dtype=np.int32).reshape(-1, 2)
    cv2.polylines(out, [pts], True, (0, 255, 0), 3)
    for (x, y), name in zip(pts, ["TL", "TR", "BR", "BL"]):
        cv2.circle(out, (int(x), int(y)), 8, (0, 0, 255), -1)
        cv2.putText(out, name, (int(x) + 10, int(y) - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    return out


# ──────────────────────────────────────────────────────────────────────
def build_calibration(corners: np.ndarray, frame_size: tuple[int, int]) -> dict:
    """Sestavi serializabilen kalibracijski zapis (corners + homografija)."""
    ordered = order_quad(corners)
    out_w, out_h = topdown_size(ordered)
    H = compute_homography(ordered, out_w, out_h)
    return {
        "frameSize": [int(frame_size[0]), int(frame_size[1])],
        "corners": ordered.tolist(),
        "topDownSize": [out_w, out_h],
        "homography": H.tolist(),
    }


def save_calibration(calib: dict, path: str | Path) -> None:
    Path(path).write_text(json.dumps(calib, indent=2), encoding="utf-8")


def load_calibration(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))
