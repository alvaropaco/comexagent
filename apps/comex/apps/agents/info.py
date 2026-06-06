from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Callable, Optional

from openai import OpenAI
from openai import OpenAIError

from apps.prompting import get_now_iso, inject_now_iso
from apps.freshness import is_stale
from libs.comex_common.agents.schemas import AgentInput, AgentOutput
from apps.rag.retrieval import RetrievalResult, format_docs, retrieve_context


LLMParseFn = Callable[[AgentInput], AgentOutput]


def _info_schema() -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "output_text": {"type": "string"},
        },
        "required": ["output_text"],
    }


def _fallback(agent_input: AgentInput) -> AgentOutput:
    return AgentOutput(
        intent="info",
        output_text=(
            "Ask a COMEX question about sales, buy orders, pricing, matching, logistics, or Incoterms. "
            "Example: 'What does FOB Santos mean for coffee exports and what costs/risks should I include in pricing?'"
        ),
        action={
            "type": "NONE",
            "payload": {},
            "confidence": 1.0,
            "validation_errors": [],
        },
    )


def _cmp_label(a: object, b: object) -> str:
    try:
        af = float(a)
        bf = float(b)
        if af > bf:
            return "above"
        if af < bf:
            return "below"
        return "equal"
    except Exception:
        return "equal"


def _trend_from_price_prev(price: object, prev: object) -> str:
    label = _cmp_label(price, prev)
    if label == "above":
        return "bullish"
    if label == "below":
        return "bearish"
    return "neutral"


def _micro_trend(*, ticks: list[dict]) -> tuple[str, str, str]:
    last3 = ticks[-3:]
    p1 = float(last3[0].get("price"))
    p2 = float(last3[1].get("price"))
    p3 = float(last3[2].get("price"))

    if p1 < p2 < p3:
        direction = "upward"
    elif p1 > p2 > p3:
        direction = "downward"
    else:
        direction = "mixed"

    d1 = p2 - p1
    d2 = p3 - p2
    if d2 > d1:
        accel = "accelerating"
    elif d2 < d1:
        accel = "decelerating"
    else:
        accel = "stable"

    reversal = "yes" if ((p1 > p2 and p2 < p3) or (p1 < p2 and p2 > p3)) else "no"
    return (direction, accel, reversal)


def _volume_label(*, volume: object, avg_volume: object) -> str:
    return {
        "above": "high",
        "equal": "neutral",
        "below": "low",
    }.get(_cmp_label(volume, avg_volume), "neutral")


def _deterministic_market_insights_output(*, market_data: dict) -> str:
    if not isinstance(market_data, dict):
        return "insufficient data"

    ticks_1m = market_data.get("ticks_1m")
    ticks_5m = market_data.get("ticks_5m")
    ticks_1h = market_data.get("ticks_1h")
    if not isinstance(ticks_1m, list) or not isinstance(ticks_5m, list) or not isinstance(ticks_1h, list):
        return "insufficient data"

    d1, a1, r1 = _micro_trend(ticks=ticks_1m[-3:])
    d5, a5, r5 = _micro_trend(ticks=ticks_5m[-3:])
    dH, aH, rH = _micro_trend(ticks=ticks_1h[-3:])

    aligned = "mixed"
    if d1 == d5 == dH == "upward":
        aligned = "strong_bullish"
    elif d1 == d5 == dH == "downward":
        aligned = "strong_bearish"

    p3 = ticks_1m[-1].get("price") if isinstance(ticks_1m[-1], dict) else None
    p3_vs_prev = _cmp_label(p3, market_data.get("previousClose"))
    vol_label = _volume_label(volume=market_data.get("volume"), avg_volume=market_data.get("avgVolume"))
    range_valid = "valid" if _cmp_label(market_data.get("high"), market_data.get("low")) in ("above", "equal") else "invalid"

    signal = "hold"
    if aligned == "strong_bullish" and a1 == "accelerating" and vol_label == "high" and p3_vs_prev == "above" and r1 == "no":
        signal = "buy"
    elif aligned == "strong_bearish" and a1 == "accelerating" and vol_label == "high" and p3_vs_prev == "below" and r1 == "no":
        signal = "sell"

    score = 0
    if signal == "buy":
        score += 1 if d1 == "upward" else 0
        score += 1 if d5 == "upward" else 0
        score += 1 if dH == "upward" else 0
    elif signal == "sell":
        score += 1 if d1 == "downward" else 0
        score += 1 if d5 == "downward" else 0
        score += 1 if dH == "downward" else 0
    score += 1 if a1 == "accelerating" else 0
    score += 1 if vol_label == "high" else 0
    if score < 0:
        score = 0
    if score > 5:
        score = 5

    confidence = "low" if score <= 2 else "medium" if score <= 4 else "high"

    return "\n".join(
        [
            f"Signal: {signal}",
            f"Confidence: {confidence}",
            f"Score: {score}",
            f"Timeframe Alignment: 1m={d1} 5m={d5} 1h={dH}",
            f"Volume: {vol_label}",
            f"Reason: aligned={aligned} accel_1m={a1} reversal_1m={r1} p3_vs_prev={p3_vs_prev} range={range_valid}",
            "Risks: Multi-timeframe disagreement reduces reliability; no macro or external context",
        ]
    )


