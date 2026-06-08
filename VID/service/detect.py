"""
SCRUM-65 — KORAK 2 cevovoda: detekcija igralcev.

Požene YOLO čez video, nariše okvirje + 'foot' točke na vsak frame in zapiše
annotated.mp4, ki ga lahko pregledaš (scrub) za vizualno potrditev kakovosti.

Po želji shrani detections.json (foot točke na frame), da koraka 3 (štetje) in
4 (heatmap) ne ponavljata detekcije.

Uporaba:
    cd VID
    .venv/Scripts/python.exe service/detect.py dataset/valid/videos/Q4_side_300-330.mp4
    .venv/Scripts/python.exe service/detect.py VIDEO --max-frames 60 --save-json

Privzete uteži: yolov8n.pt (COCO 'person'). Za fine-tuned model: --weights pot.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np

from orv import calibration as cal
from orv import detection as det


def load_court_polygon(path: str, ow: int, oh: int) -> np.ndarray | None:
    """Naloži court.json in skaliraj ogljišča na trenutno velikost obdelave."""
    calib = cal.load_calibration(path)
    fw, fh = calib.get("frameSize", [ow, oh])
    corners = np.array(calib["corners"], dtype=np.float32)
    corners[:, 0] *= ow / float(fw)
    corners[:, 1] *= oh / float(fh)
    return corners


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Detekcija igralcev (YOLO) -> annotated.mp4")
    p.add_argument("source", help="pot do videa")
    p.add_argument("--weights", default="yolov8s.pt", help="YOLO uteži (.pt); s > n za priklic")
    p.add_argument("--conf", type=float, default=0.25, help="prag zaupanja")
    p.add_argument("--classes", default="0", help="ID-ji razredov (vejica); COCO person=0")
    p.add_argument("--width", type=int, default=960, help="širina obdelave (kot kalibracija)")
    p.add_argument("--imgsz", type=int, default=640, help="YOLO vhodna velikost")
    p.add_argument("--stride", type=int, default=1, help="obdelaj vsak N-ti frame")
    p.add_argument("--max-frames", type=int, default=0, help="omeji st. frejmov (0=vse)")
    p.add_argument("--out", default="court_out", help="izhodna mapa")
    p.add_argument("--save-json", action="store_true", help="shrani detections.json")
    p.add_argument("--no-track", action="store_true",
                   help="samo detekcija brez sledenja (privzeto: sledenje z ID-ji)")
    p.add_argument("--tracker", default="bytetrack.yaml", help="ultralytics tracker config")
    p.add_argument("--court", default=None,
                   help="court.json — obdrži samo igralce, ki STOJIJO na igrišču")
    p.add_argument("--keep-outside", action="store_true",
                   help="izriši (sivo) tudi detekcije zunaj igrišča")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    classes = tuple(int(c) for c in args.classes.split(","))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(args.source)
    if not cap.isOpened():
        raise SystemExit(f"Videa ni mogoce odpreti: {args.source}")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    ow = args.width
    oh = int(round(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) * ow / cap.get(cv2.CAP_PROP_FRAME_WIDTH)))

    out_fps = src_fps / max(1, args.stride)
    writer = cv2.VideoWriter(str(out_dir / "annotated.mp4"),
                             cv2.VideoWriter_fourcc(*"mp4v"), out_fps, (ow, oh))

    print("=" * 56)
    print(f"YOLO uteži: {args.weights} | conf={args.conf} classes={classes}")
    print(f"video: {args.source} ({total} frejmov @ {src_fps:.1f}fps)")
    print(f"obdelava: {ow}x{oh}, stride={args.stride}, imgsz={args.imgsz}")
    print("=" * 56)

    model = det.load_model(args.weights)
    track = not args.no_track
    print(f"nacin: {'sledenje (ByteTrack, ID-ji)' if track else 'samo detekcija'}")
    court = load_court_polygon(args.court, ow, oh) if args.court else None
    print(f"filter igrisca: {'DA (' + args.court + ')' if court is not None else 'NE'}")
    names = None
    per_frame: list[dict] = []
    seen_ids: set[int] = set()
    frame_idx, processed, total_dets = 0, 0, 0
    t0 = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_idx % args.stride == 0:
            frame = cv2.resize(frame, (ow, oh))
            if track:
                dets, names = det.track_people(model, frame, args.conf, classes,
                                               args.imgsz, args.tracker)
            else:
                dets, names = det.detect_people(model, frame, args.conf, classes, args.imgsz)
            # kdo STOJI na igrišču (foot točka znotraj poligona)
            if court is not None:
                inside = [cal.point_in_court(d["foot"][0], d["foot"][1], court) for d in dets]
                cv2.polylines(frame, [court.astype(np.int32)], True, (0, 180, 255), 2)
            else:
                inside = [True] * len(dets)
            kept = [d for d, ins in zip(dets, inside) if ins]

            # izris: samo igralci na igrišču (z --keep-outside še sivi zunaj)
            if args.keep_outside or court is None:
                det.draw_detections(frame, dets, names, inside_flags=inside)
            else:
                det.draw_detections(frame, kept, names)

            for d in kept:
                if d.get("id", -1) >= 0:
                    seen_ids.add(d["id"])
            cv2.putText(frame, f"frame {frame_idx}  na igriscu: {len(kept)}/{len(dets)}  ID: {len(seen_ids)}",
                        (12, oh - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            writer.write(frame)
            total_dets += len(kept)
            processed += 1
            if args.save_json:
                per_frame.append({
                    "frame": frame_idx,
                    "feet": [d["foot"] for d in kept],
                    "ids": [d["id"] for d in kept],
                    "boxes": [d["xyxy"] for d in kept],
                    "conf": [d["conf"] for d in kept],
                })
            if processed % 50 == 0:
                print(f"  {processed} frejmov | zadnji: {len(dets)} igralcev | unikatnih ID: {len(seen_ids)}")
        frame_idx += 1
        if args.max_frames and processed >= args.max_frames:
            break

    cap.release()
    writer.release()
    dt = time.time() - t0

    if args.save_json:
        meta = {"source": args.source, "width": ow, "height": oh,
                "fps": out_fps, "stride": args.stride, "classes": list(classes),
                "tracked": track, "uniqueIds": len(seen_ids), "frames": per_frame}
        (out_dir / "detections.json").write_text(json.dumps(meta), encoding="utf-8")

    print("-" * 56)
    print(f"obdelanih {processed} frejmov v {dt:.1f}s ({processed/max(dt,1e-6):.1f} fps)")
    print(f"povprecno igralcev/frame: {total_dets/max(processed,1):.2f}")
    if track:
        print(f"unikatnih igralcev (ID-jev): {len(seen_ids)}  "
              f"(za zanesljivo sledenje uporabi --stride 1)")
    print(f"izhod -> {out_dir/'annotated.mp4'}" + (" + detections.json" if args.save_json else ""))


if __name__ == "__main__":
    main()
