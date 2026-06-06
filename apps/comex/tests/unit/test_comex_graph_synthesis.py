import os
from unittest.mock import patch

from libs.comex_common.agents.schemas import AgentInput, Conversation


def test_comex_graph_returns_agent_output(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4o-mini")
    monkeypatch.delenv("CORE_DATA_API_URL", raising=False)

    from apps.comex_graph import run_comex_graph

    agent_input = AgentInput(
        request_id="req-1",
        user_id="user-1",
        user_message="Sell 2 containers of coffee FOB Santos at $3800 to Jordan",
        conversation=Conversation(messages=[]),
        context={},
        tools_enabled=True,
    )

    class FakeResponse:
        def __init__(self, text: str):
            self.output_text = text

    calls = {"n": 0}

    def fake_create(**kwargs):
        calls["n"] += 1
        return FakeResponse('{"analysis":"ok"}')

    with patch("apps.comex_graph.OpenAI") as openai_cls:
        inst = openai_cls.return_value
        inst.responses.create.side_effect = fake_create
        res = run_comex_graph(agent_input=agent_input)

    assert res["agent_output"].intent in ("seller", "buyer", "info")
    assert "tool_result" in res