def _extract_market_meta(docs: list[dict]) -> tuple[str | None, str | None]:
    for d in docs:
        meta = d.get("metadata")
        if isinstance(meta, dict) and meta.get("type") == "market_data":
            return meta.get("sourceUrl"), meta.get("fetchedAt")
    return None, None


_NUM_RE = re.compile(r"\b\d+(?:\.\d+)?\b")


def _numbers(text: str) -> set[str]:
    return set(_NUM_RE.findall(text or ""))


def _strip_or_block_hallucinated_numbers(*, response_text: str, allowed_numbers: set[str]) -> str:
    used = _numbers(response_text)
    if not used:
        return response_text
    extra = used - allowed_numbers
    if not extra:
        return response_text
    def repl(m: re.Match) -> str:
        token = m.group(0)
        return token if token in allowed_numbers else "[?]"

    return _NUM_RE.sub(repl, response_text)


def _format_retrieved_context(raw: object) -> str:
    if not isinstance(raw, dict):
        return ""
    data = raw.get("data")
    if not isinstance(data, list) or not data:
        return ""

    lines: list[str] = []
    for i, item in enumerate(data[:5], start=1):
        if not isinstance(item, dict):
            continue
        score = item.get("score")
        metadata = item.get("metadata")
        text = item.get("text")
        lines.append(f"[{i}] score={score} metadata={metadata} text={text}")
    return "\n".join(lines).strip()


