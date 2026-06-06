from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Literal

from openai import OpenAI
from openai import OpenAIError
from apps.prompting import inject_now_iso, now_iso


Intent = Literal["CREATE_SALE", "CREATE_BUY", "MARKET_INSIGHTS", "MARKET_MOVERS", "COMEX_QA", "REJECT"]


@dataclass(frozen=True)
class RouteDecision:
    intent: Intent
    confidence: float
    reason: str


def route_intent_heuristic(message: str) -> RouteDecision:
    text = (message or "").strip()
    if not text:
        return RouteDecision(intent="info", confidence=1.0, reason="empty")

    lower = text.lower()

    if re.search(r"\b(quote|quotation|draft\s+quote|draft\s+quotation)\b", lower) and re.search(
        r"\b(fob|cfr|cif|exw|dap|ddp|incoterm|container|containers|ton|tons|mt|kg|usd|brl|eur)\b",
        lower,
    ):
        return RouteDecision(intent="COMEX_QA", confidence=0.8, reason="quote_request")

    if re.search(r"\b(quote|quotation|proforma|pro-forma|invoice|contract|terms\s+and\s+conditions)\b", lower):
        return RouteDecision(intent="COMEX_QA", confidence=0.75, reason="quote_or_doc")

    sale_strong = re.search(r"\b(sell|selling|offer|export|create\s+an?\s+offer|create\s+sale)\b", lower)
    buy_strong = re.search(r"\b(buy|buying|purchase|import|create\s+buy\s+order|create\s+an?\s+buy)\b", lower)

    if sale_strong:
        return RouteDecision(intent="CREATE_SALE", confidence=0.9, reason="explicit_sell")
    if buy_strong:
        return RouteDecision(intent="CREATE_BUY", confidence=0.9, reason="explicit_buy")

    if re.search(
        r"\b(biggest\s+changes|biggest\s+moves|top\s+movers|market\s+movers|gainers|losers|day\s+gainers|day\s+losers|what\s+moved\s+today|moved\s+today)\b",
        lower,
    ):
        return RouteDecision(intent="MARKET_MOVERS", confidence=0.9, reason="movers_query")

    if re.search(r"\b(coffee|pepper|arabica|robusta)\b", lower) and re.search(
        r"\b(today|latest|current|now|this\s+week)\b",
        lower,
    ):
        return RouteDecision(intent="MARKET_INSIGHTS", confidence=0.8, reason="commodity_now")

    if re.search(r"\bmarket\b", lower) and re.search(r"\b(coffee|pepper|arabica|robusta|futures)\b", lower):
        return RouteDecision(intent="MARKET_INSIGHTS", confidence=0.75, reason="market_keyword")

    if re.search(
        r"\b(price|prices|forecast|outlook|trend|trends|why\s+did|increase\b|decrease\b|chart|futures|open\s+interest|volatility)\b",
        lower,
    ):
        return RouteDecision(intent="MARKET_INSIGHTS", confidence=0.8, reason="market_question")

    if re.search(r"\b(historical|history|in\s+\d{4}|last\s+year|years|since\s+\d{4})\b", lower) and re.search(
        r"\b(export|exports|import|imports|shipment|shipments|trade|volume|volumes|price|prices|coffee|pepper)\b",
        lower,
    ):
        return RouteDecision(intent="MARKET_INSIGHTS", confidence=0.75, reason="historical_trade")

    if re.search(r"\b(what\s+does|meaning|mean\b|explain|difference\s+between|how\s+does)\b", lower) or re.search(
        r"\b(fob|cfr|cif|exw|dap|ddp|incoterm|customs|documentation|export\s+docs|import\s+docs)\b",
        lower,
    ):
        return RouteDecision(intent="COMEX_QA", confidence=0.85, reason="qa")

    return RouteDecision(intent="COMEX_QA", confidence=0.6, reason="default")


def _router_schema() -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "intent": {
                "type": "string",
                "enum": ["CREATE_SALE", "CREATE_BUY", "MARKET_INSIGHTS", "MARKET_MOVERS", "COMEX_QA", "REJECT"],
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "reasoning": {"type": "string"},
            "next_action": {
                "type": "string",
                "enum": ["route_to_agent", "request_missing_info", "respond_directly"],
            },
        },
        "required": ["intent", "confidence", "reasoning", "next_action"],
    }


