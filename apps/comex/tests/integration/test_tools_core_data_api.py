import os
import json
from unittest.mock import patch

import httpx

from libs.comex_common.openai.tools import create_sale


def test_create_sale_uses_core_data_api_when_configured():
    os.environ["CORE_DATA_API_URL"] = "https://core-data.local"

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == httpx.URL("https://core-data.local/sales")
        assert request.headers.get("Idempotency-Key") == "idem-1"
        body = json.loads(request.content.decode('utf-8'))
        assert body["commodity"] == "coffee"
        assert body["currency"] == "USD"
        assert body["volume"] == "2.0 containers"
        return httpx.Response(
            201,
            json={"success": True, "data": {"_id": "sale-123"}},
        )

    transport = httpx.MockTransport(handler)
    real_client = httpx.Client(transport=transport, timeout=5.0)

    with patch("libs.comex_common.core_data_api.client.httpx.Client") as client_cls:
        client_cls.return_value = real_client

        res = create_sale(
            idempotency_key="idem-1",
            payload={
                "commodity": "coffee",
                "incoterm": "FOB",
                "price": 3800.0,
                "currency": "USD",
                "volume": {"value": 2.0, "unit": "containers"},
                "origin": "Santos",
                "destination": "Jordan",
            },
        )

    assert res["ok"] is True
    assert res["sale_id"] == "sale-123"
