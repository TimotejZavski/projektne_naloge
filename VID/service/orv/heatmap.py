"""Heatmap gibanja — jedro: kopiči 'foot' točke na zravnani (top-down) ploskvi.

Vhod so foot točke v slikovnih koordinatah; s homografijo jih preslikamo v
top-down prostor igrišča in seštejemo (z Gaussovim razmazom) -> intenziteta
zadrževanja/gibanja. Uporabljeno za globalni in per-ekipa heatmap.
"""

from __future__ import annotations

import cv2
import numpy as np


def warp_points(points_xy: np.ndarray, H: np.ndarray) -> np.ndarray:
    """Preslikaj Nx2 točk skozi homografijo H (slika -> top-down)."""
    pts = np.asarray(points_xy, dtype=np.float32).reshape(-1, 1, 2)
    if len(pts) == 0:
        return np.empty((0, 2), np.float32)
    return cv2.perspectiveTransform(pts, H).reshape(-1, 2)


def accumulate(points_xy: np.ndarray, size: tuple[int, int], sigma: float = 12.0) -> np.ndarray:
    """Sestej točke v mrežo (top-down velikost) in razmaži z Gaussom."""
    w, h = size
    grid = np.zeros((h, w), np.float32)
    for x, y in np.asarray(points_xy, dtype=np.float32).reshape(-1, 2):
        ix, iy = int(round(x)), int(round(y))
        if 0 <= ix < w and 0 <= iy < h:
            grid[iy, ix] += 1.0
    if sigma > 0:
        grid = cv2.GaussianBlur(grid, (0, 0), sigma)
    return grid


def render(grid: np.ndarray, background: np.ndarray | None = None,
           colormap: int = cv2.COLORMAP_JET, alpha: float = 0.65,
           thresh: int = 12) -> np.ndarray:
    """Mrežo intenzitete obarvaj (colormap) in zmešaj čez (zbledelo) ozadje."""
    m = float(grid.max())
    norm = (grid / m * 255).astype(np.uint8) if m > 0 else grid.astype(np.uint8)
    cm = cv2.applyColorMap(norm, colormap)
    if background is None:
        return cm
    bg = background.copy()
    mask = (norm > thresh)[..., None]
    blended = cv2.addWeighted(bg, 1 - alpha, cm, alpha, 0)
    return np.where(mask, blended, bg)


def topdown_background(frame_960: np.ndarray, H: np.ndarray,
                       size: tuple[int, int], fade: float = 0.45) -> np.ndarray:
    """Zravnaj en frame v top-down (kontekst igrišča) in ga zbledi kot ozadje."""
    w, h = size
    top = cv2.warpPerspective(frame_960, H, (w, h))
    white = np.full_like(top, 255)
    return cv2.addWeighted(top, fade, white, 1 - fade, 0)


def court_background(path: str, size: tuple[int, int]) -> np.ndarray:
    """Naloži diagram igrišča (npr. court.jpg) in ga prilagodi velikosti heatmapa."""
    w, h = size
    img = cv2.imread(path)
    if img is None:
        raise FileNotFoundError(f"Ozadja igrišča ni mogoče naložiti: {path}")
    return cv2.resize(img, (w, h))


def accumulate_counts(points_xy: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """Surovo štetje zadetkov na celico (BREZ razmaza) — za monotono gradnjo."""
    w, h = size
    grid = np.zeros((h, w), np.float32)
    for x, y in np.asarray(points_xy, dtype=np.float32).reshape(-1, 2):
        ix, iy = int(round(x)), int(round(y))
        if 0 <= ix < w and 0 <= iy < h:
            grid[iy, ix] += 1.0
    return grid


def gaussian_stamp(sigma: float = 9.0) -> np.ndarray:
    """Majhen Gaussov žig (vrh 1.0) — en obisk doda gladko izboklino te velikosti."""
    r = max(1, int(round(3 * sigma)))
    ax = np.arange(-r, r + 1)
    xx, yy = np.meshgrid(ax, ax)
    return np.exp(-(xx ** 2 + yy ** 2) / (2.0 * sigma ** 2)).astype(np.float32)


def add_splat(grid: np.ndarray, x: float, y: float, stamp: np.ndarray) -> None:
    """Prištej žig v mrežo na (x, y) z obrezovanjem na robovih (in-place)."""
    h, w = grid.shape
    r = stamp.shape[0] // 2
    ix, iy = int(round(x)), int(round(y))
    x0, y0, x1, y1 = ix - r, iy - r, ix + r + 1, iy + r + 1
    gx0, gy0, gx1, gy1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    if gx0 >= gx1 or gy0 >= gy1:
        return
    grid[gy0:gy1, gx0:gx1] += stamp[gy0 - y0:gy1 - y0, gx0 - x0:gx1 - x0]


def render_buildup(counts: np.ndarray, background: np.ndarray | None = None,
                   sigma: float = 10.0, k: float = 4.0, colormap: int = cv2.COLORMAP_JET,
                   alpha: float = 0.7, thresh: int = 8, fixed: bool = True) -> np.ndarray:
    """
    Render, ki se MONOTONO gradi: intenziteta celice = 1 - exp(-obiski/k), torej z
    naraščajočimi obiski raste in nikoli ne zbledi (ključno za živi prikaz).
    fixed=True: vsaka celica ima fiksno preslikavo (živo predvajanje, brez bledenja).
    fixed=False: na koncu normaliziramo na maksimum (lepši kontrast za statično sliko).
    """
    intensity = 1.0 - np.exp(-counts / max(k, 1e-6))      # 0..1, monotono v obiskih
    if sigma > 0:
        intensity = cv2.GaussianBlur(intensity, (0, 0), sigma)
    if not fixed:
        m = float(intensity.max())
        if m > 0:
            intensity = intensity / m
    norm8 = (np.clip(intensity, 0.0, 1.0) * 255).astype(np.uint8)
    cm = cv2.applyColorMap(norm8, colormap)
    if background is None:
        return cm
    bg = background.copy()
    mask = (norm8 > thresh)[..., None]
    blended = cv2.addWeighted(bg, 1 - alpha, cm, alpha, 0)
    return np.where(mask, blended, bg)
