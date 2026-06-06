from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional


def _parse_iso(ts: str) -> Optional[datetime]:
    s = (ts or "").strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def is_stale(*, now_iso: str, fetched_at_iso: str, max_age_seconds: int = 15 * 60) -> bool:
    now_dt = _parse_iso(now_iso)
    fetched_dt = _parse_iso(fetched_at_iso)
    if now_dt is None or fetched_dt is None:
        return True
    age_s = (now_dt - fetched_dt).total_seconds()
    return age_s > float(max_age_seconds)


def age_seconds(*, now_iso: str, fetched_at_iso: str) -> Optional[float]:
    now_dt = _parse_iso(now_iso)
    fetched_dt = _parse_iso(fetched_at_iso)
    if now_dt is None or fetched_dt is None:
        return None
    return (now_dt - fetched_dt).total_seconds()

