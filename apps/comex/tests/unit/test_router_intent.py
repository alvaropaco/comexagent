import os

from apps.router import route_intent


def test_routes_seller_by_keywords(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    res = route_intent("Sell 2 containers of coffee FOB Santos at $3800 to Jordan")
    assert res.intent == "CREATE_SALE"


def test_routes_buyer_by_keywords(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    res = route_intent("Looking to buy coffee, target price $3900, 2 containers to Jordan")
    assert res.intent == "CREATE_BUY"


def test_routes_market_insights(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    res = route_intent("Why did coffee prices increase today?")
    assert res.intent == "MARKET_INSIGHTS"


def test_routes_market_insights_for_coffee_today(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    res = route_intent("coffee today")
    assert res.intent == "MARKET_INSIGHTS"


def test_routes_market_insights_for_market_keyword(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    res = route_intent("market trend coffee")
    assert res.intent == "MARKET_INSIGHTS"


def test_routes_market_movers_for_biggest_changes(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    res = route_intent("Give me the commodities stock market biggest changes of today")
    assert res.intent == "MARKET_MOVERS"


def test_routes_comex_qa(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    res = route_intent("What does FOB mean?")
    assert res.intent == "COMEX_QA"


def test_routes_quote_request_as_comex_qa(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    res = route_intent("Draft coffee quote FOB Santos for 2 containers at $3800 to Jordan")
    assert res.intent == "COMEX_QA"


def test_routes_market_quotation_help_as_comex_qa(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    res = route_intent("Help me create a market quotation for coffee")
    assert res.intent == "COMEX_QA"


def test_routes_historical_trade_question_as_market_insights(monkeypatch):
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    res = route_intent("Historical coffee exports Brazil in 2022")
    assert res.intent == "MARKET_INSIGHTS"
