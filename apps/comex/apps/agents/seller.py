from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Callable, Optional

from openai import OpenAI
from openai import OpenAIError

from apps.prompting import get_now_iso, inject_now_iso
from libs.comex_common.agents.schemas import AgentInput, AgentOutput, CreateSaleAction


def _seller_agent_output_schema() -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "intent": {"type": "string", "enum": ["seller"]},
            "output_text": {"type": "string"},
            "action": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "type": {"type": "string", "enum": ["CREATE_SALE"]},
                    "payload": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "commodity": {"type": ["string", "null"]},
                            "incoterm": {
                                "type": ["string", "null"],
                                "enum": ["FOB", "CFR", "CIF", "EXW", "DAP", "DDP", None],
                            },
                            "price": {"type": ["number", "null"]},
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
                            "origin": {"type": ["string", "null"]},
                            "destination": {"type": ["string", "null"]},
                        },
                        "required": [
                            "commodity",
                            "incoterm",
                            "price",
                            "currency",
                            "volume",
                            "origin",
                            "destination",
                        ],
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


def _normalize_seller_output(*, agent_input: AgentInput, agent_output: AgentOutput) -> AgentOutput:
    if agent_output.intent != "seller":
        return agent_output
    if agent_output.action.type != "CREATE_SALE":
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
    if not payload.incoterm:
        missing.append("incoterm")
    if payload.price is None:
        missing.append("price")
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
        output_text = "Parsed sale offer."

    return agent_output.model_copy(
        update={
            "output_text": output_text,
            "action": CreateSaleAction(
                type="CREATE_SALE",
                payload=payload,
                confidence=confidence,
                validation_errors=missing,
            ),
        }
    )


LLMParseFn = Callable[[AgentInput], AgentOutput]


@dataclass(frozen=True)
class SellerAgent:
    llm_parse: Optional[LLMParseFn] = None

    def run(self, agent_input: AgentInput) -> AgentOutput:
        if self.llm_parse is not None:
            return self.llm_parse(agent_input)

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return _normalize_seller_output(
                agent_input=agent_input,
                agent_output=AgentOutput(
                intent="seller",
                output_text="OpenAI is not configured for this environment.",
                action=CreateSaleAction(
                    type="CREATE_SALE",
                    payload={},
                    confidence=0.0,
                    validation_errors=["llm_not_configured"],
                ),
                ),
            )

        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        client = OpenAI(api_key=api_key)

        schema = _seller_agent_output_schema()
        instructions = (
            "You are SellerAgent for COMEX. Extract a sale offer from the user's message. "
            "If required fields are missing, set action.type=CREATE_SALE but include validation_errors listing missing fields "
            "and ask concise questions in output_text. Output MUST match the AgentOutput schema."
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
            return _normalize_seller_output(agent_input=agent_input, agent_output=parsed)
        except OpenAIError as e:
            return _normalize_seller_output(
                agent_input=agent_input,
                agent_output=AgentOutput(
                intent="seller",
                output_text=f"OpenAI error: {e}",
                action=CreateSaleAction(
                    type="CREATE_SALE",
                    payload={},
                    confidence=0.0,
                    validation_errors=["openai_error"],
                ),
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
