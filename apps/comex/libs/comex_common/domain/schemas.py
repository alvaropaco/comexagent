from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


Incoterm = Literal["FOB", "CFR", "CIF", "EXW", "DAP", "DDP"]
Currency = Literal["USD", "BRL", "EUR"]


class Volume(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: float
    unit: str


class CreateSalePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    commodity: str
    incoterm: Incoterm
    price: float
    currency: Currency
    volume: Volume
    origin: Optional[str] = None
    destination: Optional[str] = None


class DraftCreateSalePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    commodity: Optional[str] = None
    incoterm: Optional[Incoterm] = None
    price: Optional[float] = None
    currency: Optional[Currency] = None
    volume: Optional[Volume] = None
    origin: Optional[str] = None
    destination: Optional[str] = None


class CreateBuyOrderPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    commodity: str
    target_price: float
    currency: Currency
    volume: Volume
    destination: Optional[str] = None


class DraftCreateBuyOrderPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    commodity: Optional[str] = None
    target_price: Optional[float] = None
    currency: Optional[Currency] = None
    volume: Optional[Volume] = None
    destination: Optional[str] = None


class MatchExplanationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sale_id: str
    buy_order_id: str
    score: float
    reason: str


class PricingExplanationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sale_id: Optional[str] = None
    predicted_margin: float
    recommended_price: float
    currency: Currency
    assumptions: list["Assumption"] = Field(default_factory=list)


class Assumption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    value: str


class AlertDraftPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alert_type: Literal["opportunity", "risk", "timing"]
    title: str
    message: str
    severity: Literal["LOW", "MEDIUM", "HIGH"]
