from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

from libs.comex_common.agents.schemas import AgentInput, AgentOutput


def _split_movers(movers: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    gainers = [m for m in movers if isinstance(m.get("changePercent"), (int, float)) and float(m["changePercent"]) > 0]
    losers = [m for m in movers if isinstance(m.get("changePercent"), (int, float)) and float(m["changePercent"]) < 0]
    gainers = sorted(gainers, key=lambda x: float(x.get("changePercent") or 0.0), reverse=True)
    losers = sorted(losers, key=lambda x: float(x.get("changePercent") or 0.0))
    return (gainers, losers)


def _fmt(m: Dict[str, Any]) -> str:
    sym = str(m.get("symbol") or "").strip() or "?"
    cp = m.get("changePercent")
    cur = m.get("currency")
    if isinstance(cp, (int, float)):
        cp_s = f"{float(cp):.2f}%"
    else:
        cp_s = "?"
    cur_s = str(cur) if isinstance(cur, str) else ""
    return f"{sym} {cp_s} {cur_s}".strip()


@dataclass(frozen=True)
class MarketMoversAgent:
    def run(self, agent_input: AgentInput) -> AgentOutput:
        ctx = agent_input.context or {}
        tool_data = ctx.get("market_movers_tool_data")
        inner = tool_data.get("data") if isinstance(tool_data, dict) else None
        fetched_at = None
        movers = None
        if isinstance(inner, dict):
            fetched_at = inner.get("fetchedAt")
            movers = inner.get("movers")
        if not isinstance(movers, list) or not movers:
            return AgentOutput(
                intent="info",
                output_text="insufficient data",
                action={"type": "NONE", "payload": {}, "confidence": 1.0, "validation_errors": []},
            )

        gainers, losers = _split_movers(movers)
        top_gainers = gainers[:5]
        top_losers = losers[:5]

        lines: List[str] = []
        lines.append("Top movers (commodities)")
        if isinstance(fetched_at, str) and fetched_at.strip():
            lines.append(f"fetchedAt: {fetched_at.strip()}")
        if top_gainers:
            lines.append("Gainers: " + "; ".join(_fmt(m) for m in top_gainers))
        if top_losers:
            lines.append("Losers: " + "; ".join(_fmt(m) for m in top_losers))

        return AgentOutput(
            intent="info",
            output_text="\n".join(lines).strip(),
            action={"type": "NONE", "payload": {}, "confidence": 1.0, "validation_errors": []},
        )

