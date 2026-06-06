from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _to_float(v: object) -> Optional[float]:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return None


def _chart_meta(*, symbol: str, timeout_s: float) -> Dict[str, Any]:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    headers = {"user-agent": "comex-agent/1.0", "accept": "application/json,text/plain,*/*"}
    with httpx.Client(timeout=timeout_s, headers=headers) as c:
        r = c.get(url, params={"interval": "1d", "range": "5d"})
        if r.status_code != 200:
            return {"ok": False, "reason": "http_error", "status": r.status_code}
        payload = r.json()
    chart = payload.get("chart") if isinstance(payload, dict) else None
    result = chart.get("result") if isinstance(chart, dict) else None
    first = result[0] if isinstance(result, list) and result else None
    meta = first.get("meta") if isinstance(first, dict) else None
    if not isinstance(meta, dict):
        return {"ok": False, "reason": "empty_meta"}
    return {"ok": True, "meta": meta}


def fetch_commodity_market_movers(*, timeout_s: float = 8.0) -> Dict[str, Any]:
    fetched_at = _iso_now()
    symbols = [
        "KC=F",
        "SB=F",
        "CT=F",
        "CC=F",
        "OJ=F",
        "GC=F",
        "SI=F",
        "HG=F",
        "CL=F",
        "NG=F",
        "ZC=F",
        "ZW=F",
        "ZS=F",
    ]

    movers: list[Dict[str, Any]] = []
    for sym in symbols:
        try:
            res = _chart_meta(symbol=sym, timeout_s=timeout_s)
        except Exception as e:
            return {"ok": False, "reason": "request_failed", "error": e.__class__.__name__, "fetchedAt": fetched_at}
        if not bool(res.get("ok")):
            continue
        meta = res.get("meta")
        if not isinstance(meta, dict):
            continue
        price = _to_float(meta.get("regularMarketPrice"))
        prev = _to_float(meta.get("previousClose"))
        currency = meta.get("currency")
        ts = meta.get("regularMarketTime")
        if price is None or prev is None or prev == 0 or price <= 0:
            continue
        change = price - prev
        change_percent = (change / prev) * 100.0
        movers.append(
            {
                "symbol": str(meta.get("symbol") or sym),
                "price": price,
                "previousClose": prev,
                "change": change,
                "changePercent": change_percent,
                "currency": str(currency) if isinstance(currency, str) else None,
                "timestamp": datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat().replace("+00:00", "Z")
                if isinstance(ts, (int, float))
                else None,
            }
        )

    if not movers:
        return {"ok": False, "reason": "empty_data", "fetchedAt": fetched_at}

    movers_sorted = sorted(movers, key=lambda x: abs(float(x.get("changePercent") or 0.0)), reverse=True)
    return {"ok": True, "source": "yahoo_finance_chart", "data": {"fetchedAt": fetched_at, "movers": movers_sorted}}

