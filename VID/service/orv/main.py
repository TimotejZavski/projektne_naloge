"""ORV FastAPI aplikacija — vstopna tocka.

Zazeni (iz VID/):
    .venv/Scripts/python.exe -m uvicorn service.orv.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__, config, courts, streams

app = FastAPI(title="ORV storitev — Smart Playgrounds", version=__version__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(streams.router)
app.include_router(courts.router)


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "version": __version__,
        "streamDir": str(config.STREAM_DIR),
        "streamsAvailable": len(streams.catalog.list_streams()),
    }


@app.on_event("startup")
def _startup() -> None:
    config.ensure_dirs()
