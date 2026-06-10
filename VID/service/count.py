"""
SCRUM-66 — KORAK 3 cevovoda: zasedenost skozi čas.

Bere detections.json (korak 2) in izpiše:
  * counts.csv     — na frame: players / waiting / refs / busy,
  * occupancy.json — povzetek (status, vrh, povprečje) + zaznane seje + perFrame.
Iste strukture API vrne prek /orv/courts/{id}/status, /occupancy, /sessions.

Uporaba:
    cd VID
    .venv/Scripts/python.exe service/count.py
    .venv/Scripts/python.exe service/count.py --busy-min 3
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from orv import occupancy as occ


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Zasedenost igrišča skozi čas")
    p.add_argument("--det", default="court_out/detections.json")
    p.add_argument("--out", default="court_out")
    p.add_argument("--busy-min", dest="busy_min", type=int, default=2,
                   help="koliko igralcev = ZASEDENO")
    p.add_argument("--smooth", type=int, default=15, help="okno glajenja (frejmi)")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    det = json.loads(Path(args.det).read_text(encoding="utf-8"))

    res = occ.compute(det, busy_min=args.busy_min, smooth_win=args.smooth)

    # counts.csv
    with open(out_dir / "counts.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["frame", "players", "waiting", "refs", "busy"])
        for p in res["perFrame"]:
            w.writerow([p["frame"], p["players"], p["waiting"], p["refs"], int(p["busy"])])

    (out_dir / "occupancy.json").write_text(
        json.dumps({"summary": res["summary"], "sessions": res["sessions"]}, indent=2),
        encoding="utf-8")

    s = res["summary"]
    print("=" * 50)
    print(f"STATUS: {s['status']}  (busy_min={s['busyMin']})")
    print(f"trenutno: {s['currentPlayers']} igralcev | {s['currentWaiting']} čaka ob strani")
    print(f"povprečje: {s['avgPlayers']} | vrh: {s['peakPlayers']} igralcev | "
          f"zasedeno {int(s['busyFraction']*100)}% časa")
    print(f"zaznane seje: {s['sessions']}")
    for i, ses in enumerate(res["sessions"], 1):
        print(f"  seja {i}: frame {ses['startFrame']}-{ses['endFrame']} "
              f"({ses['durationSec']}s, vrh {ses['peakPlayers']})")
    print("-" * 50)
    print(f"izhod -> {out_dir/'counts.csv'} + {out_dir/'occupancy.json'}")


if __name__ == "__main__":
    main()
