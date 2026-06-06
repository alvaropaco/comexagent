from __future__ import annotations

import json
from typing import Any, Dict, Optional

from libs.comex_common.agents.schemas import AgentOutput


def build_operation_response(*, agent_output: AgentOutput, tool_result: Dict[str, Any]) -> Dict[str, Any]:
    action_type = agent_output.action.type

    if tool_result.get("reason") in ("out_of_scope", "empty"):
        return {
            "status": "error",
            "message": "Out of scope. Ask for COMEX topics or buy/sell operations.",
            "action_type": action_type,
            "reason": tool_result.get("reason"),
        }

    if tool_result.get("ok") is True:
        created = tool_result.get("created")
        message = "Operation completed."
        if action_type == "CREATE_SALE":
            message = "Sale offer created."
        elif action_type == "CREATE_BUY_ORDER":
            message = "Buy order created."

        return {
            "status": "success",
            "message": message,
            "action_type": action_type,
            "created": created,
            "idempotent": bool(tool_result.get("idempotent", False)),
        }

    if tool_result.get("reason") == "validation_errors" or agent_output.action.validation_errors:
        missing = tool_result.get("validation_errors") or agent_output.action.validation_errors
        return {
            "status": "needs_input",
            "message": "Missing required fields to create the order.",
            "action_type": action_type,
            "missing_fields": missing,
        }

    return {
        "status": "error",
        "message": "Operation failed.",
        "action_type": action_type,
        "reason": tool_result.get("reason"),
        "error": tool_result.get("error"),
    }


def format_agent_message(*, operation: Dict[str, Any]) -> str:
    status = operation.get("status")
    if status == "success":
        created = operation.get("created")
        return (
            f"SUCCESS: {operation.get('message')}\n"
            + ("Created:\n" + json.dumps(created, indent=2, ensure_ascii=False) if created else "")
        ).strip()
    if status == "needs_input":
        missing = operation.get("missing_fields") or []
        missing_str = ", ".join(missing)
        return f"FAILED: {operation.get('message')} Missing: {missing_str}".strip()
    return f"ERROR: {operation.get('message')}".strip()
