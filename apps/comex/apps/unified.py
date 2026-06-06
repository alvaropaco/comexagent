from __future__ import annotations

import os
import logging
from typing import Any, Dict, Optional

from apps.agents.buyer import BuyerAgent, heuristic_buyer_parse
from apps.agents.info import InfoAgent
from apps.agents.market_movers import MarketMoversAgent
from apps.agents.seller import SellerAgent
from apps.agents.seller_heuristic import heuristic_seller_parse
from apps.comex_graph import run_comex_graph
from apps.prompting import now_iso
from apps.freshness import age_seconds, is_stale
from apps.market_data_validation import validate_market_tool_payload
from apps.router import route_intent
from apps.orchestrator import execute_action
from apps.operation import build_operation_response, format_agent_message
from libs.comex_common.agents.schemas import AgentInput, AgentOutput, Conversation
from libs.comex_common.openai.tools import get_coffee_market_data, get_market_movers

logger = logging.getLogger(__name__)


def out_of_scope_agent_output() -> AgentOutput:
    return AgentOutput(
        intent="info",
        output_text="Out of scope. Ask only COMEX trading questions (sales, buy orders, pricing, matching, logistics).",
        action={
            "type": "NONE",
            "payload": {},
            "confidence": 1.0,
            "validation_errors": [],
        },
    )


