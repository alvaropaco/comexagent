import os
from unittest.mock import patch

from libs.comex_common.agents.schemas import AgentInput, Conversation


def test_info_agent_injects_retrieved_context(monkeypatch):
    monkeypatch.setenv("CORE_DATA_API_URL", "https://core.local")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4o-mini")
    monkeypatch.setenv("COMEX_QUERY_CONTEXT_MODE", "heuristic")

    import apps.rag.retrieval as retrieval

    retrieval._CACHE.clear()

    from apps.agents.info import InfoAgent

    agent_input = AgentInput(
        request_id="r1",
        user_id="u1",
        user_message="What does FOB Santos mean for coffee exports?",
        conversation=Conversation(messages=[]),
        context={},
        tools_enabled=True,
    )

    fake_vector_response = {
        "success": True,
        "data": [
            {
                "text": "FOB means seller loads on vessel at port.",
                "metadata": {"type": "sale", "saleId": "s1"},
                "score": 0.9,
            }
        ],
    }

    class FakeOpenAIResponse:
        output_text = '{"output_text":"ok"}'

    with patch("apps.rag.retrieval.get_core_data_api_client") as get_client:
        client = get_client.return_value
        client.vector_search.return_value = fake_vector_response

        with patch("apps.agents.info.OpenAI") as openai_cls:
            instance = openai_cls.return_value

            def capture_create(**kwargs):
                assert "Retrieved context" in kwargs["input"]
                assert "FOB means seller loads on vessel" in kwargs["input"]
                return FakeOpenAIResponse()

            instance.responses.create.side_effect = capture_create

            out = InfoAgent().run(agent_input)

    assert out.intent == "info"
    assert out.output_text == "ok"


def test_market_insights_without_market_data_returns_no_numbers(monkeypatch):
    monkeypatch.setenv("CORE_DATA_API_URL", "https://core.local")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("COMEX_QUERY_CONTEXT_MODE", "heuristic")

    import apps.rag.retrieval as retrieval

    retrieval._CACHE.clear()

    from apps.agents.info import InfoAgent

    agent_input = AgentInput(
        request_id="r2",
        user_id="u1",
        user_message="Coffee market trends this week",
        conversation=Conversation(messages=[]),
        context={"route": "MARKET_INSIGHTS"},
        tools_enabled=True,
    )

    try:
        InfoAgent().run(agent_input)
        assert False
    except RuntimeError as e:
        assert "market_insights_tool_required" in str(e)


def test_market_insights_strips_hallucinated_numbers(monkeypatch):
    monkeypatch.setenv("CORE_DATA_API_URL", "https://core.local")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4o-mini")
    monkeypatch.setenv("COMEX_QUERY_CONTEXT_MODE", "heuristic")

    import apps.rag.retrieval as retrieval

    retrieval._CACHE.clear()

    from apps.agents.info import InfoAgent

    agent_input = AgentInput(
        request_id="r3",
        user_id="u1",
        user_message="Coffee market trends this week in 2026",
        conversation=Conversation(messages=[]),
        context={
            "route": "MARKET_INSIGHTS",
            "market_tool_called": True,
            "NOW_ISO": "2026-03-30T12:40:00.000Z",
            "market_tool_data": {
                "ok": True,
                "data": {
                    "ticks_1m": [{"price": 300, "timestamp": "2026-03-30T12:38:00Z"}] * 3,
                    "ticks_5m": [{"price": 299, "timestamp": "2026-03-30T12:30:00Z"}] * 3,
                    "ticks_1h": [{"price": 298, "timestamp": "2026-03-30T11:40:00Z"}] * 3,
                    "volume": 20000,
                    "avgVolume": 15000,
                    "previousClose": 298,
                    "high": 305,
                    "low": 295,
                    "fetchedAt": "2026-03-30T12:39:00Z",
                },
            },
        },
        tools_enabled=True,
    )

    class FakeOpenAIResponse:
        output_text = (
            '{"output_text":"Signal: buy\\nConfidence: high\\nScore: 5\\nTimeframe Alignment: 1m=upward 5m=upward 1h=upward\\n'
            'Volume: high\\nReason: 9999\\nRisks: Multi-timeframe disagreement reduces reliability; no macro or external context"}'
        )

    with patch("apps.agents.info.OpenAI") as openai_cls:
        instance = openai_cls.return_value
        instance.responses.create.return_value = FakeOpenAIResponse()
        out = InfoAgent().run(agent_input)

    assert "9999" not in out.output_text
    assert "Signal:" in out.output_text
