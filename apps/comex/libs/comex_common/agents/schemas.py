from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

from libs.comex_common.domain.schemas import (
    AlertDraftPayload,
    CreateBuyOrderPayload,
    CreateSalePayload,
    DraftCreateBuyOrderPayload,
    DraftCreateSalePayload,
    MatchExplanationPayload,
    PricingExplanationPayload,
)


Role = Literal["user", "assistant", "system", "tool"]


class ChatMsg(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Role
    text: str


class Conversation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: Optional[str] = None
    messages: List[ChatMsg]
    summary: Optional[str] = None


class AgentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str
    user_id: str
    user_message: str
    conversation: Conversation
    context: Dict[str, Any] = Field(default_factory=dict)
    tools_enabled: bool = True


ActionType = Literal[
    "CREATE_SALE",
    "CREATE_BUY_ORDER",
    "NONE",
    "MATCH_EXPLANATION",
    "PRICING_EXPLANATION",
    "ALERT_DRAFT",
]

class BaseAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confidence: float = Field(ge=0, le=1)
    validation_errors: List[str] = Field(default_factory=list)


class CreateSaleAction(BaseAction):
    type: Literal["CREATE_SALE"]
    payload: DraftCreateSalePayload


class CreateBuyOrderAction(BaseAction):
    type: Literal["CREATE_BUY_ORDER"]
    payload: DraftCreateBuyOrderPayload


class MatchExplanationAction(BaseAction):
    type: Literal["MATCH_EXPLANATION"]
    payload: MatchExplanationPayload


class PricingExplanationAction(BaseAction):
    type: Literal["PRICING_EXPLANATION"]
    payload: PricingExplanationPayload


class AlertDraftAction(BaseAction):
    type: Literal["ALERT_DRAFT"]
    payload: AlertDraftPayload


class NoneAction(BaseAction):
    type: Literal["NONE"]

    class _EmptyPayload(BaseModel):
        model_config = ConfigDict(extra="forbid")

    payload: _EmptyPayload = Field(default_factory=_EmptyPayload)


Action = Union[
    CreateSaleAction,
    CreateBuyOrderAction,
    MatchExplanationAction,
    PricingExplanationAction,
    AlertDraftAction,
    NoneAction,
]


class AgentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: Literal["seller", "buyer", "insights", "info", "matching", "pricing", "opportunity"]
    output_text: str
    action: Action
