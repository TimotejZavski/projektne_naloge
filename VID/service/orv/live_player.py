"""Živo predvajanje na igrišče (za spletno stran).

En LivePlayer na igrišče vrti SKUPNO uro: ozadnja nit napreduje frame, sproti
riše annotated feed, gradi heatmap po ekipah in računa stanje (igralci/čaka/
status). Vsi streami berejo isto stanje -> feed, heatmap in podatki so sinhroni.

API izpostavi:
    GET /orv/courts/{id}/live/feed          MJPEG annotated video
    GET /orv/courts/{id}/live/heatmap?team= MJPEG heatmap (gradi se; global ali 0/1)
    GET /orv/courts/{id}/live/state          JSON trenutno stanje (poll vsako ~1s)

Brez sledenja/ID-jev: ekipo določimo per-frame po barvi dresa; sodnike loči model
(cls=1). Vir je obdelan detections.json + court.json v media/results/{id}.
"""

from __future__ import annotations

import json
import threading
import time

import cv2
import numpy as np

from . import config, heatmap as hm, teams as tm

DISPLAY = [(255, 90, 0), (0, 165, 255)]  # ekipi (BGR): modra / oranžna
COURT_BG = str(config.VID_ROOT / "court.jpg")


def _warmup_centers(source, entries, dw, dh, n=60):
    frames = sorted(entries)
    cap = cv2.VideoCapture(source)
    colors = []
    for f in frames[:: max(1, len(frames) // n)]:
        cap.set(cv2.CAP_PROP_POS_FRAMES, f)
        ok, fr = cap.read()
        if not ok:
            continue
        fr = cv2.resize(fr, (dw, dh))
        e = entries[f]
        ins = e.get("inside", [True] * len(e["boxes"]))
        cls = e.get("cls", [0] * len(e["boxes"]))
        for box, on_court, c in zip(e["boxes"], ins, cls):
            if on_court and c == 0:
                jc = tm.jersey_color(fr, box)
                if jc is not None:
                    colors.append(jc)
    cap.release()
    if len(colors) < 2:
        return (np.array([[80, 128, 128], [220, 128, 128]], np.float32),
                np.array([[160, 160, 160], [40, 200, 235]], np.uint8))
    _, lab, bgr = tm.cluster_teams(np.array(colors, np.float32), k=2)
    return lab, bgr


class LivePlayer:
    def __init__(self, court_id: str, busy_min: int = 2):
        rdir = config.RESULTS_DIR / court_id
        det = json.loads((rdir / "detections.json").read_text(encoding="utf-8"))
        court = json.loads((rdir / "court.json").read_text(encoding="utf-8"))

        self.busy_min = busy_min
        self.dw, self.dh = det["width"], det["height"]
        self.H = np.array(court["homography"], np.float32)
        self.tw, self.th = court["topDownSize"]
        cfw, cfh = court["frameSize"]
        self.sx, self.sy = cfw / self.dw, cfh / self.dh
        self.fps = float(det.get("fps", 25.0))
        self.source = det["source"]
        self.entries = {e["frame"]: e for e in det["frames"]}
        self.max_frame = max(self.entries) if self.entries else -1

        self.poly = np.array(court["corners"], np.float32)
        self.poly[:, 0] *= self.dw / float(cfw)
        self.poly[:, 1] *= self.dh / float(cfh)

        self.centers_lab, self.centers_bgr = _warmup_centers(self.source, self.entries, self.dw, self.dh)
        self.bg = hm.court_background(COURT_BG, (self.tw, self.th))
        self.stamp = hm.gaussian_stamp(10.0)
        self.heat = [np.zeros((self.th, self.tw), np.float32),
                     np.zeros((self.th, self.tw), np.float32)]
        self.feed_img = np.zeros((self.dh, self.dw, 3), np.uint8)
        self.cur = [[], []]
        self.state = {"status": "PROSTO", "players": 0, "team0": 0, "team1": 0,
                      "waiting": 0, "refs": 0, "frame": 0}
        self._lock = threading.Lock()
        self.running = True
        threading.Thread(target=self._loop, daemon=True).start()

    # ── ozadnja ura ──────────────────────────────────────────────────
    def _loop(self):
        cap = cv2.VideoCapture(self.source)
        idx, delay = 0, 1.0 / max(1.0, self.fps)
        while self.running:
            ok, frame = cap.read()
            if not ok:                       # konec -> ponovi (heatmap se NE resetira)
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                idx = 0
                continue
            e = self.entries.get(idx)
            if e is not None:
                self._step(cv2.resize(frame, (self.dw, self.dh)), idx, e)
            idx += 1
            time.sleep(delay)
        cap.release()

    def _step(self, fr, idx, e):
        cv2.polylines(fr, [self.poly.astype(np.int32)], True, (0, 180, 255), 2)
        ins = e.get("inside", [True] * len(e["boxes"]))
        cls = e.get("cls", [0] * len(e["boxes"]))
        counts = [0, 0]
        waiting = refs = 0
        cur = [[], []]
        for box, foot, on_court, c in zip(e["boxes"], e["feet"], ins, cls):
            x1, y1, x2, y2 = (int(v) for v in box)
            if c == 1:
                refs += 1
                cv2.rectangle(fr, (x1, y1), (x2, y2), (140, 140, 140), 1)
                cv2.putText(fr, "REF", (x1, max(12, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX,
                            0.45, (170, 170, 170), 1)
                continue
            if not on_court:
                waiting += 1
                cv2.rectangle(fr, (x1, y1), (x2, y2), (90, 90, 90), 1)
                continue
            col = tm.jersey_color(fr, box)
            team = int(np.argmin(np.linalg.norm(self.centers_lab - col, axis=1))) if col is not None else 0
            counts[team] += 1
            cv2.rectangle(fr, (x1, y1), (x2, y2), DISPLAY[team], 2)
            p = hm.warp_points(np.array([[foot[0] * self.sx, foot[1] * self.sy]], np.float32), self.H)[0]
            hm.add_splat(self.heat[team], p[0], p[1], self.stamp)
            cur[team].append((float(p[0]), float(p[1])))

        players = counts[0] + counts[1]
        cv2.rectangle(fr, (0, 0), (self.dw, 40), (20, 20, 20), -1)
        busy = players >= self.busy_min
        cv2.putText(fr, f"igralci: {players} (T0 {counts[0]}/T1 {counts[1]})  caka: {waiting}  sodniki: {refs}",
                    (12, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        cv2.putText(fr, "ZASEDENO" if busy else "PROSTO", (self.dw - 170, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255) if busy else (0, 200, 0), 2)
        with self._lock:
            self.feed_img = fr
            self.cur = cur
            self.state = {"status": "ZASEDENO" if busy else "PROSTO", "players": players,
                          "team0": counts[0], "team1": counts[1], "waiting": waiting,
                          "refs": refs, "frame": idx}

    # ── streami ──────────────────────────────────────────────────────
    def _encode(self, img):
        ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        return buf.tobytes() if ok else b""

    def feed_mjpeg(self):
        delay = 1.0 / max(1.0, self.fps)
        while self.running:
            with self._lock:
                img = self.feed_img
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + self._encode(img) + b"\r\n")
            time.sleep(delay)

    def heatmap_mjpeg(self, team):
        delay = 1.0 / max(1.0, self.fps)
        while self.running:
            with self._lock:
                if team is None:
                    grid = self.heat[0] + self.heat[1]
                    dots = self.cur[0] + self.cur[1]
                else:
                    grid = self.heat[team]
                    dots = self.cur[team]
            img = hm.render_buildup(grid, self.bg, sigma=0, k=20, fixed=True)
            for px, py in dots:
                cv2.circle(img, (int(px), int(py)), 5, (255, 255, 255), -1)
                cv2.circle(img, (int(px), int(py)), 5, (0, 0, 0), 1)
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + self._encode(img) + b"\r\n")
            time.sleep(delay)


# ── registry (en player na igrišče, lazy) ────────────────────────────
_players: dict[str, LivePlayer] = {}
_reg_lock = threading.Lock()


def get_player(court_id: str) -> LivePlayer:
    with _reg_lock:
        if court_id not in _players:
            _players[court_id] = LivePlayer(court_id)
        return _players[court_id]


def drop(court_id: str) -> None:
    """Odstrani predpomnjeni player (po ponovni obdelavi igrišča) — ustavi nit."""
    with _reg_lock:
        p = _players.pop(court_id, None)
    if p is not None:
        p.running = False
