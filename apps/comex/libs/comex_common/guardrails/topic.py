from __future__ import annotations

import re
from dataclasses import dataclass


_INCOTERMS = ("FOB", "CFR", "CIF", "EXW", "DAP", "DDP")


_COMEX_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(comex|commodity|commodities|trade|trading|freight|incoterm)\b", re.IGNORECASE),
    re.compile(r"\b(sell|selling|sale|offer|buy|buying|order|demand|bid|ask)\b", re.IGNORECASE),
    re.compile(r"\b(price|target\s*price|margin|spread|fx|usd|brl|eur)\b", re.IGNORECASE),
    re.compile(r"\b(origin|destination|shipment|shipping|container|containers|ton|tons|mt|kg)\b", re.IGNORECASE),
    re.compile(r"\b(match|matching|alert|opportunity|pricing)\b", re.IGNORECASE),
    re.compile(r"\b(" + "|".join(_INCOTERMS) + r")\b", re.IGNORECASE),
)


@dataclass(frozen=True)
class GuardrailResult:
    allowed: bool
    reason: str


def check_comex_scope(text: str) -> GuardrailResult:
    cleaned = (text or "").strip()
    if not cleaned:
        return GuardrailResult(False, "empty")

    for pat in _COMEX_PATTERNS:
        if pat.search(cleaned):
            return GuardrailResult(True, "comex_related")

    return GuardrailResult(False, "out_of_scope")
