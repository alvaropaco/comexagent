from __future__ import annotations

from typing import Any, Dict

from libs.comex_common.agents.schemas import AgentOutput
from libs.comex_common.openai.tools import create_buy_order, create_sale


def execute_action(*, agent_output: AgentOutput, idempotency_key: str) -> Dict[str, Any]:
    if agent_output.action.validation_errors:
        return {
            "ok": False,
            "skipped": True,
            "reason": "validation_errors",
            "validation_errors": agent_output.action.validation_errors,
        }

    if agent_output.action.type == "CREATE_SALE":
        try:
            payload = agent_output.action.payload.model_dump(exclude_none=True)
            return create_sale(idempotency_key=idempotency_key, payload=payload)
        except Exception as e:
            return {"ok": False, "skipped": True, "reason": "tool_error", "error": e.__class__.__name__}

    if agent_output.action.type == "CREATE_BUY_ORDER":
        try:
            payload = agent_output.action.payload.model_dump(exclude_none=True)
            return create_buy_order(idempotency_key=idempotency_key, payload=payload)
        except Exception as e:
            return {"ok": False, "skipped": True, "reason": "tool_error", "error": e.__class__.__name__}
    return {"ok": True, "skipped": True}
