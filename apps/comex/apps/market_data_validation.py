from __future__ import annotations

import math
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    reason: str
    details: Dict[str, Any]


def _to_float(v: object) -> Optional[float]:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        x = float(v)
        if math.isfinite(x):
            return x
    return None


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        v = float(str(raw).strip())
        return v if math.isfinite(v) else default
    except Exception:
        return default


def validate_coffee_futures_kc(*, data: Dict[str, Any]) -> ValidationResult:
    high = _to_float(data.get("high"))
    low = _to_float(data.get("low"))
    prev = _to_float(data.get("previousClose"))
    volume = _to_float(data.get("volume"))
    avg_volume = _to_float(data.get("avgVolume"))
    ticks_1m = data.get("ticks_1m")
    ticks_5m = data.get("ticks_5m")
    ticks_1h = data.get("ticks_1h")

    if high is None or low is None or prev is None or volume is None or avg_volume is None:
        return ValidationResult(ok=False, reason="missing_fields", details={})

    if not (high > 0 and low > 0 and prev > 0 and volume >= 0 and avg_volume >= 0):
        return ValidationResult(ok=False, reason="non_positive_values", details={"high": high, "low": low, "previousClose": prev, "volume": volume, "avgVolume": avg_volume})

    if high < low:
        return ValidationResult(ok=False, reason="invalid_range", details={"high": high, "low": low})

    min_price = _env_float("COMEX_KC_PRICE_MIN", 50.0)
    max_price = _env_float("COMEX_KC_PRICE_MAX", 1500.0)

    for name, v in (("high", high), ("low", low), ("previousClose", prev)):
        if v < min_price or v > max_price:
            return ValidationResult(ok=False, reason="out_of_bounds", details={"field": name, "value": v, "min": min_price, "max": max_price})

    def validate_tick_series(name: str, ticks: object) -> Optional[ValidationResult]:
        if not isinstance(ticks, list) or len(ticks) < 3:
            return ValidationResult(ok=False, reason="insufficient_ticks", details={"series": name})
        last3 = ticks[-3:]
        for i, t in enumerate(last3):
            if not isinstance(t, dict):
                return ValidationResult(ok=False, reason="invalid_tick", details={"series": name, "index": i})
            t_price = _to_float(t.get("price"))
            t_ts = t.get("timestamp")
            if t_price is None or t_price <= 0:
                return ValidationResult(ok=False, reason="invalid_tick_price", details={"series": name, "index": i})
            if t_price < min_price or t_price > max_price:
                return ValidationResult(ok=False, reason="tick_out_of_bounds", details={"series": name, "index": i, "value": t_price, "min": min_price, "max": max_price})
            if not isinstance(t_ts, str) or not t_ts.strip():
                return ValidationResult(ok=False, reason="invalid_tick_timestamp", details={"series": name, "index": i})
        return None

    for series_name, series in (("ticks_1m", ticks_1m), ("ticks_5m", ticks_5m), ("ticks_1h", ticks_1h)):
        r = validate_tick_series(series_name, series)
        if r is not None:
            return r

    return ValidationResult(ok=True, reason="ok", details={})


def validate_market_tool_payload(tool_data: Dict[str, Any]) -> Tuple[bool, str, Dict[str, Any]]:
    if not isinstance(tool_data, dict) or not bool(tool_data.get("ok")):
        return (False, "tool_not_ok", {})
    data = tool_data.get("data")
    if not isinstance(data, dict):
        return (False, "missing_data", {})

    symbol = str(data.get("symbol") or "").strip().upper()
    if symbol == "KC=F":
        r = validate_coffee_futures_kc(data=data)
        return (r.ok, r.reason, r.details)

    return (False, "unsupported_symbol", {"symbol": symbol})
