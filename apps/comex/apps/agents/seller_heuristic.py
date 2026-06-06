from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from libs.comex_common.agents.schemas import AgentInput, AgentOutput, CreateSaleAction


def _detect_currency(text: str) -> Optional[str]:
    upper = text.upper()
    for c in ("USD", "BRL", "EUR"):
        if c in upper:
            return c
    if "$" in text:
        return "USD"
    return None


def _detect_incoterm(text: str) -> Optional[str]:
    upper = text.upper()
    for it in ("FOB", "CFR", "CIF", "EXW", "DAP", "DDP"):
        if re.search(rf"\b{it}\b", upper):
            return it
    return None


def _detect_price(text: str) -> Optional[float]:
    m = re.search(r"\$\s*([0-9]+(?:\.[0-9]+)?)", text)
    if m:
        return float(m.group(1))
    m = re.search(r"\bprice\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\b", text, re.IGNORECASE)
    if m:
        return float(m.group(1))
    m = re.search(r"\bat\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\b", text, re.IGNORECASE)
    if m:
        return float(m.group(1))
    return None


def _detect_volume(text: str) -> Optional[Dict[str, Any]]:
    m = re.search(
        r"\b([0-9]+(?:\.[0-9]+)?)\s*(containers|container|tons|ton|mt|kg)\b",
        text,
        re.IGNORECASE,
    )
    if not m:
        return None
    value = float(m.group(1))
    unit = m.group(2).lower()
    if unit == "container":
        unit = "containers"
    if unit == "ton":
        unit = "tons"
    return {"value": value, "unit": unit}


def _detect_destination(text: str) -> Optional[str]:
    m = re.search(r"\bto\s+([A-Za-z][A-Za-z\-\s]{1,60})$", text.strip(), re.IGNORECASE)
    if not m:
        return None
    return m.group(1).strip()


def _detect_commodity(text: str) -> Optional[str]:
    lower = text.lower()
    if "coffee" in lower:
        return "coffee"
    m = re.search(r"\bsell\s+([a-z][a-z\-]+)", lower)
    if m:
        return m.group(1)
    return None


def _detect_origin(text: str, incoterm: Optional[str]) -> Optional[str]:
    if not incoterm:
        return None
    m = re.search(rf"\b{incoterm}\b\s+([A-Za-z][A-Za-z\-\s]{{1,60}})", text, re.IGNORECASE)
    if not m:
        return None
    origin = m.group(1).strip()
    origin = re.sub(r"\s+at\b.*$", "", origin, flags=re.IGNORECASE).strip()
    origin = re.sub(r"\s+to\b.*$", "", origin, flags=re.IGNORECASE).strip()
    return origin or None


def heuristic_seller_parse(agent_input: AgentInput) -> AgentOutput:
    msg = agent_input.user_message

    commodity = _detect_commodity(msg)
    incoterm = _detect_incoterm(msg)
    price = _detect_price(msg)
    currency = _detect_currency(msg)
    volume = _detect_volume(msg)
    destination = _detect_destination(msg)
    origin = _detect_origin(msg, incoterm)

    payload: Dict[str, Any] = {}
    validation_errors: List[str] = []

    if commodity:
        payload["commodity"] = commodity
    else:
        validation_errors.append("commodity")

    if incoterm:
        payload["incoterm"] = incoterm
    else:
        validation_errors.append("incoterm")

    if price is not None:
        payload["price"] = float(price)
    else:
        validation_errors.append("price")

    if currency:
        payload["currency"] = currency
    else:
        validation_errors.append("currency")

    if volume:
        payload["volume"] = volume
    else:
        validation_errors.append("volume")

    if origin:
        payload["origin"] = origin
    if destination:
        payload["destination"] = destination

    confidence = 0.95 if not validation_errors else 0.6
    output_text = (
        "Missing fields: " + ", ".join(validation_errors) if validation_errors else "Parsed sale offer."
    )

    return AgentOutput(
        intent="seller",
        output_text=output_text,
        action=CreateSaleAction(
            type="CREATE_SALE",
            payload=payload,
            confidence=confidence,
            validation_errors=validation_errors,
        ),
    )

