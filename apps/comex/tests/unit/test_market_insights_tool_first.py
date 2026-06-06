from unittest.mock import patch


def test_market_insights_requires_tool_call(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")

    from apps.unified import handle_request

    with patch(
        "apps.unified.get_coffee_market_data",
        return_value={
            "ok": True,
            "data": {
                "symbol": "KC=F",
                "currency": "USX",
                "price": 300,
                "high": 305,
                "low": 295,
                "previousClose": 298,
                "volume": 20000,
                "avgVolume": 15000,
                "timestamp": "2026-03-30T12:34:00.000Z",
                "fetchedAt": "2026-03-30T12:39:00.000Z",
                "ticks_1m": [
                    {"price": 299, "timestamp": "2026-03-30T12:37:00.000Z"},
                    {"price": 300, "timestamp": "2026-03-30T12:38:00.000Z"},
                    {"price": 300, "timestamp": "2026-03-30T12:39:00.000Z"},
                ],
                "ticks_5m": [
                    {"price": 298, "timestamp": "2026-03-30T12:29:00.000Z"},
                    {"price": 299, "timestamp": "2026-03-30T12:34:00.000Z"},
                    {"price": 300, "timestamp": "2026-03-30T12:39:00.000Z"},
                ],
                "ticks_1h": [
                    {"price": 295, "timestamp": "2026-03-30T10:39:00.000Z"},
                    {"price": 297, "timestamp": "2026-03-30T11:39:00.000Z"},
                    {"price": 300, "timestamp": "2026-03-30T12:39:00.000Z"},
                ],
            },
        },
    ) as tool:
        with patch("apps.unified.now_iso", return_value="2026-03-30T12:40:00.000Z"):
            res = handle_request(
                request_id="r1",
                user_id="u1",
                user_message="Coffee price trends",
                context={},
            )
        assert tool.called is True
        assert res["route"] == "MARKET_INSIGHTS"
        assert "agent_output" in res


def test_market_insights_refetches_when_tool_timestamp_is_stale(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")

    from apps.unified import handle_request

    stale = {
        "ok": True,
        "data": {
            "symbol": "KC=F",
            "currency": "USX",
            "price": 300,
            "high": 305,
            "low": 295,
            "previousClose": 298,
            "volume": 20000,
            "avgVolume": 15000,
            "fetchedAt": "2026-03-30T12:00:00.000Z",
            "ticks_1m": [
                {"price": 298, "timestamp": "2026-03-30T11:58:00.000Z"},
                {"price": 299, "timestamp": "2026-03-30T11:59:00.000Z"},
                {"price": 300, "timestamp": "2026-03-30T12:00:00.000Z"},
            ],
            "ticks_5m": [
                {"price": 297, "timestamp": "2026-03-30T11:50:00.000Z"},
                {"price": 298, "timestamp": "2026-03-30T11:55:00.000Z"},
                {"price": 300, "timestamp": "2026-03-30T12:00:00.000Z"},
            ],
            "ticks_1h": [
                {"price": 295, "timestamp": "2026-03-30T10:00:00.000Z"},
                {"price": 298, "timestamp": "2026-03-30T11:00:00.000Z"},
                {"price": 300, "timestamp": "2026-03-30T12:00:00.000Z"},
            ],
        },
    }
    fresh = {
        "ok": True,
        "data": {
            "symbol": "KC=F",
            "currency": "USX",
            "price": 302,
            "high": 306,
            "low": 296,
            "previousClose": 300,
            "volume": 20000,
            "avgVolume": 15000,
            "fetchedAt": "2026-03-30T12:34:00.000Z",
            "ticks_1m": [
                {"price": 300, "timestamp": "2026-03-30T12:32:00.000Z"},
                {"price": 301, "timestamp": "2026-03-30T12:33:00.000Z"},
                {"price": 302, "timestamp": "2026-03-30T12:34:00.000Z"},
            ],
            "ticks_5m": [
                {"price": 299, "timestamp": "2026-03-30T12:24:00.000Z"},
                {"price": 301, "timestamp": "2026-03-30T12:29:00.000Z"},
                {"price": 302, "timestamp": "2026-03-30T12:34:00.000Z"},
            ],
            "ticks_1h": [
                {"price": 296, "timestamp": "2026-03-30T10:34:00.000Z"},
                {"price": 299, "timestamp": "2026-03-30T11:34:00.000Z"},
                {"price": 302, "timestamp": "2026-03-30T12:34:00.000Z"},
            ],
        },
    }

    with patch("apps.unified.get_coffee_market_data", side_effect=[stale, fresh]) as tool:
        with patch("apps.unified.now_iso", return_value="2026-03-30T12:40:00.000Z"):
            res = handle_request(
                request_id="r1",
                user_id="u1",
                user_message="Coffee price trends",
                context={},
            )
        assert tool.call_count == 2
        assert res["route"] == "MARKET_INSIGHTS"


def test_market_insights_throws_if_tool_not_called(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")

    from libs.comex_common.agents.schemas import AgentInput, Conversation
    from apps.agents.info import InfoAgent

    agent_input = AgentInput(
        request_id="r1",
        user_id="u1",
        user_message="Market insights",
        conversation=Conversation(messages=[]),
        context={"route": "MARKET_INSIGHTS"},
        tools_enabled=True,
    )
    try:
        InfoAgent().run(agent_input)
        assert False
    except RuntimeError as e:
        assert "market_insights_tool_required" in str(e)


def test_market_insights_throws_if_tool_stays_stale(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")

    from apps.unified import handle_request

    stale = {
        "ok": True,
        "data": {
            "symbol": "KC=F",
            "currency": "USX",
            "price": 300,
            "high": 305,
            "low": 295,
            "previousClose": 298,
            "volume": 20000,
            "avgVolume": 15000,
            "fetchedAt": "2026-03-30T12:00:00.000Z",
            "ticks_1m": [
                {"price": 298, "timestamp": "2026-03-30T11:58:00.000Z"},
                {"price": 299, "timestamp": "2026-03-30T11:59:00.000Z"},
                {"price": 300, "timestamp": "2026-03-30T12:00:00.000Z"},
            ],
            "ticks_5m": [
                {"price": 297, "timestamp": "2026-03-30T11:50:00.000Z"},
                {"price": 298, "timestamp": "2026-03-30T11:55:00.000Z"},
                {"price": 300, "timestamp": "2026-03-30T12:00:00.000Z"},
            ],
            "ticks_1h": [
                {"price": 295, "timestamp": "2026-03-30T10:00:00.000Z"},
                {"price": 298, "timestamp": "2026-03-30T11:00:00.000Z"},
                {"price": 300, "timestamp": "2026-03-30T12:00:00.000Z"},
            ],
        },
    }
    with patch("apps.unified.get_coffee_market_data", side_effect=[stale, stale]):
        with patch("apps.unified.now_iso", return_value="2026-03-30T12:40:00.000Z"):
            res = handle_request(
                request_id="r1",
                user_id="u1",
                user_message="Coffee price trends",
                context={},
            )
        assert res["route"] == "MARKET_INSIGHTS"
        assert res["agent_output"].output_text == "Data is stale. Refresh required."
        assert res["tool_result"]["ok"] is False
        assert res["tool_result"]["reason"] == "market_tool_stale"


def test_market_insights_refetches_when_tool_data_is_invalid(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")

    from apps.unified import handle_request

    invalid = {
        "ok": True,
        "data": {
            "symbol": "KC=F",
            "currency": "USX",
            "price": -1,
            "high": 10,
            "low": 5,
            "previousClose": 9,
            "volume": 20000,
            "avgVolume": 15000,
            "fetchedAt": "2026-03-30T12:39:00.000Z",
            "ticks_1m": [
                {"price": 8, "timestamp": "2026-03-30T12:37:00.000Z"},
                {"price": 9, "timestamp": "2026-03-30T12:38:00.000Z"},
                {"price": 10, "timestamp": "2026-03-30T12:39:00.000Z"},
            ],
            "ticks_5m": [
                {"price": 8, "timestamp": "2026-03-30T12:29:00.000Z"},
                {"price": 9, "timestamp": "2026-03-30T12:34:00.000Z"},
                {"price": 10, "timestamp": "2026-03-30T12:39:00.000Z"},
            ],
            "ticks_1h": [
                {"price": 8, "timestamp": "2026-03-30T10:39:00.000Z"},
                {"price": 9, "timestamp": "2026-03-30T11:39:00.000Z"},
                {"price": 10, "timestamp": "2026-03-30T12:39:00.000Z"},
            ],
        },
    }
    valid = {
        "ok": True,
        "data": {
            "symbol": "KC=F",
            "currency": "USX",
            "price": 300,
            "high": 305,
            "low": 295,
            "previousClose": 298,
            "volume": 20000,
            "avgVolume": 15000,
            "fetchedAt": "2026-03-30T12:39:00.000Z",
            "ticks_1m": [
                {"price": 299, "timestamp": "2026-03-30T12:37:00.000Z"},
                {"price": 300, "timestamp": "2026-03-30T12:38:00.000Z"},
                {"price": 300, "timestamp": "2026-03-30T12:39:00.000Z"},
            ],
            "ticks_5m": [
                {"price": 298, "timestamp": "2026-03-30T12:29:00.000Z"},
                {"price": 299, "timestamp": "2026-03-30T12:34:00.000Z"},
                {"price": 300, "timestamp": "2026-03-30T12:39:00.000Z"},
            ],
            "ticks_1h": [
                {"price": 295, "timestamp": "2026-03-30T10:39:00.000Z"},
                {"price": 297, "timestamp": "2026-03-30T11:39:00.000Z"},
                {"price": 300, "timestamp": "2026-03-30T12:39:00.000Z"},
            ],
        },
    }

    with patch("apps.unified.get_coffee_market_data", side_effect=[invalid, valid]) as tool:
        with patch("apps.unified.now_iso", return_value="2026-03-30T12:40:00.000Z"):
            res = handle_request(
                request_id="r1",
                user_id="u1",
                user_message="Coffee price trends",
                context={},
            )
        assert tool.call_count == 2
        assert res["route"] == "MARKET_INSIGHTS"


def test_market_insights_throws_if_tool_data_invalid_after_retries(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")

    from apps.unified import handle_request

    invalid = {
        "ok": True,
        "data": {
            "symbol": "KC=F",
            "currency": "USX",
            "price": -1,
            "high": 10,
            "low": 5,
            "previousClose": 9,
            "volume": 20000,
            "avgVolume": 15000,
            "fetchedAt": "2026-03-30T12:39:00.000Z",
            "ticks_1m": [
                {"price": 8, "timestamp": "2026-03-30T12:37:00.000Z"},
                {"price": 9, "timestamp": "2026-03-30T12:38:00.000Z"},
                {"price": 10, "timestamp": "2026-03-30T12:39:00.000Z"},
            ],
            "ticks_5m": [
                {"price": 8, "timestamp": "2026-03-30T12:29:00.000Z"},
                {"price": 9, "timestamp": "2026-03-30T12:34:00.000Z"},
                {"price": 10, "timestamp": "2026-03-30T12:39:00.000Z"},
            ],
            "ticks_1h": [
                {"price": 8, "timestamp": "2026-03-30T10:39:00.000Z"},
                {"price": 9, "timestamp": "2026-03-30T11:39:00.000Z"},
                {"price": 10, "timestamp": "2026-03-30T12:39:00.000Z"},
            ],
        },
    }
    with patch("apps.unified.get_coffee_market_data", side_effect=[invalid, invalid]):
        with patch("apps.unified.now_iso", return_value="2026-03-30T12:40:00.000Z"):
            res = handle_request(
                request_id="r1",
                user_id="u1",
                user_message="Coffee price trends",
                context={},
            )
        assert res["route"] == "MARKET_INSIGHTS"
        assert res["agent_output"].output_text == "insufficient data"
        assert res["tool_result"]["ok"] is False
        assert res["tool_result"]["reason"] == "market_tool_invalid"
