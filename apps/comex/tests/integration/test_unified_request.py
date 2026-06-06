import os

from apps.unified import handle_request
from libs.comex_common.storage.in_memory import get_db


def test_unified_request_routes_and_executes_seller(monkeypatch):
    get_db().reset()
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    monkeypatch.setenv("COMEX_SELLER_MODE", "heuristic")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("CORE_DATA_API_URL", raising=False)

    res = handle_request(
        request_id="req-1",
        user_id="user-1",
        user_message="Sell 2 containers of coffee FOB Santos at $3800 to Jordan",
    )

    assert res["agent_output"].intent == "seller"
    assert res["tool_result"]["ok"] is True
    assert len(get_db().sales) == 1


def test_unified_request_routes_and_executes_buyer(monkeypatch):
    get_db().reset()
    monkeypatch.setenv("COMEX_ROUTER_MODE", "heuristic")
    monkeypatch.setenv("COMEX_BUYER_MODE", "heuristic")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("CORE_DATA_API_URL", raising=False)

    res = handle_request(
        request_id="req-2",
        user_id="user-1",
        user_message="Looking to buy coffee, target price $3900, 2 containers to Jordan",
    )

    assert res["agent_output"].intent == "buyer"
    assert res["tool_result"]["ok"] is True
    assert len(get_db().buy_orders) == 1
