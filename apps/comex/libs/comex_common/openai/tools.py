from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from libs.comex_common.domain.schemas import CreateBuyOrderPayload, CreateSalePayload
from libs.comex_common.core_data_api.client import get_core_data_api_client
from libs.comex_common.market_data.yahoo_chart import fetch_kc_f_market_data
from libs.comex_common.market_data.yahoo_movers import fetch_commodity_market_movers
from libs.comex_common.storage.in_memory import get_db


def tool_definitions() -> List[Dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "create_sale",
                "description": "Create a sale offer in Sales Service (idempotent).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "idempotency_key": {"type": "string"},
                        "payload": CreateSalePayload.model_json_schema(),
                    },
                    "required": ["idempotency_key", "payload"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_buy_order",
                "description": "Create a buy order in Buy Service (idempotent).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "idempotency_key": {"type": "string"},
                        "payload": CreateBuyOrderPayload.model_json_schema(),
                    },
                    "required": ["idempotency_key", "payload"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_market_data",
                "description": "Fetch market/freight/FX snapshot.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "commodity": {"type": "string"},
                        "origin": {"type": "string"},
                        "destination": {"type": "string"},
                    },
                    "required": ["commodity"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_coffee_market_data",
                "description": "Fetch latest coffee futures data.",
                "parameters": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {},
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_market_movers",
                "description": "Fetch biggest commodity market movers for today.",
                "parameters": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {},
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "publish_event",
                "description": "Publish a domain event.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "event_type": {"type": "string"},
                        "event": {"type": "object"},
                    },
                    "required": ["event_type", "event"],
                },
            },
        },
    ]


