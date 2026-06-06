from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Callable, Optional

from openai import OpenAI
from openai import OpenAIError

from apps.prompting import get_now_iso, inject_now_iso
from libs.comex_common.agents.schemas import AgentInput, AgentOutput, CreateBuyOrderAction


LLMParseFn = Callable[[AgentInput], AgentOutput]


def _buyer_agent_output_schema() -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "intent": {"type": "string", "enum": ["buyer"]},
            "output_text": {"type": "string"},
            "action": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "type": {"type": "string", "enum": ["CREATE_BUY_ORDER"]},
                    "payload": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "commodity": {"type": ["string", "null"]},
                            "target_price": {"type": ["number", "null"]},
                            "currency": {
                                "type": ["string", "null"],
                                "enum": ["USD", "BRL", "EUR", None],
                            },
                            "volume": {
                                "type": ["object", "null"],
                                "additionalProperties": False,
                                "properties": {
                                    "value": {"type": "number"},
                                    "unit": {"type": "string"},
                                },
                                "required": ["value", "unit"],
                            },
                            "destination": {"type": ["string", "null"]},
                        },
                        "required": ["commodity", "target_price", "currency", "volume", "destination"],
                    },
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "validation_errors": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["type", "payload", "confidence", "validation_errors"],
            },
        },
        "required": ["intent", "output_text", "action"],
    }


def _normalize_buyer_output(*, agent_input: AgentInput, agent_output: AgentOutput) -> AgentOutput:
    if agent_output.intent != "buyer":
        return agent_output
    if agent_output.action.type != "CREATE_BUY_ORDER":
        return agent_output

    payload = agent_output.action.payload
    currency = payload.currency
    if currency is None and "$" in agent_input.user_message:
        payload = payload.model_copy(update={"currency": "USD"})

    if payload.volume is not None:
        unit = (payload.volume.unit or "").strip()
        if not unit:
            msg = agent_input.user_message
            inferred = None
            if re.search(r"\bcontainers?\b", msg, re.IGNORECASE):
                inferred = "containers"
            elif re.search(r"\btons?\b", msg, re.IGNORECASE):
                inferred = "tons"
            elif re.search(r"\bmt\b", msg, re.IGNORECASE):
                inferred = "mt"
            elif re.search(r"\bkg\b", msg, re.IGNORECASE):
                inferred = "kg"

            if inferred:
                payload = payload.model_copy(
                    update={"volume": payload.volume.model_copy(update={"unit": inferred})}
                )

    missing: list[str] = []
    if not payload.commodity:
        missing.append("commodity")
    if payload.target_price is None:
        missing.append("target_price")
    if payload.currency is None:
        missing.append("currency")
    if payload.volume is None:
        missing.append("volume")
    else:
        if payload.volume.value is None:
            missing.append("volume.value")
        if not payload.volume.unit:
            missing.append("volume.unit")

    confidence = agent_output.action.confidence
    if missing:
        confidence = min(confidence, 0.7)
        output_text = agent_output.output_text
    else:
        confidence = max(confidence, 0.85)
        output_text = "Parsed buy order."

    return agent_output.model_copy(
        update={
            "output_text": output_text,
            "action": CreateBuyOrderAction(
                type="CREATE_BUY_ORDER",
                payload=payload,
                confidence=confidence,
                validation_errors=missing,
            ),
        }
    )


def _detect_volume(text: str) -> dict | None:
    m = re.search(r"\b([0-9]+(?:\.[0-9]+)?)\s*(containers|container|tons|ton|mt|kg)\b", text, re.IGNORECASE)
    if not m:
        return None
    value = float(m.group(1))
    unit = m.group(2).lower()
    if unit == "container":
        unit = "containers"
    if unit == "ton":
        unit = "tons"
    return {"value": value, "unit": unit}


