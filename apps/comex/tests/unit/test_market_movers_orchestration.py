from unittest.mock import patch


def test_market_movers_calls_tool_and_returns_output(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    monkeypatch.setenv("OPENAI_API_KEY", "")

    from apps.unified import handle_request

    tool_res = {
        "ok": True,
        "data": {
            "fetchedAt": "2026-03-30T12:39:00.000Z",
            "movers": [
                {"symbol": "KC=F", "changePercent": 1.0, "currency": "USX"},
                {"symbol": "CL=F", "changePercent": -0.8, "currency": "USD"},
            ],
        },
    }

    with patch("apps.unified.get_market_movers", return_value=tool_res) as tool:
        with patch("apps.unified.now_iso", return_value="2026-03-30T12:40:00.000Z"):
            res = handle_request(
                request_id="r1",
                user_id="u1",
                user_message="biggest changes of today commodities",
                context={},
            )
    assert tool.called is True
    assert res["route"] == "MARKET_MOVERS"
    assert "Top movers" in res["agent_output"].output_text


def test_market_movers_no_fallback_when_tool_fails(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    monkeypatch.setenv("OPENAI_API_KEY", "")

    from apps.unified import handle_request

    with patch("apps.unified.get_market_movers", return_value={"ok": False, "reason": "http_error"}):
        with patch("apps.unified.now_iso", return_value="2026-03-30T12:40:00.000Z"):
            res = handle_request(
                request_id="r1",
                user_id="u1",
                user_message="top movers today",
                context={},
            )
    assert res["route"] == "MARKET_MOVERS"
    assert res["agent_output"].output_text == "insufficient data"
    assert res["tool_result"]["ok"] is False

