from unittest.mock import patch

from libs.comex_common.agents.schemas import AgentInput, Conversation


def test_router_includes_current_datetime(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "auto")
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    class FakeResponse:
        output_text = '{"intent":"COMEX_QA","confidence":0.7,"reasoning":"ok","next_action":"respond_directly"}'

    with patch("apps.router.now_iso", return_value="2026-03-30T00:00:00.000Z"):
        with patch("apps.router.OpenAI") as openai_cls:
            inst = openai_cls.return_value
            inst.responses.create.return_value = FakeResponse()
            from apps.router import route_intent

            route_intent("Market insights")
            kwargs = inst.responses.create.call_args.kwargs
            instructions = kwargs["instructions"]
            assert "Current datetime: 2026-03-30T00:00:00.000Z" in instructions
            assert "Never assume current date or time" in instructions


def test_seller_uses_context_now_iso(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    class FakeResponse:
        output_text = (
            '{"intent":"seller","output_text":"ok","action":{"type":"CREATE_SALE","payload":{},'
            '"confidence":0.5,"validation_errors":[]}}'
        )

    with patch("apps.agents.seller.OpenAI") as openai_cls:
        inst = openai_cls.return_value
        inst.responses.create.return_value = FakeResponse()
        from apps.agents.seller import SellerAgent

        agent_input = AgentInput(
            request_id="r1",
            user_id="u1",
            user_message="Sell coffee FOB Santos",
            conversation=Conversation(messages=[]),
            context={"NOW_ISO": "2026-03-30T12:34:56.789Z"},
            tools_enabled=True,
        )
        SellerAgent().run(agent_input)
        instructions = inst.responses.create.call_args.kwargs["instructions"]
        assert "Current datetime: 2026-03-30T12:34:56.789Z" in instructions


def test_market_insights_instructions_require_now_comparisons(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    class FakeResponse:
        output_text = '{"output_text":"ok"}'

    fake_docs = [
        {
            "text": "Coffee market snapshot",
            "metadata": {
                "type": "market_data",
                "sourceUrl": "https://example.com",
                "fetchedAt": "2026-03-30T00:00:00.000Z",
            },
        }
    ]

    class FakeRetrieval:
        docs = fake_docs
        confidence = 0.9

    with patch("apps.agents.info.retrieve_context", return_value=FakeRetrieval()):
        with patch("apps.agents.info.OpenAI") as openai_cls:
            inst = openai_cls.return_value
            inst.responses.create.return_value = FakeResponse()
            from apps.agents.info import InfoAgent

            agent_input = AgentInput(
                request_id="r1",
                user_id="u1",
                user_message="Market insights for coffee",
                conversation=Conversation(messages=[]),
                    context={
                        "route": "MARKET_INSIGHTS",
                        "NOW_ISO": "2026-03-30T12:34:56.789Z",
                        "market_tool_called": True,
                        "market_tool_data": {
                            "ok": True,
                            "source": "yahoo_finance",
                            "data": {
                                "symbol": "KC=F",
                                "currency": "USX",
                                "price": 300,
                                "high": 305,
                                "low": 295,
                                "previousClose": 298,
                                "volume": 20000,
                                "avgVolume": 15000,
                                "fetchedAt": "2026-03-30T12:34:00.000Z",
                                "timestamp": "2026-03-30T12:34:00.000Z",
                                "ticks_1m": [
                                    {"price": 299, "timestamp": "2026-03-30T12:32:00.000Z"},
                                    {"price": 300, "timestamp": "2026-03-30T12:33:00.000Z"},
                                    {"price": 300, "timestamp": "2026-03-30T12:34:00.000Z"},
                                ],
                                "ticks_5m": [
                                    {"price": 298, "timestamp": "2026-03-30T12:24:00.000Z"},
                                    {"price": 299, "timestamp": "2026-03-30T12:29:00.000Z"},
                                    {"price": 300, "timestamp": "2026-03-30T12:34:00.000Z"},
                                ],
                                "ticks_1h": [
                                    {"price": 295, "timestamp": "2026-03-30T10:34:00.000Z"},
                                    {"price": 297, "timestamp": "2026-03-30T11:34:00.000Z"},
                                    {"price": 300, "timestamp": "2026-03-30T12:34:00.000Z"},
                                ],
                            },
                        },
                    },
                tools_enabled=True,
            )
            InfoAgent().run(agent_input)
            instructions = inst.responses.create.call_args.kwargs["instructions"]
            assert "Current datetime: 2026-03-30T12:34:56.789Z" in instructions
            assert "If fetchedAt is older than 15 minutes compared to current datetime" in instructions
