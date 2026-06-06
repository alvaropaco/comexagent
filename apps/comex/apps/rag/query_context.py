from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass
from typing import Literal, Optional

from openai import OpenAI
from openai import OpenAIError

from apps.prompting import inject_now_iso, now_iso

Commodity = Literal["coffee", "pepper"]
Topic = Literal["price", "logistics", "forecast", "weather"]
Timeframe = Literal["recent", "historical"]


@dataclass(frozen=True)
class QueryContext:
    commodity: Optional[Commodity] = None
    origin: Optional[str] = None
    topic: Optional[Topic] = None
    timeframe: Optional[Timeframe] = None

    def to_filter(self) -> dict:
        f: dict = {}
        if self.commodity:
            f["metadata.commodity"] = self.commodity
        if self.origin:
            f["metadata.origin"] = self.origin
        if self.topic:
            f["metadata.topic"] = self.topic
        return f


def _schema() -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "commodity": {"type": ["string", "null"], "enum": ["coffee", "pepper", None]},
            "origin": {"type": ["string", "null"]},
            "topic": {"type": ["string", "null"], "enum": ["price", "logistics", "forecast", "weather", None]},
            "timeframe": {"type": ["string", "null"], "enum": ["recent", "historical", None]},
        },
        "required": ["commodity", "origin", "topic", "timeframe"],
    }


def _fallback(message: str) -> QueryContext:
    lower = (message or "").lower()
    commodity: Optional[Commodity] = None
    if re.search(r"\bcoffee\b", lower):
        commodity = "coffee"
    elif re.search(r"\bpepper\b", lower):
        commodity = "pepper"

    topic: Optional[Topic] = None
    if re.search(r"\b(price|prices|rate|quote|futures|spread|differential)\b", lower):
        topic = "price"
    elif re.search(r"\b(logistics|shipping|freight|incoterm|fob|cif|cfr|port|customs|documentation)\b", lower):
        topic = "logistics"
    elif re.search(r"\b(forecast|outlook|projection|trend|trends)\b", lower):
        topic = "forecast"
    elif re.search(r"\b(weather|rain|drought|frost|el\s*nino|climate)\b", lower):
        topic = "weather"

    timeframe: Optional[Timeframe] = None
    if re.search(r"\b(today|this\s+week|recent|latest|now|current)\b", lower):
        timeframe = "recent"
    elif re.search(r"\b(history|historical|last\s+year|years|decade|since)\b", lower):
        timeframe = "historical"

    origin = _extract_origin(message)
    return QueryContext(commodity=commodity, origin=origin, topic=topic, timeframe=timeframe)


def _extract_origin(message: str) -> Optional[str]:
    text = message or ""
    m = re.search(r"\bFOB\s+([A-Za-z][A-Za-z\s\-]+?)(?:\b|,|\.|\n)", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    m = re.search(r"\bfrom\s+([A-Za-z][A-Za-z\s\-]+?)(?:\b|,|\.|\n)", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    m = re.search(r"\borigin\s*[:=]\s*([A-Za-z][A-Za-z\s\-]+)", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None


def parse_query_context(message: str) -> QueryContext:
    mode = (os.getenv("COMEX_QUERY_CONTEXT_MODE") or "auto").lower()
    if mode == "heuristic":
        return _fallback(message)

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or mode == "off":
        return _fallback(message)

    model = os.getenv("OPENAI_ROUTER_MODEL", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    client = OpenAI(api_key=api_key)
    schema = _schema()

    instructions = (
        "Extract structured trading context from the user query. "
        "Return ONLY JSON. If unknown, use null. Keep origin short (city/port/country)."
    )
    instructions = inject_now_iso(instructions=instructions, now_iso_value=now_iso())

    try:
        response = client.responses.create(
            model=model,
            instructions=instructions,
            input=message,
            max_output_tokens=180,
            temperature=0.0,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "QueryContext",
                    "schema": schema,
                    "strict": True,
                }
            },
        )
        data = json.loads(response.output_text)
        ctx = QueryContext(
            commodity=data.get("commodity"),
            origin=(data.get("origin") or None),
            topic=data.get("topic"),
            timeframe=data.get("timeframe"),
        )
        if ctx.origin is None:
            ctx = QueryContext(**{**asdict(ctx), "origin": _extract_origin(message)})
        return ctx
    except OpenAIError:
        return _fallback(message)
