"""
ORV živi prikaz: LIVE FEED (levo) + HEATMAP PO EKIPAH, ki se gradita v živo.

Predvaja video in sproti gradi vročinski karti za DVE ekipi (razvrščeni po barvi
dresa). Na feedu so okvirji obarvani po ekipi (dve barvi). Bere detections.json
(korak 2) + court.json (korak 1) — gladko predvajanje brez sprotnega YOLO-ja.

Tipke:  space = pavza/predvajaj   r = ponastavi heatmap   q = izhod
Uporaba:
    cd VID
    .venv/Scripts/python.exe service/live.py
    .venv/Scripts/python.exe service/live.py --sat 30      # počasnejša gradnja
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from orv import detection as det  # noqa: F401 (rezerva)
from orv import heatmap as hm
from orv import teams as tm

PANEL_H = 540  # višina panelov (px)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Živi prikaz: feed + heatmap po ekipah")
    p.add_argument("--det", default="court_out/detections.json")
    p.add_argument("--court", default="court_out/court.json")
    p.add_argument("--video", default=None, help="override video (sicer iz detections.json)")
    p.add_argument("--sigma", type=float, default=10.0, help="velikost žiga (razmaz)")
    p.add_argument("--sat", type=float, default=20.0,
                   help="hitrost gradnje: koliko obiskov do 'vroče' (večje=počasneje)")
    p.add_argument("--court-bg", dest="court_bg", default="court.jpg",
                   help="slika igrišča za ozadje heatmapa")
    p.add_argument("--decay", type=float, default=0.0,
                   help="0=čisto kopičenje (gradi se); npr. 0.97=sledi gibanja (bledenje)")
    p.add_argument("--fps", type=float, default=0.0, help="override hitrost (0=iz videa)")
    p.add_argument("--save", default=None, help="shrani side-by-side mp4")
    return p.parse_args()


def warmup_team_centers(source, entries, dw, dh, n_samples=50):
    """Predhodno oceni barvi obeh ekip iz vzorca frejmov (stabilna razvrstitev)."""
    frames = sorted(entries)
    step = max(1, len(frames) // n_samples)
    sample = frames[::step]
    cap = cv2.VideoCapture(source)
    colors = []
    for f in sample:
        cap.set(cv2.CAP_PROP_POS_FRAMES, f)
        ok, frame = cap.read()
        if not ok:
            continue
        fr = cv2.resize(frame, (dw, dh))
        for box in entries[f]["boxes"]:
            c = tm.jersey_color(fr, box)
            if c is not None:
                colors.append(c)
    cap.release()
    if len(colors) < 2:
        return (np.array([[128, 128, 128], [128, 128, 128]], np.float32),
                np.array([[0, 200, 0], [0, 165, 255]], np.uint8))
    _, centers_lab, centers_bgr = tm.cluster_teams(np.array(colors, np.float32), k=2)
    return centers_lab, centers_bgr


def draw_legend(img, color_bgr, label):
    cv2.rectangle(img, (8, 8), (8 + 190, 40), (20, 20, 20), -1)
    cv2.rectangle(img, (14, 14), (36, 34), tuple(int(c) for c in color_bgr), -1)
    cv2.rectangle(img, (14, 14), (36, 34), (255, 255, 255), 1)
    cv2.putText(img, label, (44, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)


def main() -> None:
    args = parse_args()
    det_data = json.loads(Path(args.det).read_text(encoding="utf-8"))
    court = json.loads(Path(args.court).read_text(encoding="utf-8"))

    dw, dh = det_data["width"], det_data["height"]
    H = np.array(court["homography"], dtype=np.float32)
    tw, th = court["topDownSize"]
    cfw, cfh = court["frameSize"]
    sx, sy = cfw / float(dw), cfh / float(dh)
    fps = args.fps or det_data.get("fps", 25.0)
    delay = max(1, int(1000.0 / fps))

    poly = np.array(court["corners"], dtype=np.float32)
    poly[:, 0] *= dw / float(cfw)
    poly[:, 1] *= dh / float(cfh)

    entries = {e["frame"]: e for e in det_data["frames"]}
    max_frame = max(entries) if entries else -1
    source = args.video or det_data["source"]

    print("racunam barvi ekip (warmup)...")
    centers_lab, centers_bgr = warmup_team_centers(source, entries, dw, dh)
    print("ekipi:", [tuple(int(c) for c in centers_bgr[t]) for t in range(2)], "(BGR)")

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise SystemExit(f"Videa ni mogoce odpreti: {source}")

    heat = [np.zeros((th, tw), np.float32), np.zeros((th, tw), np.float32)]
    stamp = hm.gaussian_stamp(args.sigma)
    bg = hm.court_background(args.court_bg, (tw, th))
    feed_w = int(round(PANEL_H * dw / dh))
    heat_w = int(round(PANEL_H * tw / th))
    writer = None
    if args.save:
        writer = cv2.VideoWriter(args.save, cv2.VideoWriter_fourcc(*"mp4v"),
                                 fps, (feed_w + 2 * heat_w, PANEL_H))

    win = "ORV live: feed | TEAM 0 | TEAM 1  (q izhod, space pavza, r reset)"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    print(f"predvajam {len(entries)} frejmov @ {fps:.0f}fps")

    idx, paused = 0, False
    while idx <= max_frame:
        ok, frame = cap.read()
        if not ok:
            break
        e = entries.get(idx)
        if e is not None:
            fr = cv2.resize(frame, (dw, dh))
            cv2.polylines(fr, [poly.astype(np.int32)], True, (0, 180, 255), 2)

            if args.decay > 0:
                heat[0] *= args.decay
                heat[1] *= args.decay

            counts = [0, 0]
            for box, foot in zip(e["boxes"], e["feet"]):
                col = tm.jersey_color(fr, box)
                team = tm.assign_team(col, centers_lab) if col is not None else 0
                counts[team] += 1
                bgr = tuple(int(c) for c in centers_bgr[team])
                x1, y1, x2, y2 = (int(v) for v in box)
                cv2.rectangle(fr, (x1, y1), (x2, y2), bgr, 2)
                cv2.circle(fr, (int(foot[0]), int(foot[1])), 3, (0, 0, 255), -1)
                p = hm.warp_points(np.array([[foot[0] * sx, foot[1] * sy]], np.float32), H)[0]
                hm.add_splat(heat[team], p[0], p[1], stamp)

            cv2.putText(fr, f"LIVE FEED  frame {idx}  na igriscu: {counts[0] + counts[1]}",
                        (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

            panels = [cv2.resize(fr, (feed_w, PANEL_H))]
            for t in range(2):
                im = hm.render_buildup(heat[t], bg, sigma=0, k=args.sat, fixed=True)
                draw_legend(im, centers_bgr[t], f"TEAM {t}  ({counts[t]})")
                panels.append(cv2.resize(im, (heat_w, PANEL_H)))
            combined = np.hstack(panels)
            cv2.imshow(win, combined)
            if writer is not None:
                writer.write(combined)

        idx += 1
        key = cv2.waitKey(delay) & 0xFF
        while paused and (key not in (ord(" "), ord("q"))):
            key = cv2.waitKey(30) & 0xFF
        if key == ord("q"):
            break
        if key == ord(" "):
            paused = not paused
        elif key == ord("r"):
            heat[0][:] = 0
            heat[1][:] = 0

    cap.release()
    if writer is not None:
        writer.release()
        print(f"shranjeno -> {args.save}")
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
