import os
from unittest.mock import patch


def test_get_coffee_market_data_core_data_api_success(monkeypatch):
    monkeypatch.setenv("COMEX_MARKET_DATA_SOURCE", "core_data_api")
    monkeypatch.setenv("CORE_DATA_API_URL", "https://example.com")

    class FakeClient:
        def yahoo_coffee_level4(self):
            return {
                "ok": True,
                "data": {
                    "ticks_1m": [{"price": 1, "timestamp": "2026-03-30T00:00:00Z"}] * 3,
                    "ticks_5m": [{"price": 1, "timestamp": "2026-03-30T00:00:00Z"}] * 3,
                    "ticks_1h": [{"price": 1, "timestamp": "2026-03-30T00:00:00Z"}] * 3,
                    "volume": 1,
                    "avgVolume": 1,
                    "previousClose": 1,
                    "high": 1,
                    "low": 1,
                    "price": 1,
                    "currency": "USX",
                    "fetchedAt": "2026-03-30T00:00:00Z",
                    "timestamp": "2026-03-30T00:00:00Z",
                    "symbol": "KC=F",
                    "exchange": "ICE",
                },
            }

    with patch("libs.comex_common.openai.tools.get_core_data_api_client", return_value=FakeClient()):
        from libs.comex_common.openai.tools import get_coffee_market_data

        res = get_coffee_market_data()
        assert res["ok"] is True
        assert res["source"] == "core_data_api"
        assert isinstance(res["data"], dict)


def test_get_coffee_market_data_core_data_api_missing_url(monkeypatch):
    monkeypatch.setenv("COMEX_MARKET_DATA_SOURCE", "core_data_api")
    monkeypatch.delenv("CORE_DATA_API_URL", raising=False)

    from libs.comex_common.openai.tools import get_coffee_market_data

    res = get_coffee_market_data()
    assert res["ok"] is False
    assert res["reason"] == "core_data_api_not_configured"

