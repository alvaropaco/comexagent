from apps.rag.query_context import parse_query_context


def test_query_context_fallback_detects_coffee(monkeypatch):
    monkeypatch.setenv("COMEX_QUERY_CONTEXT_MODE", "heuristic")
    ctx = parse_query_context("Coffee market trends this week")
    assert ctx.commodity == "coffee"
    assert ctx.timeframe == "recent"


def test_query_context_fallback_detects_pepper(monkeypatch):
    monkeypatch.setenv("COMEX_QUERY_CONTEXT_MODE", "heuristic")
    ctx = parse_query_context("Pepper prices outlook")
    assert ctx.commodity == "pepper"

