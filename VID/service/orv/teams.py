"""Razvrščanje igralcev v 2 ekipi po barvi dresa — GENERIČNO (brez fiksnih barv).

Za vsako detekcijo vzamemo barvo dresa (mediana torzo regije v Lab prostoru),
nato z k-means (k=2) najdemo DVE prevladujoči barvi dresov in vsako detekcijo
pripišemo bližji. Deluje za rumeni/beli danes in črni/beli (ali katerikoli dve
barvi) jutri — ker barv ne predpisujemo, jih odkrijemo iz podatkov.

Lab prostor: L loči svetlo/temno (črna vs bela), a/b ločita barvo (rumena vs
bela) — torej en sam prostor pokrije oba primera.
"""

from __future__ import annotations

import cv2
import numpy as np


def jersey_color(frame: np.ndarray, box: list[float]) -> np.ndarray | None:
    """Mediana barve (Lab) torzo regije okvirja = barva dresa, robustna na ozadje."""
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    # torzo: zgornje-osrednji del (pod glavo, nad hlačami, brez robov/ozadja)
    tx1, tx2 = int(x1 + 0.25 * w), int(x2 - 0.25 * w)
    ty1, ty2 = int(y1 + 0.20 * h), int(y1 + 0.50 * h)
    H, W = frame.shape[:2]
    tx1, tx2 = max(0, min(tx1, W - 1)), max(0, min(tx2, W))
    ty1, ty2 = max(0, min(ty1, H - 1)), max(0, min(ty2, H))
    patch = frame[ty1:ty2, tx1:tx2]
    if patch.size == 0:
        patch = frame[max(0, int(y1)):int(y2), max(0, int(x1)):int(x2)]
    if patch.size == 0:
        return None
    lab = cv2.cvtColor(patch, cv2.COLOR_BGR2LAB).reshape(-1, 3)
    return np.median(lab, axis=0).astype(np.float32)


def cluster_teams(colors_lab: np.ndarray, k: int = 2):
    """
    K-means nad barvami dresov -> (labels, centers_lab, centers_bgr).
    centers_bgr so prikazne barve odkritih ekip (za legendo/vizualizacijo).
    """
    data = np.asarray(colors_lab, dtype=np.float32)
    if len(data) < k:
        # premalo vzorcev: vse v eno ekipo
        labels = np.zeros(len(data), dtype=np.int32)
        centers = np.repeat(data.mean(axis=0, keepdims=True), k, axis=0) if len(data) else np.zeros((k, 3), np.float32)
    else:
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 1.0)
        _, labels, centers = cv2.kmeans(data, k, None, criteria, 8, cv2.KMEANS_PP_CENTERS)
        labels = labels.flatten().astype(np.int32)
    centers_bgr = cv2.cvtColor(
        centers.reshape(1, k, 3).astype(np.uint8), cv2.COLOR_LAB2BGR
    ).reshape(k, 3)
    return labels, centers.astype(np.float32), centers_bgr


def assign_team(color_lab: np.ndarray, centers_lab: np.ndarray) -> int:
    """Pripiši barvo najbližjemu centru ekipe (evklidsko v Lab)."""
    d = np.linalg.norm(centers_lab - np.asarray(color_lab, dtype=np.float32), axis=1)
    return int(np.argmin(d))
