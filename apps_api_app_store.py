import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
STORE_PATH = DATA_DIR / "store.json"


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def initial_state() -> dict[str, Any]:
    return {
        "jobs": {},
        "candidates": {},
        "analyses": {},
        "activities": [],
    }


def ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not STORE_PATH.exists():
        STORE_PATH.write_text(json.dumps(initial_state(), indent=2), encoding="utf-8")


def load_store() -> dict[str, Any]:
    ensure_store()
    return json.loads(STORE_PATH.read_text(encoding="utf-8"))


def save_store(state: dict[str, Any]) -> None:
    ensure_store()
    STORE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def append_activity(state: dict[str, Any], actor: str, action: str) -> None:
    state["activities"].insert(
        0,
        {
            "id": str(uuid4()),
            "actor": actor,
            "action": action,
            "created_at": now_iso(),
        },
    )
    state["activities"] = state["activities"][:50]