def route_intent_openai(message: str) -> RouteDecision:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return route_intent_heuristic(message)

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    client = OpenAI(api_key=api_key)
    schema = _router_schema()

    instructions = (
        "You are an AI orchestrator for a COMEX (international trade) system. "
        "Your goal is precision over recall: do NOT guess and do NOT hallucinate intent.\n\n"
        "Supported intents:\n"
        "- CREATE_SALE: user explicitly wants to sell/export/create an offer\n"
        "- CREATE_BUY: user explicitly wants to buy/import/create a buy order\n"
        "- MARKET_INSIGHTS: user asks trends/prices/forecasts/supply-demand\n"
        "- MARKET_MOVERS: user asks top gainers/losers/biggest moves today\n"
        "- COMEX_QA: definitions/logistics/regulations/processes, drafting market quotations, pro-forma invoices\n"
        "  and other trade documents; historical COMEX/trade questions are in-scope\n"
        "- REJECT: unrelated to COMEX/global trade\n\n"
        "Rules:\n"
        "- NEVER infer buy/sell without explicit wording like 'sell', 'buy', 'create offer', 'create buy order'.\n"
        "- If the user asks for top movers/gainers/losers/biggest changes today, choose MARKET_MOVERS.\n"
        "- If the user asks about prices/market/trends/futures (e.g. 'coffee price today'), choose MARKET_INSIGHTS.\n"
        "- If the user wants to create a deal/order/offer (sell/buy), choose CREATE_SALE/CREATE_BUY even if they mention price.\n"
        "- Ambiguous -> COMEX_QA.\n"
        "- 'Draft quote' / 'quotation' requests are COMEX_QA, not REJECT.\n"
        "\nExamples:\n"
        "User: coffee price today\n"
        "Answer: {\"intent\":\"MARKET_INSIGHTS\",\"confidence\":0.9,\"reasoning\":\"asks current coffee price\",\"next_action\":\"route_to_agent\"}\n"
        "User: biggest changes of today in commodities\n"
        "Answer: {\"intent\":\"MARKET_MOVERS\",\"confidence\":0.9,\"reasoning\":\"asks market movers\",\"next_action\":\"route_to_agent\"}\n"
        "User: sell 2 containers coffee\n"
        "Answer: {\"intent\":\"CREATE_SALE\",\"confidence\":0.9,\"reasoning\":\"explicit sell offer\",\"next_action\":\"route_to_agent\"}\n"
        "User: market trend coffee\n"
        "Answer: {\"intent\":\"MARKET_INSIGHTS\",\"confidence\":0.85,\"reasoning\":\"asks market trend\",\"next_action\":\"route_to_agent\"}\n"
        "User: buy coffee FOB Santos\n"
        "Answer: {\"intent\":\"CREATE_BUY\",\"confidence\":0.9,\"reasoning\":\"explicit buy order\",\"next_action\":\"route_to_agent\"}\n"
        "Return JSON with intent, confidence, reasoning, next_action."
    )
    instructions = inject_now_iso(instructions=instructions, now_iso_value=now_iso())

    try:
        response = client.responses.create(
            model=model,
            instructions=instructions,
            input=message,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "RouteDecision",
                    "schema": schema,
                    "strict": True,
                }
            },
        )
        data = json.loads(response.output_text)
        return RouteDecision(
            intent=data["intent"],
            confidence=float(data["confidence"]),
            reason=str(data.get("reasoning") or data.get("reason") or ""),
        )
    except OpenAIError:
        return route_intent_heuristic(message)


def route_intent(message: str) -> RouteDecision:
    mode = (os.getenv("COMEX_ROUTER_MODE") or "auto").lower()
    if mode == "heuristic":
        return route_intent_heuristic(message)
    if mode == "openai":
        decision = route_intent_openai(message)
        heuristic = route_intent_heuristic(message)
        return _apply_safety_checks(openai=decision, heuristic=heuristic)
    if os.getenv("OPENAI_API_KEY"):
        decision = route_intent_openai(message)
        heuristic = route_intent_heuristic(message)
        return _apply_safety_checks(openai=decision, heuristic=heuristic)
    return route_intent_heuristic(message)


def _apply_safety_checks(*, openai: RouteDecision, heuristic: RouteDecision) -> RouteDecision:
    transactional = {"CREATE_SALE", "CREATE_BUY"}

    if openai.intent == "REJECT" and heuristic.intent != "REJECT":
        return RouteDecision(
            intent=heuristic.intent,
            confidence=min(heuristic.confidence, 0.85),
            reason=f"override_reject:{openai.reason}",
        )

    if openai.intent in transactional and heuristic.intent not in transactional:
        return RouteDecision(
            intent=heuristic.intent,
            confidence=min(openai.confidence, 0.85),
            reason=f"downgrade_transactional:{openai.reason}",
        )

    if openai.intent == "COMEX_QA" and heuristic.intent == "MARKET_INSIGHTS":
        return RouteDecision(
            intent="MARKET_INSIGHTS",
            confidence=min(max(openai.confidence, heuristic.confidence), 0.85),
            reason=f"prefer_market_insights:{openai.reason}",
        )

    if openai.intent in ("COMEX_QA", "MARKET_INSIGHTS") and heuristic.intent == "MARKET_MOVERS":
        return RouteDecision(
            intent="MARKET_MOVERS",
            confidence=min(max(openai.confidence, heuristic.confidence), 0.9),
            reason=f"prefer_market_movers:{openai.reason}",
        )

    return openai
