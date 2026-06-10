"""Courts API — registracija kamere na igrisce + zajem kalibracijskega frejma.

Tok: operater v RAI panelu klikne '+', prilepi naso stream povezavo ->
POST /orv/courts -> odpremo vir, zajamemo en frame (za risanje igrisca),
zapis dobi status CALIBRATING. Risanje poligona pride v PUT /calibration.
"""

from __future__ import annotations

import json

import cv2
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import numpy as np

from . import calibration as cal
from . import catalog, config, occupancy as occ, store

router = APIRouter(prefix="/orv/courts", tags=["courts"])

SEEK_FRAME = 120  # preskoci morebiten zacetek/intro


# ── shema ────────────────────────────────────────────────────────────
class AddCourtBody(BaseModel):
    raiCourtId: str = Field(..., description="ID igrisca iz RAI baze")
    streamUrl: str = Field(..., description="Kamera/stream povezava (nasa ali rtsp/http)")
    name: str | None = None


class Corner(BaseModel):
    x: float
    y: float


class CalibrationBody(BaseModel):
    corners: list[Corner] = Field(..., min_length=4, max_length=4)


# ── pomozno ──────────────────────────────────────────────────────────
def _grab_frame(stream_url: str):
    """Odpri vir in vrni en frame (zmanjsan na PROC_WIDTH) ali sprozi 502."""
    src = catalog.resolve_capture_source(stream_url)
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        raise HTTPException(status_code=502, detail=f"Stream povezave ni mogoce odpreti: {stream_url}")
    try:
        cap.set(cv2.CAP_PROP_POS_FRAMES, SEEK_FRAME)
        ok, frame = cap.read()
        if not ok:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = cap.read()
        if not ok:
            raise HTTPException(status_code=502, detail="Branje frejma ni uspelo.")
    finally:
        cap.release()

    h, w = frame.shape[:2]
    if w > config.PROC_WIDTH:
        frame = cv2.resize(frame, (config.PROC_WIDTH, int(round(h * config.PROC_WIDTH / w))))
    return frame


# ── endpointi ────────────────────────────────────────────────────────
@router.get("")
def list_courts():
    return {"courts": store.list_courts()}


@router.post("")
def add_court(body: AddCourtBody):
    frame = _grab_frame(body.streamUrl)
    fh, fw = frame.shape[:2]

    config.ensure_dirs()
    frame_path = config.FRAMES_DIR / f"{body.raiCourtId}.jpg"
    cv2.imwrite(str(frame_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])

    rec = store.upsert_court(body.raiCourtId, {
        "name": body.name or body.raiCourtId,
        "streamUrl": body.streamUrl,
        "status": "CALIBRATING",
        "calibration": None,
        "frameSize": [fw, fh],
        "streamView": f"{config.PUBLIC_BASE}/streams",  # za predogled (resolvano na klientu)
    })
    rec["frameUrl"] = f"{config.PUBLIC_BASE}/orv/courts/{body.raiCourtId}/frame"
    return rec


@router.get("/{court_id}")
def get_court(court_id: str):
    rec = store.get_court(court_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Igrisce ni registrirano v ORV.")
    rec["frameUrl"] = f"{config.PUBLIC_BASE}/orv/courts/{court_id}/frame"
    return rec


@router.get("/{court_id}/frame")
def get_frame(court_id: str):
    frame_path = config.FRAMES_DIR / f"{court_id}.jpg"
    if not frame_path.exists():
        raise HTTPException(status_code=404, detail="Kalibracijski frame ne obstaja.")
    return FileResponse(str(frame_path), media_type="image/jpeg")


@router.put("/{court_id}/calibration")
def set_calibration(court_id: str, body: CalibrationBody):
    if store.get_court(court_id) is None:
        raise HTTPException(status_code=404, detail="Igrisce ni registrirano v ORV.")
    rec = store.get_court(court_id)
    fw, fh = rec.get("frameSize", [config.PROC_WIDTH, config.PROC_WIDTH])
    corners = np.array([[c.x, c.y] for c in body.corners], dtype=np.float32)
    # isto jedro kot CLI (calibrate.py) -> homografija + top-down velikost
    calib = cal.build_calibration(corners, (fw, fh))
    rec = store.upsert_court(court_id, {"calibration": calib, "status": "READY"})
    return rec


@router.delete("/{court_id}")
def remove_court(court_id: str):
    existed = store.delete_court(court_id)
    (config.FRAMES_DIR / f"{court_id}.jpg").unlink(missing_ok=True)
    return {"deleted": existed}


# ── analitika zasedenosti (SCRUM-66) ─────────────────────────────────
def _busy_min(court_id: str) -> int:
    rec = store.get_court(court_id) or {}
    return int(rec.get("busyMin", 2))


def _load_detections(court_id: str) -> dict:
    """Naloži obdelane detekcije igrišča ali sproži 404 (še ni obdelano)."""
    path = config.RESULTS_DIR / court_id / "detections.json"
    if not path.exists():
        raise HTTPException(status_code=404,
                            detail="Igrišče še ni obdelano (ni detekcij). Zaženi cevovod.")
    return json.loads(path.read_text(encoding="utf-8"))


@router.get("/{court_id}/status")
def court_status(court_id: str):
    """Trenutno stanje: Prosto/Zasedeno + št. igralcev / čakajočih."""
    res = occ.compute(_load_detections(court_id), busy_min=_busy_min(court_id))
    return res["summary"]


@router.get("/{court_id}/occupancy")
def court_occupancy(court_id: str, detail: bool = Query(False, description="vključi perFrame")):
    """Zasedenost skozi čas: povzetek + seje (+ perFrame, če detail=1)."""
    res = occ.compute(_load_detections(court_id), busy_min=_busy_min(court_id))
    out = {"summary": res["summary"], "sessions": res["sessions"]}
    if detail:
        out["perFrame"] = res["perFrame"]
    return out


@router.get("/{court_id}/sessions")
def court_sessions(court_id: str):
    """Zaznane seje (igre): začetek/konec/trajanje/vrh."""
    res = occ.compute(_load_detections(court_id), busy_min=_busy_min(court_id))
    return {"sessions": res["sessions"]}


@router.get("/{court_id}/heatmap")
def court_heatmap(court_id: str, team: int | None = Query(None, description="0/1 = po ekipi")):
    """Vročinska karta gibanja (skupna ali po ekipi)."""
    name = "heatmap_global.jpg" if team is None else f"heatmap_team{team}.jpg"
    path = config.RESULTS_DIR / court_id / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Heatmap ne obstaja (igrišče še ni obdelano).")
    return FileResponse(str(path), media_type="image/jpeg")