def heuristic_buyer_parse(agent_input: AgentInput) -> AgentOutput:
    msg = agent_input.user_message
    lower = msg.lower()

    commodity = "coffee" if "coffee" in lower else None
    m = re.search(r"\bbuy\s+([a-z][a-z\-]+)", lower)
    if commodity is None and m:
        commodity = m.group(1)

    price = None
    m = re.search(r"\$\s*([0-9]+(?:\.[0-9]+)?)", msg)
    if m:
        price = float(m.group(1))
    m = re.search(r"\btarget\s*price\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\b", msg, re.IGNORECASE)
    if m:
        price = float(m.group(1))

    currency = None
    upper = msg.upper()
    for c in ("USD", "BRL", "EUR"):
        if c in upper:
            currency = c
    if currency is None and "$" in msg:
        currency = "USD"

    volume = _detect_volume(msg)

    dest = None
    m = re.search(r"\bto\s+([A-Za-z][A-Za-z\-\s]{1,60})$", msg.strip(), re.IGNORECASE)
    if m:
        dest = m.group(1).strip()

    payload = {
        "commodity": commodity,
        "target_price": price,
        "currency": currency,
        "volume": volume,
        "destination": dest,
    }

    missing = [k for k, v in payload.items() if v is None and k in ("commodity", "target_price", "currency", "volume")]
    output_text = "Missing fields: " + ", ".join(missing) if missing else "Parsed buy order."

    return AgentOutput(
        intent="buyer",
        output_text=output_text,
        action={
            "type": "CREATE_BUY_ORDER",
            "payload": payload,
            "confidence": 0.95 if not missing else 0.6,
            "validation_errors": missing,
        },
    )


@dataclass(frozen=True)
class BuyerAgent:
    llm_parse: Optional[LLMParseFn] = None

    def run(self, agent_input: AgentInput) -> AgentOutput:
        if self.llm_parse is not None:
            return self.llm_parse(agent_input)

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return _normalize_buyer_output(
                agent_input=agent_input,
                agent_output=AgentOutput(
                    intent="buyer",
                    output_text="OpenAI is not configured for this environment.",
                    action={
                        "type": "CREATE_BUY_ORDER",
                        "payload": {},
                        "confidence": 0.0,
                        "validation_errors": ["llm_not_configured"],
                    },
                ),
            )

        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        client = OpenAI(api_key=api_key)
        schema = _buyer_agent_output_schema()

        instructions = (
            "You are BuyerAgent for COMEX. Extract a buy order from the user's message. "
            "If required fields are missing, include validation_errors listing missing fields and ask concise questions in output_text. "
            "Output MUST match the provided schema."
        )
        instructions = inject_now_iso(instructions=instructions, now_iso_value=get_now_iso(agent_input.context))

        try:
            response = client.responses.create(
                model=model,
                instructions=instructions,
                input=agent_input.user_message,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "AgentOutput",
                        "schema": schema,
                        "strict": True,
                    }
                },
            )
            data = json.loads(response.output_text)
            parsed = AgentOutput.model_validate(data)
            return _normalize_buyer_output(agent_input=agent_input, agent_output=parsed)
        except OpenAIError as e:
            return _normalize_buyer_output(
                agent_input=agent_input,
                agent_output=AgentOutput(
                    intent="buyer",
                    output_text=f"OpenAI error: {e}",
                    action={
                        "type": "CREATE_BUY_ORDER",
                        "payload": {},
                        "confidence": 0.0,
                        "validation_errors": ["openai_error"],
                    },
                ),
            )

    def process_message(
        self,
        *,
        request_id: str,
        user_id: str,
        user_message: str,
        conversation,
        context,
        tools_enabled: bool = True,
    ) -> AgentOutput:
        agent_input = AgentInput(
            request_id=request_id,
            user_id=user_id,
            user_message=user_message,
            conversation=conversation,
            context=context,
            tools_enabled=tools_enabled,
        )
        return self.run(agent_input)
