"""
SCRUM-65 (court) — KORAK 1 cevovoda: kalibracija igrisca.

Naloziš en frame iz videa, z mišjo klikneš 4 ogljišča igralne površine,
skripta shrani court.json (ogljišča + homografija) + slike za preverjanje.

To je samostojen, testabilen korak BREZ spletne strani. Srečko isto logiko
kasneje pokliče prek API-ja (PUT /orv/courts/{id}/calibration).

Uporaba (interaktivno):
    cd VID
    .venv/Scripts/python.exe service/calibrate.py dataset/valid/videos/Q4_side_300-330.mp4

    Tipke: klik = dodaj ogljišče (4) · u = razveljavi · r = reset
           g = predlog (GrabCut) · s = shrani · q = izhod

Uporaba (brez GUI, npr. za test/CI):
    .venv/Scripts/python.exe service/calibrate.py VIDEO --corners "120,150 480,135 720,300 80,300"
    .venv/Scripts/python.exe service/calibrate.py VIDEO --suggest --no-gui
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

from orv import calibration as cal


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Kalibracija igrišča (klik 4 ogljišča)")
    p.add_argument("source", help="pot do videa ali slike")
    p.add_argument("--frame", type=int, default=120, help="indeks frejma za kalibracijo")
    p.add_argument("--width", type=int, default=960, help="širina obdelave")
    p.add_argument("--out", default="court_out", help="izhodna mapa")
    p.add_argument("--corners", default=None,
                   help='ne-interaktivno: "x1,y1 x2,y2 x3,y3 x4,y4"')
    p.add_argument("--suggest", action="store_true", help="predlagaj ogljišča (GrabCut)")
    p.add_argument("--no-gui", action="store_true", help="brez okna (samo shrani)")
    return p.parse_args()


def parse_corners(s: str) -> np.ndarray:
    pts = [tuple(map(float, tok.split(","))) for tok in s.split()]
    if len(pts) != 4:
        raise SystemExit("--corners potrebuje natanko 4 tocke 'x,y'")
    return np.array(pts, dtype=np.float32)


def save_outputs(frame: np.ndarray, corners: np.ndarray, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    calib = cal.build_calibration(corners, (frame.shape[1], frame.shape[0]))
    cal.save_calibration(calib, out_dir / "court.json")

    overlay = cal.draw_overlay(frame, calib["corners"])
    cv2.imwrite(str(out_dir / "overlay.jpg"), overlay)

    ow, oh = calib["topDownSize"]
    H = np.array(calib["homography"], dtype=np.float32)
    cv2.imwrite(str(out_dir / "topdown.jpg"), cal.warp_topdown(frame, H, ow, oh))

    print(f"  shranjeno -> {out_dir}/court.json, overlay.jpg, topdown.jpg")
    print(f"  ogljišča (TL,TR,BR,BL): {np.array(calib['corners']).astype(int).tolist()}")
    print(f"  top-down velikost: {ow}x{oh}")


CORNER_HINTS = [
    "1/4  klikni ZGORAJ-LEVO  (daljni levi vogal igrisca)",
    "2/4  klikni ZGORAJ-DESNO (daljni desni vogal)",
    "3/4  klikni SPODAJ-DESNO (blizji desni vogal)",
    "4/4  klikni SPODAJ-LEVO  (blizji levi vogal)",
]


LOUPE_DST = 200  # velikost povecevalnega okna (px)


def run_gui(frame: np.ndarray, out_dir: Path, preset: np.ndarray | None) -> None:
    points: list[list[float]] = [] if preset is None else preset.tolist()
    frame_area = float(frame.shape[0] * frame.shape[1])
    fh, fw = frame.shape[:2]
    cursor = [fw // 2, fh // 2]
    zoom = [5]  # 2..10, nastavljivo s + / -
    win = "Kalibracija igrisca"

    def banner(vis, text, ok=True):
        cv2.rectangle(vis, (0, 0), (vis.shape[1], 34), (20, 20, 20), -1)
        cv2.putText(vis, text, (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    (0, 255, 0) if ok else (0, 165, 255), 2)

    def draw_loupe(vis):
        """Povecevalnik: izrez okoli kurzorja, povecan, s crosshairom = tocka klika."""
        mx, my = cursor
        src = max(8, LOUPE_DST // zoom[0])
        patch = cv2.getRectSubPix(frame, (src, src), (float(mx), float(my)))
        loupe = cv2.resize(patch, (LOUPE_DST, LOUPE_DST), interpolation=cv2.INTER_NEAREST)
        c = LOUPE_DST // 2
        cv2.line(loupe, (c, 0), (c, LOUPE_DST), (0, 255, 0), 1)
        cv2.line(loupe, (0, c), (LOUPE_DST, c), (0, 255, 0), 1)
        cv2.circle(loupe, (c, c), 3, (0, 0, 255), 1)
        cv2.rectangle(loupe, (0, 0), (LOUPE_DST - 1, LOUPE_DST - 1), (255, 255, 255), 2)
        cv2.putText(loupe, f"{mx},{my}  {zoom[0]}x", (6, LOUPE_DST - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        # postavi nasproti kurzorja, da ne zakriva obmocja klika
        x0 = 8 if mx > fw // 2 else fw - LOUPE_DST - 8
        y0 = 42
        vis[y0:y0 + LOUPE_DST, x0:x0 + LOUPE_DST] = loupe

    def redraw(msg: str | None = None, ok: bool = True):
        vis = frame.copy()
        for i, (x, y) in enumerate(points):
            cv2.circle(vis, (int(x), int(y)), 6, (0, 0, 255), -1)
            cv2.putText(vis, str(i + 1), (int(x) + 8, int(y) - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        if len(points) >= 2:
            cv2.polylines(vis, [np.int32(points)], len(points) == 4, (0, 255, 0), 2)
        draw_loupe(vis)
        if msg is None:
            msg = (CORNER_HINTS[len(points)] if len(points) < 4
                   else "4/4 OK -> S shrani | +/- zoom  u undo  r reset  g suggest  q izhod")
        banner(vis, msg, ok)
        cv2.imshow(win, vis)

    def on_mouse(event, x, y, flags, _):
        cursor[0] = max(0, min(fw - 1, x))
        cursor[1] = max(0, min(fh - 1, y))
        if event == cv2.EVENT_LBUTTONDOWN and len(points) < 4:
            points.append([float(cursor[0]), float(cursor[1])])
        redraw()

    # AUTOSIZE = 1:1 slikovne koordinate (brez popacenja klikov)
    cv2.namedWindow(win, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(win, on_mouse)
    redraw()

    while True:
        key = cv2.waitKey(20) & 0xFF
        if key == ord("q"):
            break
        if key in (ord("+"), ord("=")):
            zoom[0] = min(10, zoom[0] + 1); redraw()
        elif key in (ord("-"), ord("_")):
            zoom[0] = max(2, zoom[0] - 1); redraw()
        elif key == ord("u") and points:
            points.pop(); redraw()
        elif key == ord("r"):
            points.clear(); redraw()
        elif key == ord("g"):
            points[:] = cal.suggest_corners(frame).tolist()
            redraw("predlog (GrabCut) — popravi vogale ali r za reset")
        elif key == ord("s"):
            if len(points) != 4:
                redraw(f"rabim 4 vogale (trenutno {len(points)})", ok=False)
                continue
            quad = cal.order_quad(np.array(points, dtype=np.float32))
            if cal.quad_is_degenerate(quad, frame_area):
                redraw("poligon je sploscen/premajhen — klikni 4 PRAVE vogale "
                       "(z visinskim razponom)", ok=False)
                print("  ZAVRNJENO: sploscen poligon — vogali so skoraj v isti "
                      "vodoravni liniji. Klikni daljni IN blizji rob igrisca.")
                continue
            save_outputs(frame, np.array(points, dtype=np.float32), out_dir)
            redraw("shranjeno! q za izhod.")
    cv2.destroyAllWindows()


def main() -> None:
    args = parse_args()
    frame = cal.read_frame(args.source, args.frame, args.width)
    print(f"Frame: {frame.shape[1]}x{frame.shape[0]} iz {args.source} (idx {args.frame})")
    out_dir = Path(args.out)

    preset = None
    if args.corners:
        preset = parse_corners(args.corners)
    elif args.suggest:
        preset = cal.suggest_corners(frame)
        print(f"  predlog (GrabCut): {preset.astype(int).tolist()}")

    if args.no_gui or args.corners:
        if preset is None:
            raise SystemExit("brez GUI rabiš --corners ali --suggest")
        save_outputs(frame, preset, out_dir)
        return

    run_gui(frame, out_dir, preset)


if __name__ == "__main__":
    main()
