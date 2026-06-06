from unittest.mock import patch


def test_yahoo_chart_parses_and_normalizes():
    from libs.comex_common.market_data.yahoo_chart import fetch_kc_f_market_data

    def payload_for(interval: str):
        base = {
            "chart": {
                "result": [
                    {
                        "meta": {
                            "symbol": "KC=F",
                            "currency": "USX",
                            "regularMarketPrice": 294.3,
                            "regularMarketDayHigh": 301.0,
                            "regularMarketDayLow": 291.65,
                            "previousClose": 301.7,
                            "regularMarketTime": 1774891795,
                            "regularMarketVolume": 15119,
                            "averageDailyVolume3Month": 12000,
                            "fullExchangeName": "ICE Futures",
                        },
                        "timestamp": [1774891600, 1774891660, 1774891720],
                        "indicators": {"quote": [{"close": [293.1, 294.0, 294.3]}]},
                    }
                ]
            }
        }
        if interval == "5m":
            base["chart"]["result"][0]["timestamp"] = [1774891200, 1774891500, 1774891800]
            base["chart"]["result"][0]["indicators"]["quote"][0]["close"] = [292.5, 293.0, 294.0]
        if interval == "1h":
            base["chart"]["result"][0]["timestamp"] = [1774884000, 1774887600, 1774891200]
            base["chart"]["result"][0]["indicators"]["quote"][0]["close"] = [290.0, 292.0, 294.0]
        return base

    class FakeResp:
        def __init__(self, payload):
            self.status_code = 200
            self._payload = payload

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, params=None):
            interval = (params or {}).get("interval", "1m")
            return FakeResp(payload_for(interval))

    with patch("libs.comex_common.market_data.yahoo_chart.httpx.Client", FakeClient):
        res = fetch_kc_f_market_data()
        assert res["ok"] is True
        data = res["data"]
        assert data["price"] == 294.3
        assert data["high"] == 301.0
        assert data["low"] == 291.65
        assert data["previousClose"] == 301.7
        assert data["currency"] == "USX"
        assert data["symbol"] == "KC=F"
        assert data["volume"] == 15119
        assert data["avgVolume"] == 12000
        assert isinstance(data["fetchedAt"], str) and data["fetchedAt"].endswith("Z")
        assert isinstance(data["timestamp"], str) and data["timestamp"].endswith("Z")
        assert isinstance(data["ticks_1m"], list) and len(data["ticks_1m"]) == 3
        assert isinstance(data["ticks_5m"], list) and len(data["ticks_5m"]) == 3
        assert isinstance(data["ticks_1h"], list) and len(data["ticks_1h"]) == 3
        assert all(isinstance(t.get("price"), (int, float)) for t in data["ticks_1m"])
        assert all(isinstance(t.get("timestamp"), str) and t.get("timestamp").endswith("Z") for t in data["ticks_1m"])


def test_yahoo_chart_rejects_invalid_values():
    from libs.comex_common.market_data.yahoo_chart import fetch_kc_f_market_data

    payload = {
        "chart": {
            "result": [
                {
                    "meta": {
                        "symbol": "KC=F",
                        "currency": "USX",
                        "regularMarketPrice": -1,
                        "regularMarketDayHigh": 10,
                        "regularMarketDayLow": 5,
                        "previousClose": 9,
                        "regularMarketTime": 1774891795,
                        "regularMarketVolume": 1,
                        "averageDailyVolume3Month": 1,
                    },
                    "timestamp": [1, 2, 3],
                    "indicators": {"quote": [{"close": [1, 1, 1]}]},
                }
            ]
        }
    }

    class FakeResp:
        status_code = 200

        def json(self):
            return payload

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, params=None):
            return FakeResp()

    with patch("libs.comex_common.market_data.yahoo_chart.httpx.Client", FakeClient):
        res = fetch_kc_f_market_data()
        assert res["ok"] is False
        assert res["reason"] == "invalid_values"


def test_yahoo_chart_http_error():
    from libs.comex_common.market_data.yahoo_chart import fetch_kc_f_market_data

    class FakeResp:
        status_code = 503

        def json(self):
            return {}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, params=None):
            return FakeResp()

    with patch("libs.comex_common.market_data.yahoo_chart.httpx.Client", FakeClient):
        res = fetch_kc_f_market_data()
        assert res["ok"] is False
        assert res["reason"] == "http_error"
