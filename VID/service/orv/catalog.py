"""Katalog razpolozljivih "kamera" tokov.

Skenira STREAM_DIR za video datoteke in vsako izpostavi kot tok z lepim id-jem.
Tu zivi tudi razresevanje stream povezave -> cv2 vir: ce je povezava ena izmed
nasih (/streams/{id}), beremo neposredno iz lokalne datoteke (zanesljivo);
sicer (pravi rtsp/http) povezavo podamo cv2.VideoCapture-u taksno kot je.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from . import config

VIDEO_EXT = {".mp4", ".mov", ".avi", ".mkv"}


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name.lower()).strip("-")
    return s or "feed"


@lru_cache(maxsize=1)
def _catalog() -> dict[str, Path]:
    """Zgradi {streamId: pot} iz STREAM_DIR (predpomnjeno)."""
    out: dict[str, Path] = {}
    if config.STREAM_DIR.exists():
        for p in sorted(config.STREAM_DIR.iterdir()):
            if p.suffix.lower() in VIDEO_EXT:
                out[_slug(p.stem)] = p
    return out


def refresh() -> None:
    _catalog.cache_clear()


def list_streams() -> list[dict]:
    """Seznam tokov z javno povezavo — to operater prilepi v '+' dialog."""
    return [
        {
            "id": sid,
            "name": path.stem.replace("_", " "),
            "url": f"{config.PUBLIC_BASE}/streams/{sid}",
            "file": path.name,
        }
        for sid, path in _catalog().items()
    ]


def path_for(stream_id: str) -> Path | None:
    return _catalog().get(stream_id)


def resolve_capture_source(stream_url: str) -> str:
    """
    Pretvori stream povezavo v vir, ki ga cv2.VideoCapture lahko odpre.

    - nasa povezava ".../streams/{id}" -> lokalna pot do datoteke,
    - karkoli drugega (rtsp://, http(s) MJPEG, ...) -> vrnemo nespremenjeno.
    """
    m = re.search(r"/streams/([A-Za-z0-9\-]+)", stream_url or "")
    if m:
        p = path_for(m.group(1))
        if p:
            return str(p)
    return stream_url
