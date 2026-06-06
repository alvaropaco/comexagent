from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx


@dataclass(frozen=True)
class CoreDataApiClient:
    base_url: str
    timeout_s: float = 15.0

    def _client(self) -> httpx.Client:
        return httpx.Client(timeout=self.timeout_s)

    def create_sale(self, *, idempotency_key: str, body: Dict[str, Any]) -> Dict[str, Any]:
        with self._client() as c:
            r = c.post(
                f"{self.base_url}/sales",
                json=body,
                headers={"Idempotency-Key": idempotency_key},
            )
            r.raise_for_status()
            return r.json()

    def create_buy_order(self, *, idempotency_key: str, body: Dict[str, Any]) -> Dict[str, Any]:
        with self._client() as c:
            r = c.post(
                f"{self.base_url}/buy-orders",
                json=body,
                headers={"Idempotency-Key": idempotency_key},
            )
            r.raise_for_status()
            return r.json()

    def vector_search(
        self,
        *,
        query: str,
        k: int = 5,
        filter: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        with self._client() as c:
            r = c.post(
                f"{self.base_url}/vector/search",
                json={"query": query, "k": k, "filter": filter},
            )
            r.raise_for_status()
            return r.json()

    def external_ingest(
        self, *, query: str, token: Optional[str] = None, force: bool = False
    ) -> Dict[str, Any]:
        headers: Dict[str, str] = {}
        if token:
            headers["x-external-tool-token"] = token
        with self._client() as c:
            r = c.post(
                f"{self.base_url}/external/ingest",
                json={"query": query, "force": force},
                headers=headers,
            )
            r.raise_for_status()
            return r.json()

    def yahoo_quote(self, *, symbol: str, token: Optional[str] = None) -> Dict[str, Any]:
        headers: Dict[str, str] = {}
        if token:
            headers["x-external-tool-token"] = token
        with self._client() as c:
            r = c.get(
                f"{self.base_url}/market/yahoo/quote",
                params={"symbol": symbol},
                headers=headers,
            )
            r.raise_for_status()
            return r.json()

    def yahoo_coffee_level4(self) -> Dict[str, Any]:
        with self._client() as c:
            r = c.get(f"{self.base_url}/market/yahoo/chart/coffee/level4")
            r.raise_for_status()
            return r.json()

    def yahoo_commodity_movers(self) -> Dict[str, Any]:
        with self._client() as c:
            r = c.get(f"{self.base_url}/market/yahoo/movers/commodities")
            r.raise_for_status()
            return r.json()

    def market_ticker_tape(
        self,
        *,
        timeframe: str = "1m",
        limit: int = 50,
    ) -> Dict[str, Any]:
        with self._client() as c:
            r = c.get(
                f"{self.base_url}/market/ticks/ticker-tape",
                params={"timeframe": timeframe, "limit": limit},
            )
            r.raise_for_status()
            return r.json()

    def market_chart(
        self,
        *,
        symbol: str,
        timeframe: str = "1m",
        limit: int = 500,
    ) -> Dict[str, Any]:
        with self._client() as c:
            r = c.get(
                f"{self.base_url}/market/ticks/chart",
                params={"symbol": symbol, "timeframe": timeframe, "limit": limit},
            )
            r.raise_for_status()
            return r.json()

    def market_indexes(
        self,
        *,
        symbol: str,
        timeframe: str = "1m",
        limit: int = 100,
    ) -> Dict[str, Any]:
        with self._client() as c:
            r = c.get(
                f"{self.base_url}/market/indexes",
                params={"symbol": symbol, "timeframe": timeframe, "limit": limit},
            )
            r.raise_for_status()
            return r.json()

    def ingest_market_ticks(
        self,
        *,
        symbol: str,
        timeframes: Optional[list[str]] = None,
        commodity: Optional[str] = None,
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        headers: Dict[str, str] = {}
        if token:
            headers["x-market-sync-token"] = token
        payload: Dict[str, Any] = {"symbol": symbol}
        if timeframes is not None:
            payload["timeframes"] = timeframes
        if commodity is not None:
            payload["commodity"] = commodity
        with self._client() as c:
            r = c.post(
                f"{self.base_url}/market/ticks/ingest",
                json=payload,
                headers=headers,
            )
            r.raise_for_status()
            return r.json()

    def compute_market_indexes(
        self,
        *,
        symbol: str,
        timeframes: Optional[list[str]] = None,
        lookback: Optional[int] = None,
        token: Optional[str] = None,
    ) -> Dict[str, Any]:
        headers: Dict[str, str] = {}
        if token:
            headers["x-market-sync-token"] = token
        payload: Dict[str, Any] = {"symbol": symbol}
        if timeframes is not None:
            payload["timeframes"] = timeframes
        if lookback is not None:
            payload["lookback"] = lookback
        with self._client() as c:
            r = c.post(
                f"{self.base_url}/market/indexes/compute",
                json=payload,
                headers=headers,
            )
            r.raise_for_status()
            return r.json()


def get_core_data_api_client() -> Optional[CoreDataApiClient]:
    url = os.getenv("CORE_DATA_API_URL")
    if not url:
        return None
    url = url.rstrip("/")
    return CoreDataApiClient(base_url=url)
