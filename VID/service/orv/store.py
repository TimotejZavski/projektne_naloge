"""Preprost JSON store za ORV konfiguracijo igrisc (kljuc = RAI court id).

Namenoma brez baze: storitev je samostojna in lahko Dockerizirana (SCRUM-67).
RAI admin panel bere te podatke prek HTTP-ja, ne prek skupne baze.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone

from . import config

_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load() -> dict:
    if not config.COURTS_FILE.exists():
        return {}
    try:
        return json.loads(config.COURTS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save(data: dict) -> None:
    config.ensure_dirs()
    tmp = config.COURTS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(config.COURTS_FILE)


def list_courts() -> list[dict]:
    with _lock:
        return list(_load().values())


def get_court(court_id: str) -> dict | None:
    with _lock:
        return _load().get(court_id)


def upsert_court(court_id: str, patch: dict) -> dict:
    """Ustvari ali posodobi zapis; vrne celoten zapis."""
    with _lock:
        data = _load()
        rec = data.get(court_id, {"raiCourtId": court_id, "createdAt": _now()})
        rec.update(patch)
        rec["updatedAt"] = _now()
        data[court_id] = rec
        _save(data)
        return rec


def delete_court(court_id: str) -> bool:
    with _lock:
        data = _load()
        existed = court_id in data
        data.pop(court_id, None)
        _save(data)
        return existed
