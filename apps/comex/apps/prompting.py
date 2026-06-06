from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional


def now_iso() -> str:
    try:
        return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    except Exception:
        return datetime.utcnow().replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def get_now_iso(context: Optional[Dict[str, Any]] = None) -> str:
    v = (context or {}).get("NOW_ISO")
    if isinstance(v, str) and v.strip():
        return v.strip()
    return now_iso()


def inject_now_iso(*, instructions: str, now_iso_value: str) -> str:
    prefix = (
        f"Current datetime: {now_iso_value}\n"
        "Time rules:\n"
        "- Never assume current date or time.\n"
        "- Always rely on the provided Current datetime when interpreting words like now/today/yesterday/last week.\n"
        "- When comparing timestamps, compare them to Current datetime.\n\n"
    )
    return prefix + (instructions or "")

