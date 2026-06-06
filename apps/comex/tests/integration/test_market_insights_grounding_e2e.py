from unittest.mock import patch


def test_market_insights_no_market_data_returns_no_numbers(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    monkeypatch.setenv("CORE_DATA_API_URL", "https://core.local")
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("COMEX_QUERY_CONTEXT_MODE", "heuristic")

    import apps.rag.retrieval as retrieval

    retrieval._CACHE.clear()

    from apps.unified import handle_request

    with patch("apps.rag.retrieval.get_core_data_api_client") as get_client:
        client = get_client.return_value
        client.vector_search.return_value = {"success": True, "data": []}
        res = handle_request(
            request_id="req-1",
            user_id="u1",
            user_message="Coffee market trends this week",
            context={},
        )

    out = res["agent_output"].output_text
    assert out == "No recent market data available for this query"
    assert not any(ch.isdigit() for ch in out)
