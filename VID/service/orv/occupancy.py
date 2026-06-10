"""Zasedenost igrišča — jedro (deljeno med CLI `count.py` in API).

Iz detekcij (detections.json) izpelje na frame:
  * players  = igralci NA igrišču (cls=0, inside),
  * waiting  = ljudje OB strani (cls=0, outside) — čakajo/gledajo,
  * refs     = sodniki (cls=1).
Iz tega: status Prosto/Zasedeno (zglajeno), zaznavanje sej (prazno->zasedeno->
prazno) in povzetek (vrh, povprečje, delež zasedenosti).

Vse je čisto in serializabilno — API vrne iste strukture prek HTTP.
"""

from __future__ import annotations

import numpy as np


def per_frame_counts(frames: list[dict]) -> list[dict]:
    """Za vsak frame vrni {frame, players, waiting, refs}."""
    out = []
    for e in frames:
        n = len(e.get("feet", []))
        cls = e.get("cls", [0] * n)
        ins = e.get("inside", [True] * n)
        players = sum(1 for c, i in zip(cls, ins) if c == 0 and i)
        waiting = sum(1 for c, i in zip(cls, ins) if c == 0 and not i)
        refs = sum(1 for c in cls if c == 1)
        out.append({"frame": e.get("frame", len(out)),
                    "players": players, "waiting": waiting, "refs": refs})
    return out


def mark_busy(per_frame: list[dict], busy_min: int, win: int = 15) -> list[dict]:
    """Zgladi št. igralcev (drseče povprečje) in označi busy = (zglajeno >= busy_min)."""
    if not per_frame:
        return per_frame
    pl = np.array([p["players"] for p in per_frame], dtype=np.float32)
    k = max(1, win)
    sm = np.convolve(pl, np.ones(k) / k, mode="same")
    for p, s in zip(per_frame, sm):
        p["busy"] = bool(s >= busy_min)
        p["smooth"] = round(float(s), 2)
    return per_frame


def detect_sessions(per_frame: list[dict], fps: float, exit_frames: int = 20) -> list[dict]:
    """Seja = neprekinjeno zasedeno obdobje (konča se po `exit_frames` praznih frejmih)."""
    sessions = []
    state = "empty"
    start = peak = empty_run = 0
    last_busy = 0
    for p in per_frame:
        if p["busy"]:
            empty_run = 0
            last_busy = p["frame"]
            if state == "empty":
                state, start, peak = "busy", p["frame"], p["players"]
            else:
                peak = max(peak, p["players"])
        elif state == "busy":
            empty_run += 1
            if empty_run >= exit_frames:
                sessions.append(_session(start, last_busy, peak, fps))
                state = "empty"
    if state == "busy":
        sessions.append(_session(start, last_busy, peak, fps))
    return sessions


def _session(start, end, peak, fps):
    return {"startFrame": int(start), "endFrame": int(end),
            "durationSec": round((end - start) / max(fps, 1e-6), 1),
            "peakPlayers": int(peak)}


def summarize(per_frame: list[dict], sessions: list[dict], fps: float, busy_min: int) -> dict:
    """Povzetek za status endpoint."""
    if not per_frame:
        return {"status": "PROSTO", "currentPlayers": 0, "currentWaiting": 0,
                "avgPlayers": 0, "peakPlayers": 0, "busyFraction": 0,
                "sessions": 0, "busyMin": busy_min, "fps": fps}
    pl = [p["players"] for p in per_frame]
    wt = [p["waiting"] for p in per_frame]
    last = per_frame[-1]
    return {
        "status": "ZASEDENO" if last["busy"] else "PROSTO",
        "currentPlayers": int(last["players"]),
        "currentWaiting": int(last["waiting"]),
        "avgPlayers": round(float(np.mean(pl)), 2),
        "peakPlayers": int(max(pl)),
        "peakWaiting": int(max(wt)),
        "busyFraction": round(sum(p["busy"] for p in per_frame) / len(per_frame), 2),
        "sessions": len(sessions),
        "busyMin": busy_min,
        "fps": fps,
    }


def compute(det_data: dict, busy_min: int = 2, smooth_win: int = 15,
            exit_frames: int = 20) -> dict:
    """Celota: detections.json (dict) -> {summary, sessions, perFrame}."""
    fps = float(det_data.get("fps", 25.0))
    pf = mark_busy(per_frame_counts(det_data.get("frames", [])), busy_min, smooth_win)
    sessions = detect_sessions(pf, fps, exit_frames)
    return {"summary": summarize(pf, sessions, fps, busy_min),
            "sessions": sessions, "perFrame": pf}
