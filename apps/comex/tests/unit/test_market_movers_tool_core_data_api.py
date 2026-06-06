from unittest.mock import patch


def test_get_market_movers_core_data_api_success(monkeypatch):
    monkeypatch.setenv("COMEX_MARKET_DATA_SOURCE", "core_data_api")
    monkeypatch.setenv("CORE_DATA_API_URL", "https://example.com")

    class FakeClient:
        def yahoo_commodity_movers(self):
            return {
                "success": True,
                "data": {
                    "ok": True,
                    "data": {
                        "fetchedAt": "2026-03-30T00:00:00Z",
                        "movers": [{"symbol": "KC=F", "changePercent": 1.0, "currency": "USX"}],
                    },
                },
            }

    with patch("libs.comex_common.openai.tools.get_core_data_api_client", return_value=FakeClient()):
        from libs.comex_common.openai.tools import get_market_movers

        res = get_market_movers()
        assert res["ok"] is True
        assert res["source"] == "core_data_api"
        assert "movers" in res["data"]

