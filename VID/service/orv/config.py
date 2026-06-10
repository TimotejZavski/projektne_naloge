"""Konfiguracija ORV storitve — poti, privzetki, okoljske spremenljivke."""

from __future__ import annotations

import os
from pathlib import Path

# service/orv/config.py -> service/ -> VID/
SERVICE_DIR = Path(__file__).resolve().parent.parent
VID_ROOT = SERVICE_DIR.parent

# Kje so izvorni demo videi, ki jih gostimo kot "kamera" toke.
# Privzeto validacijski posnetki; nastavljivo z ORV_STREAM_DIR.
STREAM_DIR = Path(os.getenv("ORV_STREAM_DIR", VID_ROOT / "dataset" / "valid" / "videos"))

# Runtime podatki (gitignored): JSON store + zajeti kalibracijski frejmi.
MEDIA_DIR = Path(os.getenv("ORV_MEDIA_DIR", SERVICE_DIR / "media"))
FRAMES_DIR = MEDIA_DIR / "frames"
COURTS_FILE = MEDIA_DIR / "courts.json"

# Javni naslov storitve (za sestavljanje stream povezav v odgovorih).
PUBLIC_BASE = os.getenv("ORV_PUBLIC_URL", "http://localhost:8000").rstrip("/")

# Dovoljeni izvori za CORS (RAI client dev server).
CORS_ORIGINS = os.getenv(
    "ORV_CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")

# Sirina obdelave/predvajanja (4K zmanjsamo zaradi hitrosti in pasovne sirine).
PROC_WIDTH = int(os.getenv("ORV_PROC_WIDTH", "960"))
JPEG_QUALITY = int(os.getenv("ORV_JPEG_QUALITY", "80"))


def ensure_dirs() -> None:
    """Ustvari runtime mape, ce se ne obstajajo."""
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
