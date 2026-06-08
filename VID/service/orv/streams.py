"""MJPEG "kamera" tok — demo video predvajamo kot neskoncen tok slik.

To je "nasa stream povezava": brskalnik (ali cv2) jo bere kot mreznu kamero.
Vir se na koncu ovije (loop), da simulira zivo kamero.
"""

from __future__ import annotations

import time

import cv2
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from . import catalog, config

router = APIRouter(tags=["streams"])

BOUNDARY = "frame"


def _mjpeg(path: str, width: int, quality: int):
    """Generator multipart/x-mixed-replace okvirjev iz video datoteke (v zanki)."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise HTTPException(status_code=502, detail=f"Vira ni mogoce odpreti: {path}")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    delay = 1.0 / max(1.0, src_fps)
    enc = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # ovij = simuliraj zivo kamero
                continue
            h, w = frame.shape[:2]
            if w > width:
                frame = cv2.resize(frame, (width, int(round(h * width / w))))
            ok, buf = cv2.imencode(".jpg", frame, enc)
            if not ok:
                continue
            yield (
                b"--" + BOUNDARY.encode() + b"\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
            )
            time.sleep(delay)
    finally:
        cap.release()


@router.get("/streams")
def list_streams():
    """Razpolozljive kamera povezave (za '+' dialog in dokumentacijo demo-ja)."""
    return {"streams": catalog.list_streams()}


@router.get("/streams/{stream_id}")
def stream(stream_id: str):
    """Zivi MJPEG tok izbrane 'kamere'."""
    path = catalog.path_for(stream_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"Ni toka: {stream_id}")
    return StreamingResponse(
        _mjpeg(str(path), config.PROC_WIDTH, config.JPEG_QUALITY),
        media_type=f"multipart/x-mixed-replace; boundary={BOUNDARY}",
    )
