"""
SCRUM-66 — KORAK 4 cevovoda: heatmap gibanja (globalni + per-ekipa).

Bere detections.json (foot točke + okvirji, korak 2) in court.json (homografija,
korak 1). Igralce GENERIČNO razvrsti v 2 ekipi po prevladujoči barvi dresa
(k-means, brez fiksnih barv), foot točke preslika v top-down in sešteje:
  * heatmap_global.jpg  — vsi igralci
  * heatmap_team0/1.jpg — po ekipi (odkrita barva v legendi)
  * heatmaps_montage.jpg — vse skupaj

Uporaba:
    cd VID
    .venv/Scripts/python.exe service/heatmap.py
    .venv/Scripts/python.exe service/heatmap.py --det court_out/detections.json \
        --court court_out/court.json --sigma 12
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from orv import heatmap as hm
from orv import teams as tm


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Heatmap gibanja (globalni + per-ekipa)")
    p.add_argument("--det", default="court_out/detections.json", help="detekcije (korak 2)")
    p.add_argument("--court", default="court_out/court.json", help="kalibracija (korak 1)")
    p.add_argument("--video", default=None, help="override video (sicer iz detections.json)")
    p.add_argument("--out", default="court_out", help="izhodna mapa")
    p.add_argument("--sigma", type=float, default=12.0, help="Gaussov razmaz heatmapa")
    p.add_argument("--sat", type=float, default=4.0, help="hitrost gradnje (manjše=hitreje vroče)")
    p.add_argument("--court-bg", dest="court_bg", default="court.jpg",
                   help="slika igrišča za ozadje heatmapa")
    p.add_argument("--no-teams", action="store_true", help="samo globalni heatmap")
    return p.parse_args()


def draw_legend(img, color_bgr, label, count):
    cv2.rectangle(img, (8, 8), (8 + 230, 44), (20, 20, 20), -1)
    cv2.rectangle(img, (14, 14), (40, 38), tuple(int(c) for c in color_bgr), -1)
    cv2.rectangle(img, (14, 14), (40, 38), (255, 255, 255), 1)
    cv2.putText(img, f"{label}  n={count}", (48, 32),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    return img


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out)

    det = json.loads(Path(args.det).read_text(encoding="utf-8"))
    court = json.loads(Path(args.court).read_text(encoding="utf-8"))

    dw, dh = det["width"], det["height"]
    H = np.array(court["homography"], dtype=np.float32)
    tw, th = court["topDownSize"]
    cfw, cfh = court["frameSize"]
    sx, sy = cfw / float(dw), cfh / float(dh)   # det prostor -> kalibracijski prostor

    entries = {e["frame"]: e for e in det["frames"]}
    max_frame = max(entries) if entries else -1
    source = args.video or det["source"]

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise SystemExit(f"Videa ni mogoce odpreti: {source}")

    feet_cal: list[list[float]] = []   # foot v kalibracijskem (960) prostoru
    colors: list[np.ndarray] = []

    print("=" * 56)
    print(f"det: {args.det} ({len(entries)} frejmov @ {dw}x{dh})")
    print(f"court: top-down {tw}x{th}, sigma={args.sigma}, teams={not args.no_teams}")
    print("=" * 56)

    idx = 0
    while idx <= max_frame:
        ok, frame = cap.read()
        if not ok:
            break
        e = entries.get(idx)
        if e is not None:
            fr = cv2.resize(frame, (dw, dh))
            for foot, box in zip(e["feet"], e["boxes"]):
                col = tm.jersey_color(fr, box)
                if col is None:
                    continue
                feet_cal.append([foot[0] * sx, foot[1] * sy])
                colors.append(col)
        idx += 1
    cap.release()

    if not feet_cal:
        raise SystemExit("Ni foot tock za heatmap (prazne detekcije).")

    td = hm.warp_points(np.array(feet_cal, dtype=np.float32), H)
    bg = hm.court_background(args.court_bg, (tw, th))   # ozadje: diagram igrišča
    out_dir.mkdir(parents=True, exist_ok=True)

    # globalni
    g = hm.accumulate_counts(td, (tw, th))
    global_img = hm.render_buildup(g, bg, sigma=args.sigma, k=args.sat, fixed=False)
    cv2.imwrite(str(out_dir / "heatmap_global.jpg"), global_img)
    print(f"globalni: {len(td)} tock -> heatmap_global.jpg")

    panels = [("GLOBAL", global_img)]
    if not args.no_teams:
        labels, centers_lab, centers_bgr = tm.cluster_teams(np.array(colors, dtype=np.float32), k=2)
        for t in range(2):
            sel = td[labels == t]
            grid = hm.accumulate_counts(sel, (tw, th))
            img = hm.render_buildup(grid, bg, sigma=args.sigma, k=args.sat, fixed=False)
            draw_legend(img, centers_bgr[t], f"TEAM {t}", len(sel))
            cv2.imwrite(str(out_dir / f"heatmap_team{t}.jpg"), img)
            bgr = centers_bgr[t]
            print(f"ekipa {t}: {len(sel)} tock | barva BGR={tuple(int(c) for c in bgr)} "
                  f"-> heatmap_team{t}.jpg")
            panels.append((f"TEAM {t}", img))

    # montage: global zgoraj, ekipi spodaj
    def lbl(img, text):
        out = img.copy()
        cv2.rectangle(out, (0, th - 26), (tw, th), (20, 20, 20), -1)
        cv2.putText(out, text, (10, th - 7), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        return out

    top = lbl(panels[0][1], panels[0][0])
    if len(panels) == 3:
        half = tw // 2
        b0 = cv2.resize(lbl(panels[1][1], panels[1][0]), (half, th))
        b1 = cv2.resize(lbl(panels[2][1], panels[2][0]), (tw - half, th))
        bottom = np.hstack([b0, b1])
        montage = np.vstack([top, bottom])
    else:
        montage = top
    cv2.imwrite(str(out_dir / "heatmaps_montage.jpg"), montage)
    print(f"montage -> {out_dir/'heatmaps_montage.jpg'}")


if __name__ == "__main__":
    main()
