"""
ORV detekcija (KORAK 2). DVA modela, BREZ sledenja:
  * COCO YOLO (person) -> zanesljivo zazna VSE ljudi (igralce),
  * fine-tuned model    -> uporabljen SAMO za sodnike (razred Ref).
Oseba, ki se prekriva s sodnikovo detekcijo, je sodnik in se izloči. Ostali:
na igrišču = igralec, ob strani = čaka. ID-jev ne računamo — za heatmap po ekipah
štejejo le trenutni položaji (ekipo določimo po barvi dresa v koraku heatmap/live).

Zapiše annotated.mp4 (+ detections.json z razredi in 'inside' zastavico).

Uporaba:
    cd VID
    .venv/Scripts/python.exe service/detect.py dataset/valid/videos/Q4_side_300-330.mp4 \
        --court court_out/court.json --save-json
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


def load_court_polygon(path: str, ow: int, oh: int) -> np.ndarray:
    calib = cal.load_calibration(path)
    fw, fh = calib.get("frameSize", [ow, oh])
    corners = np.array(calib["corners"], dtype=np.float32)
    corners[:, 0] *= ow / float(fw)
    corners[:, 1] *= oh / float(fh)
    return corners


def iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    ua = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / ua if ua > 0 else 0.0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="ORV detekcija: COCO ljudje + fine-tuned sodniki")
    p.add_argument("source", help="pot do videa")
    p.add_argument("--weights", default="yolov8s.pt", help="COCO model za LJUDI (person)")
    p.add_argument("--ref-weights", dest="ref_weights", default="models/orv_pr.pt",
                   help="fine-tuned model, uporabljen SAMO za sodnike (Ref)")
    p.add_argument("--conf", type=float, default=0.25, help="prag za ljudi")
    p.add_argument("--ref-conf", dest="ref_conf", type=float, default=0.35, help="prag za sodnike")
    p.add_argument("--ref-iou", dest="ref_iou", type=float, default=0.30,
                   help="min IoU oseba<->sodnik, da osebo označimo kot sodnika")
    p.add_argument("--width", type=int, default=1280, help="širina obdelave")
    p.add_argument("--imgsz", type=int, default=1280, help="YOLO vhodna velikost")
    p.add_argument("--stride", type=int, default=1, help="obdelaj vsak N-ti frame")
    p.add_argument("--max-frames", type=int, default=0, help="omeji st. frejmov (0=vse)")
    p.add_argument("--out", default="court_out", help="izhodna mapa")
    p.add_argument("--save-json", action="store_true", help="shrani detections.json")
    p.add_argument("--court", default=None, help="court.json (inside/outside zastavica)")
    return p.parse_args()


def main() -> None:
    args = parse_args()
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
    print(f"ljudje: {args.weights} (conf {args.conf}) | sodniki: {args.ref_weights} (conf {args.ref_conf})")
    print(f"video: {args.source} ({total} frejmov) | obdelava {ow}x{oh} imgsz {args.imgsz}")
    print("=" * 56)

    coco = det.load_model(args.weights)
    refm = det.load_model(args.ref_weights)
    court = load_court_polygon(args.court, ow, oh) if args.court else None

    per_frame: list[dict] = []
    frame_idx, processed = 0, 0
    sum_in, sum_ref = 0, 0
    t0 = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_idx % args.stride == 0:
            frame = cv2.resize(frame, (ow, oh))
            people, _ = det.detect_people(coco, frame, args.conf, (0,), args.imgsz)
            refs, _ = det.detect_people(refm, frame, args.ref_conf, (1,), args.imgsz)
            ref_boxes = [r["xyxy"] for r in refs]

            if court is not None:
                cv2.polylines(frame, [court.astype(np.int32)], True, (0, 180, 255), 2)

            feet, boxes, confs, clss, insides = [], [], [], [], []
            n_in = n_out = n_ref = 0
            for d in people:
                box = d["xyxy"]
                is_ref = any(iou(box, rb) >= args.ref_iou for rb in ref_boxes)
                on_court = court is None or cal.point_in_court(d["foot"][0], d["foot"][1], court)
                x1, y1, x2, y2 = (int(v) for v in box)
                if is_ref:
                    n_ref += 1
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (140, 140, 140), 1)
                    cv2.putText(frame, "REF", (x1, max(12, y1 - 4)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (170, 170, 170), 1)
                else:
                    col = (0, 200, 0) if on_court else (110, 110, 110)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), col, 2 if on_court else 1)
                    fx, fy = (int(v) for v in d["foot"])
                    cv2.circle(frame, (fx, fy), 4, (0, 0, 255), -1)
                    n_in += int(on_court)
                    n_out += int(not on_court)

                feet.append(d["foot"]); boxes.append(box); confs.append(d["conf"])
                clss.append(1 if is_ref else 0); insides.append(bool(on_court))

            cv2.putText(frame, f"frame {frame_idx}  na igriscu: {n_in}  caka: {n_out}  sodniki: {n_ref}",
                        (12, oh - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            writer.write(frame)
            sum_in += n_in; sum_ref += n_ref
            processed += 1
            if args.save_json:
                per_frame.append({"frame": frame_idx, "feet": feet, "boxes": boxes,
                                  "conf": confs, "cls": clss, "inside": insides})
            if processed % 50 == 0:
                print(f"  {processed} frejmov | igralci na igriscu: {n_in} | sodniki: {n_ref}")
        frame_idx += 1
        if args.max_frames and processed >= args.max_frames:
            break

    cap.release()
    writer.release()
    dt = time.time() - t0

    if args.save_json:
        meta = {"source": args.source, "width": ow, "height": oh, "fps": out_fps,
                "stride": args.stride, "frames": per_frame}
        (out_dir / "detections.json").write_text(json.dumps(meta), encoding="utf-8")

    print("-" * 56)
    print(f"obdelanih {processed} frejmov v {dt:.1f}s ({processed/max(dt,1e-6):.1f} fps)")
    print(f"povprecno igralcev na igriscu/frame: {sum_in/max(processed,1):.2f} | "
          f"sodnikov/frame: {sum_ref/max(processed,1):.2f}")
    print(f"izhod -> {out_dir/'annotated.mp4'}" + (" + detections.json" if args.save_json else ""))


if __name__ == "__main__":
    main()