def create_sale(*, idempotency_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    parsed = CreateSalePayload.model_validate(payload)

    client = get_core_data_api_client()
    if client is None:
        return get_db().create_sale(idempotency_key=idempotency_key, payload=parsed.model_dump())

    dto = {
        "commodity": parsed.commodity,
        "incoterm": parsed.incoterm,
        "price": parsed.price,
        "currency": parsed.currency,
        "volume": f"{parsed.volume.value} {parsed.volume.unit}",
        "origin": parsed.origin,
        "destination": parsed.destination,
    }
    res = client.create_sale(idempotency_key=idempotency_key, body=dto)
    data = res.get("data") if isinstance(res, dict) else None
    if isinstance(data, dict) and "_id" in data:
        return {
            "ok": True,
            "sale_id": data["_id"],
            "idempotent": bool(res.get("idempotent", False)),
            "created": data,
        }
    return {"ok": True, "created": data, "raw": res}


def create_buy_order(*, idempotency_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    parsed = CreateBuyOrderPayload.model_validate(payload)

    client = get_core_data_api_client()
    if client is None:
        return get_db().create_buy_order(idempotency_key=idempotency_key, payload=parsed.model_dump())

    dto = {
        "commodity": parsed.commodity,
        "targetPrice": parsed.target_price,
        "currency": parsed.currency,
        "volume": f"{parsed.volume.value} {parsed.volume.unit}",
        "destination": parsed.destination,
    }
    res = client.create_buy_order(idempotency_key=idempotency_key, body=dto)
    data = res.get("data") if isinstance(res, dict) else None
    if isinstance(data, dict) and "_id" in data:
        return {
            "ok": True,
            "buy_order_id": data["_id"],
            "idempotent": bool(res.get("idempotent", False)),
            "created": data,
        }
    return {"ok": True, "created": data, "raw": res}


def get_market_data(*, commodity: str, origin: str | None = None, destination: str | None = None) -> Dict[str, Any]:
    return {"ok": True, "commodity": commodity, "origin": origin, "destination": destination}


def get_coffee_market_data() -> Dict[str, Any]:
    source = (os.getenv("COMEX_MARKET_DATA_SOURCE") or "yahoo_chart").strip().lower()
    if source == "core_data_api":
        client = get_core_data_api_client()
        if client is None:
            return {"ok": False, "reason": "core_data_api_not_configured"}
        try:
            res = client.yahoo_coffee_level4()
        except Exception as e:
            return {"ok": False, "reason": "core_data_api_failed", "error": e.__class__.__name__}
        inner = res.get("data") if isinstance(res, dict) and res.get("success") is True else res
        if not isinstance(inner, dict) or not bool(inner.get("ok")):
            return {"ok": False, "reason": "core_data_api_bad_response", "raw": res}
        data = inner.get("data")
        if not isinstance(data, dict):
            return {"ok": False, "reason": "empty_data", "raw": res}
        return {"ok": True, "source": "core_data_api", "data": data}
    if source == "mock":
        now = datetime.now(timezone.utc)
        fetched_at = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        if (os.getenv("COMEX_MARKET_MOCK_STALE") or "").strip() in ("1", "true", "yes", "on"):
            fetched_at = (now - timedelta(hours=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z")

        def t(ts: datetime, px: float) -> Dict[str, Any]:
            return {"price": px, "timestamp": ts.isoformat(timespec="seconds").replace("+00:00", "Z")}

        ticks_1m = [t(now - timedelta(minutes=2), 300.0), t(now - timedelta(minutes=1), 301.0), t(now, 302.0)]
        ticks_5m = [t(now - timedelta(minutes=10), 298.0), t(now - timedelta(minutes=5), 300.0), t(now, 302.0)]
        ticks_1h = [t(now - timedelta(hours=2), 295.0), t(now - timedelta(hours=1), 299.0), t(now, 302.0)]
        data = {
            "symbol": "KC=F",
            "ticks_1m": ticks_1m,
            "ticks_5m": ticks_5m,
            "ticks_1h": ticks_1h,
            "volume": 20000,
            "avgVolume": 15000,
            "previousClose": 298.0,
            "high": 306.0,
            "low": 294.0,
            "currency": "USX",
            "fetchedAt": fetched_at,
        }
        return {"ok": True, "source": "mock", "data": data}

    res = fetch_kc_f_market_data()
    if not bool(res.get("ok")):
        return res
    data = res.get("data")
    if not isinstance(data, dict):
        return {"ok": False, "reason": "empty_data", "raw": res}
    return {"ok": True, "source": "yahoo_finance_chart", "data": data}


def get_market_movers() -> Dict[str, Any]:
    source = (os.getenv("COMEX_MARKET_DATA_SOURCE") or "yahoo_chart").strip().lower()
    if source == "mock":
        now = datetime.now(timezone.utc)
        fetched_at = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        data = {
            "fetchedAt": fetched_at,
            "movers": [
                {"symbol": "KC=F", "changePercent": 1.0, "currency": "USX"},
                {"symbol": "CL=F", "changePercent": -0.8, "currency": "USD"},
                {"symbol": "GC=F", "changePercent": 0.6, "currency": "USD"},
            ],
        }
        return {"ok": True, "source": "mock", "data": data}

    if source == "core_data_api":
        client = get_core_data_api_client()
        if client is None:
            return {"ok": False, "reason": "core_data_api_not_configured"}
        try:
            res = client.yahoo_commodity_movers()
        except Exception as e:
            return {"ok": False, "reason": "core_data_api_failed", "error": e.__class__.__name__}
        inner = res.get("data") if isinstance(res, dict) and res.get("success") is True else res
        if not isinstance(inner, dict) or not bool(inner.get("ok")):
            return {"ok": False, "reason": "core_data_api_bad_response", "raw": res}
        data = inner.get("data")
        if not isinstance(data, dict):
            return {"ok": False, "reason": "empty_data", "raw": res}
        return {"ok": True, "source": "core_data_api", "data": data}

    return fetch_commodity_market_movers()


def publish_event(*, event_type: str, event: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": True, "event_type": event_type, "event": event}
