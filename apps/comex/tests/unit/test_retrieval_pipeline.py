from unittest.mock import patch


def test_rerank_prefers_recent_and_filter_match(monkeypatch):
    monkeypatch.setenv("CORE_DATA_API_URL", "https://core.local")
    monkeypatch.setenv("COMEX_QUERY_CONTEXT_MODE", "heuristic")

    import apps.rag.retrieval as retrieval

    retrieval._CACHE.clear()

    from apps.rag.retrieval import retrieve_context

    docs = [
        {
            "_id": "a",
            "text": "coffee matched",
            "score": 0.9,
            "metadata": {"commodity": "coffee", "date": "2026-03-25T00:00:00Z"},
        },
        {
            "_id": "b",
            "text": "pepper old",
            "score": 0.95,
            "metadata": {"commodity": "pepper", "date": "2020-01-01T00:00:00Z"},
        },
    ]

    with patch("apps.rag.retrieval.get_core_data_api_client") as get_client:
        client = get_client.return_value
        client.vector_search.return_value = {"success": True, "data": docs}
        res = retrieve_context(query="coffee market outlook", base_filter=None, k=10)

    assert res.docs[0]["_id"] == "a"
    assert 0.0 <= res.confidence <= 1.0


def test_confidence_scoring_uses_similarity_count_and_filter_match(monkeypatch):
    monkeypatch.setenv("CORE_DATA_API_URL", "https://core.local")
    monkeypatch.setenv("COMEX_QUERY_CONTEXT_MODE", "heuristic")

    import apps.rag.retrieval as retrieval

    retrieval._CACHE.clear()

    from apps.rag.retrieval import retrieve_context

    docs = [
        {
            "_id": "a",
            "text": "coffee matched",
            "score": 0.9,
            "metadata": {"commodity": "coffee", "date": "2026-03-25T00:00:00Z"},
        },
        {
            "_id": "b",
            "text": "pepper mismatch",
            "score": 0.7,
            "metadata": {"commodity": "pepper", "date": "2026-03-25T00:00:00Z"},
        },
    ]

    with patch("apps.rag.retrieval.get_core_data_api_client") as get_client:
        client = get_client.return_value
        client.vector_search.return_value = {"success": True, "data": docs}
        res = retrieve_context(query="coffee price", base_filter=None, k=10)

    assert abs(res.top_similarity - 0.9) < 1e-6
    assert res.result_count == 2
    assert 0.0 <= res.filter_match_ratio <= 1.0
    assert res.confidence > 0.0


def test_cache_near_duplicate_queries_hit(monkeypatch):
    monkeypatch.setenv("CORE_DATA_API_URL", "https://core.local")
    monkeypatch.setenv("COMEX_QUERY_CONTEXT_MODE", "heuristic")

    import apps.rag.retrieval as retrieval

    retrieval._CACHE.clear()

    from apps.rag.retrieval import retrieve_context

    docs = [
        {
            "_id": "a",
            "text": "coffee matched",
            "score": 0.9,
            "metadata": {"commodity": "coffee", "date": "2026-03-25T00:00:00Z"},
        }
    ]

    with patch("apps.rag.retrieval.get_core_data_api_client") as get_client:
        client = get_client.return_value
        client.vector_search.return_value = {"success": True, "data": docs}

        res1 = retrieve_context(query="Coffee market trends this week", base_filter=None, k=10)
        res2 = retrieve_context(query="coffee trends this week", base_filter=None, k=10)

    assert res1.docs[0]["_id"] == "a"
    assert res2.used_cache is True


def test_historical_query_triggers_external_ingest_when_low_confidence(monkeypatch):
    monkeypatch.setenv("CORE_DATA_API_URL", "https://core.local")
    monkeypatch.setenv("COMEX_QUERY_CONTEXT_MODE", "heuristic")
    monkeypatch.setenv("COMEX_EXTERNAL_MIN_CONFIDENCE", "0.99")

    import apps.rag.retrieval as retrieval

    retrieval._CACHE.clear()

    from apps.rag.retrieval import retrieve_context

    class FakeCore:
        base_url = "https://core.local"

        def vector_search(self, query, k, filter=None):
            return {"success": True, "data": []}

    fake = FakeCore()

    called = {}

    def fake_trigger(*, base_url, token, query, force, timeout_s):
        called["base_url"] = base_url
        called["query"] = query
        called["force"] = force

    with patch("apps.rag.retrieval.get_core_data_api_client", return_value=fake):
        with patch("apps.rag.retrieval._trigger_external_ingest_fast", side_effect=fake_trigger):
            res = retrieve_context(query="Historical coffee exports Brazil in 2022", base_filter=None, k=10)

    assert res.docs == []
    assert called.get("force") is True
