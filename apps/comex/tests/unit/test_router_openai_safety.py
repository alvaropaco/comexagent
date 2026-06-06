from unittest.mock import patch


def test_openai_reject_is_overridden_by_heuristic(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "auto")
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    from apps.router import route_intent

    class FakeResponse:
        output_text = '{"intent":"REJECT","confidence":0.99,"reasoning":"wrong","next_action":"respond_directly"}'

    with patch("apps.router.OpenAI") as openai_cls:
        inst = openai_cls.return_value
        inst.responses.create.return_value = FakeResponse()
        res = route_intent("Draft coffee quote FOB Santos for 2 containers at $3800 to Jordan")

    assert res.intent == "COMEX_QA"


def test_openai_comex_qa_is_overridden_by_market_insights(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "auto")
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    from apps.router import route_intent

    class FakeResponse:
        output_text = '{"intent":"COMEX_QA","confidence":0.9,"reasoning":"ambiguous","next_action":"respond_directly"}'

    with patch("apps.router.OpenAI") as openai_cls:
        inst = openai_cls.return_value
        inst.responses.create.return_value = FakeResponse()
        res = route_intent("Historical coffee exports Brazil in 2022")

    assert res.intent == "MARKET_INSIGHTS"