@dataclass(frozen=True)
class InfoAgent:
    llm_parse: Optional[LLMParseFn] = None

    def run(self, agent_input: AgentInput) -> AgentOutput:
        if self.llm_parse is not None:
            return self.llm_parse(agent_input)

        api_key = os.getenv("OPENAI_API_KEY")
        route = (agent_input.context or {}).get("route")
        if not api_key and route == "MARKET_INSIGHTS" and bool(agent_input.context.get("market_tool_called")):
            tool_wrapper = agent_input.context.get("market_tool_data")
            tool_inner = tool_wrapper.get("data") if isinstance(tool_wrapper, dict) else None
            market_data = tool_inner if isinstance(tool_inner, dict) else (tool_wrapper if isinstance(tool_wrapper, dict) else {})
            required_fields = [
                "ticks_1m",
                "ticks_5m",
                "ticks_1h",
                "volume",
                "avgVolume",
                "previousClose",
                "high",
                "low",
                "fetchedAt",
            ]
            if not isinstance(market_data, dict) or any(k not in market_data for k in required_fields):
                return AgentOutput(
                    intent="info",
                    output_text="insufficient data",
                    action={"type": "NONE", "payload": {}, "confidence": 1.0, "validation_errors": []},
                )
            now_value = get_now_iso(agent_input.context)
            fetched_at = str(market_data.get("fetchedAt") or "").strip()
            if is_stale(now_iso=now_value, fetched_at_iso=fetched_at):
                return AgentOutput(
                    intent="info",
                    output_text="Data is stale. Refresh required.",
                    action={"type": "NONE", "payload": {}, "confidence": 1.0, "validation_errors": []},
                )
            return AgentOutput(
                intent="info",
                output_text=_deterministic_market_insights_output(market_data=market_data),
                action={"type": "NONE", "payload": {}, "confidence": 1.0, "validation_errors": []},
            )
        if not api_key:
            return _fallback(agent_input)

        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        client = OpenAI(api_key=api_key)
        schema = _info_schema()

        if route == "MARKET_INSIGHTS":
            if not bool(agent_input.context.get("market_tool_called")):
                raise RuntimeError("market_insights_tool_required")
            tool_data = agent_input.context.get("market_tool_data")
            from apps.rag.query_context import parse_query_context

            ctx = parse_query_context(agent_input.user_message)

            provided_market = (agent_input.context or {}).get("market_context")
            if isinstance(provided_market, dict) and isinstance(provided_market.get("memoText"), str):
                source_url = provided_market.get("sourceUrl")
                fetched_at = provided_market.get("fetchedAt")
                commodity = ctx.commodity or "coffee"
                docs = [
                    {
                        "_id": provided_market.get("_id") or "provided-market-context",
                        "text": provided_market.get("memoText"),
                        "score": 1.0,
                        "metadata": {
                            "type": "market_data",
                            "commodity": commodity,
                            "sourceUrl": source_url,
                            "fetchedAt": fetched_at,
                        },
                    }
                ]
                retrieval = RetrievalResult(
                    docs=docs,
                    confidence=1.0,
                    top_similarity=1.0,
                    result_count=1,
                    filter_match_ratio=1.0,
                    ctx=ctx,
                    merged_filter={},
                    used_cache=True,
                )
            else:
                docs = []
                retrieval = None
            core = None
            try:
                import apps.rag.retrieval as rag_retrieval

                core = rag_retrieval.get_core_data_api_client()
            except Exception:
                core = None

            wants_historical = bool(
                re.search(r"\b(historical|history|in\s+\d{4}|since\s+\d{4}|last\s+year|years)\b", agent_input.user_message, re.I)
            )

            wants_recent = (
                not wants_historical
                and (
                    ctx.timeframe == "recent"
                    or re.search(r"\b(today|latest|current|now|recent|this\s+week)\b", agent_input.user_message, re.I)
                )
            )
            wants_price = (
                not wants_historical
                and (
                    ctx.topic == "price"
                    or re.search(r"\b(price|prices|quote|futures|last\s+trade|high|low)\b", agent_input.user_message, re.I)
                )
            )

            realtime_quote = None

            if retrieval is None:
                market_retrieval = retrieve_context(
                    query=agent_input.user_message,
                    base_filter={"metadata.type": {"$in": ["market_data"]}},
                    k=10,
                )
                broad_types = ["context_xlsx", "external_web"]
                if wants_recent and not wants_historical and not ctx.timeframe == "historical":
                    broad_types.append("market_data")

                broad_retrieval = retrieve_context(
                    query=agent_input.user_message,
                    base_filter={"metadata.type": {"$in": broad_types}},
                    k=10,
                )

                if wants_recent and not market_retrieval.has_market_data_for_query and not realtime_quote and not bool(tool_data):
                    return AgentOutput(
                        intent="info",
                        output_text="No recent market data available for this query",
                        action={
                            "type": "NONE",
                            "payload": {},
                            "confidence": 1.0,
                            "validation_errors": [],
                        },
                    )

                retrieval = market_retrieval if wants_price else broad_retrieval
                if not retrieval.docs and not realtime_quote and not bool(tool_data):
                    if wants_historical:
                        msg = (
                            "I don't have historical export/import datasets in context for this query. "
                            "I can still outline the key drivers to analyze (logistics, FX, crop conditions, demand, price cycle), "
                            "or you can run an external ingest to fetch official sources and then I’ll summarize with citations."
                        )
                    else:
                        msg = "No market context available for this query"
                    return AgentOutput(
                        intent="info",
                        output_text=msg,
                        action={
                            "type": "NONE",
                            "payload": {},
                            "confidence": 1.0,
                            "validation_errors": [],
                        },
                    )

                docs = retrieval.docs
        else:
            retrieval = retrieve_context(query=agent_input.user_message, base_filter=None, k=10)
            docs = retrieval.docs

        retrieved = format_docs(docs) if docs else ""

        confidence = retrieval.confidence
        confidence_band = "low" if confidence < 0.35 else "medium" if confidence < 0.7 else "high"

        if route == "MARKET_INSIGHTS":
            if not bool(agent_input.context.get("market_tool_called")):
                raise RuntimeError("market_insights_tool_required")
            tool_wrapper = agent_input.context.get("market_tool_data")
            tool_inner = tool_wrapper.get("data") if isinstance(tool_wrapper, dict) else None
            market_data = tool_inner if isinstance(tool_inner, dict) else (tool_wrapper if isinstance(tool_wrapper, dict) else {})

            required_fields = [
                "ticks_1m",
                "ticks_5m",
                "ticks_1h",
                "volume",
                "avgVolume",
                "previousClose",
                "high",
                "low",
                "fetchedAt",
            ]
            if not isinstance(market_data, dict) or any(k not in market_data for k in required_fields):
                return AgentOutput(
                    intent="info",
                    output_text="insufficient data",
                    action={
                        "type": "NONE",
                        "payload": {},
                        "confidence": 1.0,
                        "validation_errors": [],
                    },
                )

            for series_name in ("ticks_1m", "ticks_5m", "ticks_1h"):
                ticks = market_data.get(series_name)
                if not isinstance(ticks, list) or len(ticks) < 3:
                    return AgentOutput(
                        intent="info",
                        output_text="insufficient data",
                        action={
                            "type": "NONE",
                            "payload": {},
                            "confidence": 1.0,
                            "validation_errors": [],
                        },
                    )
                for t in ticks[-3:]:
                    if not isinstance(t, dict) or "price" not in t or "timestamp" not in t:
                        return AgentOutput(
                            intent="info",
                            output_text="insufficient data",
                            action={
                                "type": "NONE",
                                "payload": {},
                                "confidence": 1.0,
                                "validation_errors": [],
                            },
                        )

            if not isinstance(market_data.get("volume"), (int, float)) or not isinstance(market_data.get("avgVolume"), (int, float)):
                return AgentOutput(
                    intent="info",
                    output_text="insufficient data",
                    action={
                        "type": "NONE",
                        "payload": {},
                        "confidence": 1.0,
                        "validation_errors": [],
                    },
                )

            if _cmp_label(market_data.get("high"), market_data.get("low")) == "below":
                return AgentOutput(
                    intent="info",
                    output_text="insufficient data",
                    action={
                        "type": "NONE",
                        "payload": {},
                        "confidence": 1.0,
                        "validation_errors": [],
                    },
                )

            now_value = get_now_iso(agent_input.context)
            fetched_at = str(market_data.get("fetchedAt") or "").strip()
            if is_stale(now_iso=now_value, fetched_at_iso=fetched_at):
                return AgentOutput(
                    intent="info",
                    output_text="Data is stale. Refresh required.",
                    action={
                        "type": "NONE",
                        "payload": {},
                        "confidence": 1.0,
                        "validation_errors": [],
                    },
                )

            instructions = (
                "You are a commodities trading signal engine.\n\n"
                "You MUST use ONLY the provided data. You are strictly forbidden from using prior knowledge, memory, or external assumptions.\n\n"
                "Required Fields:\n"
                "- ticks_1m (>= 3 ticks)\n"
                "- ticks_5m (>= 3 ticks)\n"
                "- ticks_1h (>= 3 ticks)\n"
                "- volume\n"
                "- avgVolume\n"
                "- previousClose\n"
                "- high\n"
                "- low\n"
                "- fetchedAt\n\n"
                "Each tick:\n"
                "- price\n"
                "- timestamp\n\n"
                "If ANY required field is missing -> respond exactly: \"insufficient data\".\n"
                "If fetchedAt is older than 15 minutes compared to current datetime -> respond exactly: \"Data is stale. Refresh required.\".\n\n"
                "Hard Rules:\n"
                "- Do NOT invent numbers.\n"
                "- Do NOT estimate.\n"
                "- Do NOT use external context.\n"
                "- Do NOT calculate percentages.\n"
                "- Only comparisons allowed (>, <, =).\n\n"
                "Micro-trend per timeframe (1m, 5m, 1h):\n"
                "- Direction: P1<P2<P3 upward; P1>P2>P3 downward; else mixed.\n"
                "- Acceleration: (P3-P2)>(P2-P1) accelerating; < decelerating; else stable.\n"
                "- Reversal: P1>P2 AND P2<P3 OR P1<P2 AND P2>P3.\n\n"
                "Multi-timeframe alignment:\n"
                "- Strong Bullish: 1m=upward and 5m=upward and 1h=upward\n"
                "- Strong Bearish: 1m=downward and 5m=downward and 1h=downward\n"
                "- Otherwise: mixed\n\n"
                "Volume confirmation:\n"
                "- volume>avgVolume high; volume==avgVolume neutral; volume<avgVolume low.\n\n"
                "Signal rules:\n"
                "- BUY if all timeframes upward, 1m acceleration accelerating, volume high, latest>previousClose, no reversal in 1m.\n"
                "- SELL if all timeframes downward, 1m acceleration accelerating, volume high, latest<previousClose, no reversal in 1m.\n"
                "- HOLD otherwise.\n\n"
                "Signal scoring:\n"
                "- Start score=0; +1 each timeframe aligned with signal; +1 if 1m accelerating; +1 if volume high.\n"
                "Confidence:\n"
                "- 5 high; 3-4 medium; 0-2 low.\n\n"
                "Output Format (STRICT):\n"
                "Signal: <buy | sell | hold>\n"
                "Confidence: <high | medium | low>\n"
                "Score: <0-5>\n"
                "Timeframe Alignment: 1m=<upward|downward|mixed> 5m=<upward|downward|mixed> 1h=<upward|downward|mixed>\n"
                "Volume: <high | neutral | low>\n"
                "Reason: <Deterministic explanation using ONLY comparisons>\n"
                "Risks: Multi-timeframe disagreement reduces reliability; no macro or external context\n\n"
                "Constraints:\n"
                "- Maximum 8 lines\n"
                "- No extra commentary\n"
                "- No invented values\n\n"
                f"Retrieval confidence: {confidence:.2f} ({confidence_band})."
            )
            instructions = inject_now_iso(instructions=instructions, now_iso_value=now_value)

            user_input = (
                "Market Data:\n"
                + json.dumps(market_data, ensure_ascii=False)
                + "\n\n"
                "User question:\n"
                + str(agent_input.user_message)
            )

        else:
            instructions = (
                "You are a COMEX (international trade) assistant. You can help with trade processes, "
                "documentation, compliance, logistics, Incoterms, contracts, pro-forma invoices, "
                "market quotations, and commodity market analysis (including historical questions). "
                "Be comprehensive and direct. Prefer structured sections and practical details. "
                "Only refuse if the question is clearly unrelated to global trade/commodities/logistics. "
                f"Retrieval confidence: {confidence:.2f} ({confidence_band}). Adjust certainty accordingly."
            )
            instructions = inject_now_iso(instructions=instructions, now_iso_value=get_now_iso(agent_input.context))

            if retrieved:
                user_input = (
                    "Use the following retrieved context (Mongo Atlas Vector Search results) when helpful. "
                    "If irrelevant, ignore it.\n\n"
                    f"Retrieved context:\n{retrieved}\n\n"
                    f"User question:\n{agent_input.user_message}"
                )
            else:
                user_input = agent_input.user_message

        try:
            response = client.responses.create(
                model=model,
                instructions=instructions,
                input=user_input,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "InfoAnswer",
                        "schema": schema,
                        "strict": True,
                    }
                },
            )
            data = json.loads(response.output_text)
            out = str(data["output_text"])

            if route == "MARKET_INSIGHTS":
                allowed = _numbers(json.dumps(market_data, ensure_ascii=False))
                out = _strip_or_block_hallucinated_numbers(response_text=out, allowed_numbers=allowed)
                lower = out.lower()
                required_markers = ("signal:", "confidence:", "score:", "timeframe alignment:", "volume:", "reason:", "risks:")
                if any(m not in lower for m in required_markers):
                    out = _deterministic_market_insights_output(market_data=market_data)
                if len([ln for ln in out.splitlines() if ln.strip()]) > 8:
                    out = _deterministic_market_insights_output(market_data=market_data)

            return AgentOutput(
                intent="info",
                output_text=out,
                action={
                    "type": "NONE",
                    "payload": {},
                    "confidence": 1.0,
                    "validation_errors": [],
                },
            )
        except OpenAIError:
            return _fallback(agent_input)
