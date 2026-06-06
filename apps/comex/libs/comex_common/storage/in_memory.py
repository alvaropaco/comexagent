from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class InMemoryDB:
    sales: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    buy_orders: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    idempotency: Dict[str, str] = field(default_factory=dict)

    def reset(self) -> None:
        self.sales.clear()
        self.buy_orders.clear()
        self.idempotency.clear()

    def create_sale(self, *, idempotency_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        existing_id = self.idempotency.get(idempotency_key)
        if existing_id is not None:
            return {
                "ok": True,
                "sale_id": existing_id,
                "idempotent": True,
                "created": self.sales.get(existing_id),
            }

        sale_id = str(uuid.uuid4())
        self.sales[sale_id] = {"_id": sale_id, **payload}
        self.idempotency[idempotency_key] = sale_id
        return {"ok": True, "sale_id": sale_id, "idempotent": False, "created": self.sales[sale_id]}

    def create_buy_order(self, *, idempotency_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        existing_id = self.idempotency.get(idempotency_key)
        if existing_id is not None:
            return {
                "ok": True,
                "buy_order_id": existing_id,
                "idempotent": True,
                "created": self.buy_orders.get(existing_id),
            }

        buy_order_id = str(uuid.uuid4())
        self.buy_orders[buy_order_id] = {"_id": buy_order_id, **payload}
        self.idempotency[idempotency_key] = buy_order_id
        return {
            "ok": True,
            "buy_order_id": buy_order_id,
            "idempotent": False,
            "created": self.buy_orders[buy_order_id],
        }


_DB: Optional[InMemoryDB] = None


def get_db() -> InMemoryDB:
    global _DB
    if _DB is None:
        _DB = InMemoryDB()
    return _DB