def handle_request(
    *,
    request_id: str,
    user_id: str,
    user_message: str,
    idempotency_key: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not (user_message or "").strip():
        agent_output = out_of_scope_agent_output()
        operation = build_operation_response(agent_output=agent_output, tool_result={"ok": False, "reason": "empty"})
        agent_output = agent_output.model_copy(update={"output_text": format_agent_message(operation=operation)})
        return {"agent_output": agent_output, "tool_result": {"ok": False, "skipped": True, "reason": "empty"}, "operation": operation}

    base_context: Dict[str, Any] = {**(context or {})}
    base_context["NOW_ISO"] = now_iso()

    decision = route_intent(user_message)
    logger.info(
        "route_decision request_id=%s intent=%s confidence=%s reason=%s",
        request_id,
        decision.intent,
        decision.confidence,
        decision.reason,
    )

    graph_mode = (os.getenv("COMEX_GRAPH_MODE") or "auto").lower()
    if decision.intent in ("CREATE_SALE", "CREATE_BUY") and graph_mode in ("auto", "on") and os.getenv("OPENAI_API_KEY"):
        agent_input = AgentInput(
            request_id=request_id,
            user_id=user_id,
            user_message=user_message,
            conversation=Conversation(messages=[]),
            context={**base_context, "route": decision.intent},
            tools_enabled=True,
        )
        return run_comex_graph(agent_input=agent_input)

    mode_seller = (os.getenv("COMEX_SELLER_MODE") or "auto").lower()
    mode_buyer = (os.getenv("COMEX_BUYER_MODE") or "auto").lower()
    has_key = bool(os.getenv("OPENAI_API_KEY"))

    if decision.intent == "REJECT":
        agent_output = out_of_scope_agent_output()
        operation = build_operation_response(agent_output=agent_output, tool_result={"ok": False, "reason": "out_of_scope"})
        agent_output = agent_output.model_copy(update={"output_text": format_agent_message(operation=operation)})
        return {
            "agent_output": agent_output,
            "tool_result": {"ok": False, "skipped": True, "reason": "out_of_scope"},
            "operation": operation,
            "route": decision.intent,
        }

    if decision.intent == "CREATE_SALE":
        if mode_seller == "heuristic" or (mode_seller == "auto" and not has_key):
            agent = SellerAgent(llm_parse=heuristic_seller_parse)
        else:
            agent = SellerAgent()
    elif decision.intent == "CREATE_BUY":
        if mode_buyer == "heuristic" or (mode_buyer == "auto" and not has_key):
            agent = BuyerAgent(llm_parse=heuristic_buyer_parse)
        else:
            agent = BuyerAgent()
    elif decision.intent == "MARKET_MOVERS":
        now_value = str(base_context.get("NOW_ISO") or "")
        max_attempts = 2
        tool_data: Dict[str, Any] | None = None
        for attempt in range(1, max_attempts + 1):
            logger.info("market_movers_tool_call:start request_id=%s attempt=%s", request_id, attempt)
            tool_data = get_market_movers()
            if not bool(tool_data.get("ok")):
                logger.info("market_movers_tool_call:failed request_id=%s attempt=%s", request_id, attempt)
                if attempt >= max_attempts:
                    agent_output = AgentOutput(
                        intent="info",
                        output_text="insufficient data",
                        action={"type": "NONE", "payload": {}, "confidence": 1.0, "validation_errors": []},
                    )
                    operation = build_operation_response(agent_output=agent_output, tool_result={"ok": False, "reason": "market_movers_tool_failed"})
                    return {
                        "agent_output": agent_output,
                        "tool_result": {"ok": False, "reason": "market_movers_tool_failed"},
                        "route": decision.intent,
                        "operation": operation,
                    }
                continue

            fetched_at = None
            inner = tool_data.get("data") if isinstance(tool_data, dict) else None
            if isinstance(inner, dict):
                fetched_at = inner.get("fetchedAt")
            fetched_at_s = str(fetched_at or "").strip()
            stale = is_stale(now_iso=now_value, fetched_at_iso=fetched_at_s)
            age_s = age_seconds(now_iso=now_value, fetched_at_iso=fetched_at_s)
            logger.info(
                "market_movers_freshness_check request_id=%s attempt=%s fetchedAt=%s age_s=%s stale=%s",
                request_id,
                attempt,
                fetched_at_s or None,
                age_s,
                stale,
            )
            if not stale:
                break
            if attempt >= max_attempts:
                agent_output = AgentOutput(
                    intent="info",
                    output_text="Data is stale. Refresh required.",
                    action={"type": "NONE", "payload": {}, "confidence": 1.0, "validation_errors": []},
                )
                operation = build_operation_response(agent_output=agent_output, tool_result={"ok": False, "reason": "market_movers_tool_stale"})
                return {
                    "agent_output": agent_output,
                    "tool_result": {"ok": False, "reason": "market_movers_tool_stale"},
                    "route": decision.intent,
                    "operation": operation,
                }

        base_context["market_movers_tool_called"] = True
        base_context["market_movers_tool_name"] = "get_market_movers"
        base_context["market_movers_tool_data"] = tool_data
        logger.info("market_movers_tool_call:ok request_id=%s", request_id)

        agent = MarketMoversAgent()
        agent_input = AgentInput(
            request_id=request_id,
            user_id=user_id,
            user_message=user_message,
            conversation=Conversation(messages=[]),
            context={**base_context, "route": decision.intent},
            tools_enabled=True,
        )
        agent_output = agent.run(agent_input)
        operation = build_operation_response(agent_output=agent_output, tool_result={"ok": True, "skipped": True})
        return {
            "agent_output": agent_output,
            "tool_result": {"ok": True, "skipped": True},
            "route": decision.intent,
            "operation": operation,
        }
    else:
        agent = InfoAgent()
        if decision.intent == "MARKET_INSIGHTS":
            now_value = str(base_context.get("NOW_ISO") or "")
            max_attempts = 2
            tool_data: Dict[str, Any] | None = None
            for attempt in range(1, max_attempts + 1):
                logger.info("market_insights_tool_call:start request_id=%s attempt=%s", request_id, attempt)
                tool_data = get_coffee_market_data()
                if not bool(tool_data.get("ok")):
                    logger.info("market_insights_tool_call:failed request_id=%s attempt=%s", request_id, attempt)
                    if attempt >= max_attempts:
                        agent_output = AgentOutput(
                            intent="info",
                            output_text="insufficient data",
                            action={"type": "NONE", "payload": {}, "confidence": 1.0, "validation_errors": []},
                        )
                        operation = build_operation_response(agent_output=agent_output, tool_result={"ok": False, "reason": "market_tool_failed"})
                        return {
                            "agent_output": agent_output,
                            "tool_result": {"ok": False, "reason": "market_tool_failed"},
                            "route": decision.intent,
                            "operation": operation,
                        }
                    continue

                ts = None
                data = tool_data.get("data") if isinstance(tool_data, dict) else None
                if isinstance(data, dict):
                    ts = data.get("fetchedAt") or data.get("timestamp")
                ts = str(ts or "").strip()

                stale = is_stale(now_iso=now_value, fetched_at_iso=ts)
                age_s = age_seconds(now_iso=now_value, fetched_at_iso=ts)
                valid, v_reason, v_details = validate_market_tool_payload(tool_data)
                logger.info(
                    "market_insights_freshness_check request_id=%s attempt=%s timestamp=%s age_s=%s stale=%s valid=%s v_reason=%s",
                    request_id,
                    attempt,
                    ts or None,
                    age_s,
                    stale,
                    valid,
                    v_reason,
                )
                if not valid:
                    logger.info(
                        "market_insights_tool_data_invalid request_id=%s attempt=%s reason=%s details=%s",
                        request_id,
                        attempt,
                        v_reason,
                        v_details,
                    )
                    if attempt >= max_attempts:
                        agent_output = AgentOutput(
                            intent="info",
                            output_text="insufficient data",
                            action={"type": "NONE", "payload": {}, "confidence": 1.0, "validation_errors": []},
                        )
                        operation = build_operation_response(agent_output=agent_output, tool_result={"ok": False, "reason": "market_tool_invalid"})
                        return {
                            "agent_output": agent_output,
                            "tool_result": {"ok": False, "reason": "market_tool_invalid"},
                            "route": decision.intent,
                            "operation": operation,
                        }
                    continue
                if not stale:
                    break
                if attempt >= max_attempts:
                    agent_output = AgentOutput(
                        intent="info",
                        output_text="Data is stale. Refresh required.",
                        action={"type": "NONE", "payload": {}, "confidence": 1.0, "validation_errors": []},
                    )
                    operation = build_operation_response(agent_output=agent_output, tool_result={"ok": False, "reason": "market_tool_stale"})
                    return {
                        "agent_output": agent_output,
                        "tool_result": {"ok": False, "reason": "market_tool_stale"},
                        "route": decision.intent,
                        "operation": operation,
                    }
            base_context["market_tool_called"] = True
            base_context["market_tool_name"] = "get_coffee_market_data"
            base_context["market_tool_data"] = tool_data
            logger.info("market_insights_tool_call:ok request_id=%s", request_id)
        agent_input = AgentInput(
            request_id=request_id,
            user_id=user_id,
            user_message=user_message,
            conversation=Conversation(messages=[]),
            context={**base_context, "route": decision.intent},
            tools_enabled=True,
        )
        agent_output = agent.run(agent_input)
        operation = build_operation_response(agent_output=agent_output, tool_result={"ok": True, "skipped": True})
        return {
            "agent_output": agent_output,
            "tool_result": {"ok": True, "skipped": True},
            "route": decision.intent,
            "operation": operation,
        }

    agent_input = AgentInput(
        request_id=request_id,
        user_id=user_id,
        user_message=user_message,
        conversation=Conversation(messages=[]),
        context={**base_context, "route": decision.intent},
        tools_enabled=True,
    )

    agent_output = agent.run(agent_input)
    tool_result = execute_action(agent_output=agent_output, idempotency_key=idempotency_key or request_id)
    operation = build_operation_response(agent_output=agent_output, tool_result=tool_result)
    if agent_output.action.type != "NONE":
        agent_output = agent_output.model_copy(update={"output_text": format_agent_message(operation=operation)})
    return {"agent_output": agent_output, "tool_result": tool_result, "route": decision.intent, "operation": operation}
