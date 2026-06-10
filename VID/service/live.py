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
DISPLAY = [(255, 90, 0), (0, 165, 255)]  # vidni barvi ekip (BGR): modra / oranžna


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
    p.add_argument("--ref-dist", dest="ref_dist", type=float, default=0.0,
                   help="prag barvne razdalje za sodnika/drugo (0=samodejno); večje=manj izločanja")
    p.add_argument("--busy-min", dest="busy_min", type=int, default=2,
                   help="koliko igralcev na igrišču = ZASEDENO")
    p.add_argument("--decay", type=float, default=0.0,
                   help="0=čisto kopičenje (gradi se); npr. 0.97=sledi gibanja (bledenje)")
    p.add_argument("--fps", type=float, default=0.0, help="override hitrost (0=iz videa)")
    p.add_argument("--save", default=None, help="shrani side-by-side mp4")
    return p.parse_args()


def warmup_teams(source, entries, dw, dh, n_samples=80):
    """
    Oceni ekipi na ravni IGRALCA (ne frejma): za vsak track ID zberi vzorce barve
    dresa, vzemi mediano, nato gruči IGRALCE (k-means k=2). Vrne centra (Lab/BGR) in
    fiksno razvrstitev id->ekipa — mnogo stabilnejše od per-frame razvrščanja.
    """
    frames = sorted(entries)
    step = max(1, len(frames) // n_samples)
    cap = cv2.VideoCapture(source)
    id_colors: dict[int, list] = {}
    for f in frames[::step]:
        cap.set(cv2.CAP_PROP_POS_FRAMES, f)
        ok, frame = cap.read()
        if not ok:
            continue
        fr = cv2.resize(frame, (dw, dh))
        ef = entries[f]
        ins = ef.get("inside", [True] * len(ef["boxes"]))
        for box, tid, on_court in zip(ef["boxes"], ef["ids"], ins):
            if not on_court:                      # ekipe gradimo le iz igralcev na igrišču
                continue
            c = tm.jersey_color(fr, box)
            if c is not None:
                id_colors.setdefault(int(tid), []).append(c)
    cap.release()

    id_med = {i: np.median(np.array(cs, np.float32), axis=0)
              for i, cs in id_colors.items() if i >= 0 and cs}
    if len(id_med) < 2:
        return (np.array([[80, 128, 128], [220, 128, 128]], np.float32),
                np.array([[160, 160, 160], [40, 200, 235]], np.uint8), {}, 1e9)
    ids = list(id_med)
    meds = np.array([id_med[i] for i in ids], np.float32)
    _, centers_lab, centers_bgr = tm.cluster_teams(meds, k=2)

    # razdalja vsakega igralca do najbližjega centra; sodnik/drugo = barvni osamelec
    dmin = np.min(np.linalg.norm(meds[:, None, :] - centers_lab[None, :, :], axis=2), axis=1)
    p75 = float(np.percentile(dmin, 75))
    if float(dmin.max()) > 1.5 * (p75 + 1e-6):     # obstaja jasen osamelec
        ref_thresh = 1.8 * p75
    else:
        ref_thresh = 1e9                            # ni jasnega osamelca -> ne izločaj
    id_team = {}
    for i, dm in zip(ids, dmin):
        id_team[i] = -1 if dm > ref_thresh else int(
            np.argmin(np.linalg.norm(centers_lab - id_med[i], axis=1)))
    return centers_lab, centers_bgr, id_team, ref_thresh


def draw_legend(img, color_bgr, label):
    cv2.rectangle(img, (8, 8), (8 + 190, 40), (20, 20, 20), -1)
    cv2.rectangle(img, (14, 14), (36, 34), tuple(int(c) for c in color_bgr), -1)
    cv2.rectangle(img, (14, 14), (36, 34), (255, 255, 255), 1)
    cv2.putText(img, label, (44, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)


def team_for(tid, box, fr, centers_lab, votes, id_team, ref_thresh):
    """
    Stabilna ekipa na TRACK ID. Najprej fiksna odločitev iz warmupa (id_team, lahko
    -1 = sodnik/drugo); za nove ID-je uteženo glasovanje, ki se zaklene. Barvni
    osamelec (daleč od obeh kit-centrov) -> -1.
    """
    if tid is not None and tid in id_team:
        return id_team[tid]
    col = tm.jersey_color(fr, box)
    if col is not None:
        d = np.linalg.norm(centers_lab - col, axis=1)
        if float(d.min()) > ref_thresh:           # sodnik/drugo
            return -1
        inst = int(np.argmin(d))
        margin = 1.0 - float(d.min()) / (float(d.max()) + 1e-6)
        if tid is not None and tid >= 0:
            v = votes.setdefault(tid, np.zeros(2, np.float32))
            v[inst] += margin
            t = int(np.argmax(v)) if v.sum() > 0 else inst
            if v.sum() >= 3.0:
                id_team[tid] = t
            return t
        return inst
    if tid in votes and votes[tid].sum() > 0:
        return int(np.argmax(votes[tid]))
    return 0


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

    print("racunam ekipi po igralcih (warmup)...")
    centers_lab, centers_bgr, id_team, ref_thresh = warmup_teams(source, entries, dw, dh)
    if args.ref_dist > 0:
        ref_thresh = args.ref_dist
    n_ref = sum(1 for t in id_team.values() if t < 0)
    print(f"ekipi (kit BGR): {[tuple(int(c) for c in centers_bgr[t]) for t in range(2)]}"
          f" | igralcev: {len(id_team) - n_ref} | sodnik/drugo: {n_ref} | ref_thresh={ref_thresh:.1f}")

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise SystemExit(f"Videa ni mogoce odpreti: {source}")

    heat = [np.zeros((th, tw), np.float32), np.zeros((th, tw), np.float32)]
    votes: dict[int, np.ndarray] = {}              # ID -> [glasovi ekipa0, ekipa1]
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

            inside_flags = e.get("inside", [True] * len(e["boxes"]))
            counts = [0, 0]
            waiting = 0
            cur = [[], []]                      # trenutni top-down položaji po ekipi
            for box, foot, tid, on_court in zip(e["boxes"], e["feet"], e["ids"], inside_flags):
                x1, y1, x2, y2 = (int(v) for v in box)
                if not on_court:                # oseba ob strani (čaka / gleda)
                    waiting += 1
                    cv2.rectangle(fr, (x1, y1), (x2, y2), (90, 90, 90), 1)
                    continue
                team = team_for(tid, box, fr, centers_lab, votes, id_team, ref_thresh)
                if team < 0:                    # sodnik/drugo: siv okvir, brez štetja/heat
                    cv2.rectangle(fr, (x1, y1), (x2, y2), (140, 140, 140), 1)
                    cv2.putText(fr, "?", (x1, max(12, y1 - 4)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (170, 170, 170), 1)
                    continue
                counts[team] += 1
                cv2.rectangle(fr, (x1, y1), (x2, y2), DISPLAY[team], 2)
                cv2.circle(fr, (int(foot[0]), int(foot[1])), 3, (0, 0, 255), -1)
                p = hm.warp_points(np.array([[foot[0] * sx, foot[1] * sy]], np.float32), H)[0]
                hm.add_splat(heat[team], p[0], p[1], stamp)
                cur[team].append((float(p[0]), float(p[1])))

            players = counts[0] + counts[1]
            busy = players >= args.busy_min
            status = "ZASEDENO" if busy else "PROSTO"
            scol = (0, 0, 255) if busy else (0, 200, 0)
            cv2.rectangle(fr, (0, 0), (dw, 40), (20, 20, 20), -1)
            cv2.putText(fr, f"igralci: {players} (T0 {counts[0]}/T1 {counts[1]})   caka ob strani: {waiting}",
                        (12, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(fr, status, (dw - 175, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, scol, 2)

            panels = [cv2.resize(fr, (feed_w, PANEL_H))]
            for t in range(2):
                im = hm.render_buildup(heat[t], bg, sigma=0, k=args.sat, fixed=True)
                for px, py in cur[t]:           # žive pike trenutnih položajev
                    cv2.circle(im, (int(px), int(py)), 5, (255, 255, 255), -1)
                    cv2.circle(im, (int(px), int(py)), 5, (0, 0, 0), 1)
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
