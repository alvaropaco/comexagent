from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx


def _iso_from_epoch_seconds(v: object) -> Optional[str]:
    if isinstance(v, (int, float)):
        try:
            return datetime.fromtimestamp(float(v), tz=timezone.utc).isoformat().replace("+00:00", "Z")
        except Exception:
            return None
    return None


def _to_float(v: object) -> Optional[float]:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return None


def _valid_non_negative(v: Optional[float]) -> bool:
    return v is not None and v >= 0


def _extract_ticks(first: Dict[str, Any]) -> Optional[list[Dict[str, Any]]]:
    ts_arr = first.get("timestamp")
    indicators = first.get("indicators")
    quote = indicators.get("quote") if isinstance(indicators, dict) else None
    quote0 = quote[0] if isinstance(quote, list) and quote else None
    closes = quote0.get("close") if isinstance(quote0, dict) else None

    if not isinstance(ts_arr, list) or not isinstance(closes, list) or len(ts_arr) != len(closes):
        return None

    pairs: list[Tuple[int, float]] = []
    for ts, px in zip(ts_arr, closes):
        if not isinstance(ts, (int, float)):
            continue
        fpx = _to_float(px)
        if fpx is None or fpx <= 0:
            continue
        pairs.append((int(ts), fpx))

    if len(pairs) < 3:
        return None

    last3 = pairs[-3:]
    ticks: list[Dict[str, Any]] = []
    for ts, px in last3:
        iso = _iso_from_epoch_seconds(ts)
        if not iso:
            return None
        ticks.append({"price": px, "timestamp": iso})
    return ticks


def _fetch_chart(*, symbol: str, interval: str, range_: str, timeout_s: float) -> Dict[str, Any]:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    fetched_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    headers = {
        "user-agent": "comex-agent/1.0",
        "accept": "application/json,text/plain,*/*",
    }
    params = {"interval": interval, "range": range_}

    try:
        with httpx.Client(timeout=timeout_s, headers=headers) as c:
            r = c.get(url, params=params)
            if r.status_code != 200:
                return {"ok": False, "reason": "http_error", "status": r.status_code, "fetchedAt": fetched_at}
            payload = r.json()
    except Exception as e:
        return {"ok": False, "reason": "request_failed", "error": e.__class__.__name__, "fetchedAt": fetched_at}

    chart = payload.get("chart") if isinstance(payload, dict) else None
    result = chart.get("result") if isinstance(chart, dict) else None
    first = result[0] if isinstance(result, list) and result else None
    meta = first.get("meta") if isinstance(first, dict) else None
    if not isinstance(meta, dict):
        return {"ok": False, "reason": "empty_data", "fetchedAt": fetched_at}
    if not isinstance(first, dict):
        return {"ok": False, "reason": "empty_data", "fetchedAt": fetched_at}

    ticks = _extract_ticks(first)
    if ticks is None:
        return {"ok": False, "reason": "insufficient_ticks", "fetchedAt": fetched_at}

    return {"ok": True, "fetchedAt": fetched_at, "meta": meta, "ticks": ticks}


def fetch_kc_f_market_data(*, timeout_s: float = 8.0) -> Dict[str, Any]:
    symbol = "KC=F"
    fetched_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    c1 = _fetch_chart(symbol=symbol, interval="1m", range_="1d", timeout_s=timeout_s)
    if not bool(c1.get("ok")):
        return c1
    c5 = _fetch_chart(symbol=symbol, interval="5m", range_="1d", timeout_s=timeout_s)
    if not bool(c5.get("ok")):
        return c5
    c1h = _fetch_chart(symbol=symbol, interval="1h", range_="5d", timeout_s=timeout_s)
    if not bool(c1h.get("ok")):
        return c1h

    meta = c1.get("meta") if isinstance(c1, dict) else None
    if not isinstance(meta, dict):
        return {"ok": False, "reason": "empty_data", "fetchedAt": fetched_at}

    price = _to_float(meta.get("regularMarketPrice"))
    high = _to_float(meta.get("regularMarketDayHigh"))
    low = _to_float(meta.get("regularMarketDayLow"))
    prev = _to_float(meta.get("previousClose"))
    currency = meta.get("currency")
    market_time_iso = _iso_from_epoch_seconds(meta.get("regularMarketTime"))
    volume = _to_float(meta.get("regularMarketVolume"))
    avg_volume = _to_float(meta.get("averageDailyVolume3Month") or meta.get("averageDailyVolume10Day"))

    if not all([_valid_non_negative(price), _valid_non_negative(high), _valid_non_negative(low), _valid_non_negative(prev)]):
        return {"ok": False, "reason": "invalid_values", "fetchedAt": fetched_at}
    if high is not None and low is not None and high < low:
        return {"ok": False, "reason": "invalid_range", "fetchedAt": fetched_at}
    if not isinstance(currency, str) or not currency.strip():
        return {"ok": False, "reason": "missing_currency", "fetchedAt": fetched_at}
    if volume is None or volume < 0:
        return {"ok": False, "reason": "missing_volume", "fetchedAt": fetched_at}
    if avg_volume is None or avg_volume < 0:
        return {"ok": False, "reason": "missing_avg_volume", "fetchedAt": fetched_at}

    ticks_1m = c1.get("ticks") if isinstance(c1, dict) else None
    ticks_5m = c5.get("ticks") if isinstance(c5, dict) else None
    ticks_1h = c1h.get("ticks") if isinstance(c1h, dict) else None
    if not isinstance(ticks_1m, list) or not isinstance(ticks_5m, list) or not isinstance(ticks_1h, list):
        return {"ok": False, "reason": "insufficient_ticks", "fetchedAt": fetched_at}

    data = {
        "ticks_1m": ticks_1m,
        "ticks_5m": ticks_5m,
        "ticks_1h": ticks_1h,
        "volume": volume,
        "avgVolume": avg_volume,
        "previousClose": prev,
        "high": high,
        "low": low,
        "price": price,
        "currency": currency.strip(),
        "fetchedAt": fetched_at,
        "timestamp": market_time_iso,
        "symbol": str(meta.get("symbol") or symbol),
        "exchange": str(meta.get("fullExchangeName") or meta.get("exchangeName") or ""),
    }
    return {"ok": True, "source": "yahoo_finance_chart", "data": data}
