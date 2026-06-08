from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from starlette.requests import Request
from starlette.responses import JSONResponse

import os
from datetime import datetime, timezone

import stripe
from google.cloud import firestore
from google.auth.transport import requests as google_auth_requests
from google.oauth2 import id_token as google_id_token

from apps.agents.seller import SellerAgent
from apps.agents.buyer import BuyerAgent, heuristic_buyer_parse
from apps.agents.seller_heuristic import heuristic_seller_parse
from apps.orchestrator import execute_action
from apps.prompting import now_iso
from apps.unified import handle_request
from libs.comex_common.agents.schemas import (
    AgentInput,
    AgentOutput,
    Conversation,
    CreateSaleAction,
)
from libs.comex_common.openai.tools import create_sale
from libs.comex_common.storage.in_memory import get_db
from libs.comex_common.guardrails.topic import check_comex_scope


app = FastAPI(title="COMEX Local API", version="0.1")

load_dotenv()


def _firestore_client() -> firestore.Client:
    project_id = (
        os.getenv("FIREBASE_PROJECT_ID")
        or os.getenv("FIRESTORE_PROJECT_ID")
        or os.getenv("GOOGLE_CLOUD_PROJECT")
    )
    database_id = os.getenv("FIRESTORE_DATABASE_ID") or os.getenv("FIREBASE_DATABASE_ID")
    if database_id:
        return firestore.Client(project=project_id, database=database_id) if project_id else firestore.Client(database=database_id)
    return firestore.Client(project=project_id) if project_id else firestore.Client()


def _stripe_enabled() -> bool:
    return bool(os.getenv("STRIPE_SECRET_KEY"))


def _stripe_init() -> None:
    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")


def _public_base_url(request: Request) -> str:
    env_base = os.getenv("PUBLIC_BASE_URL")
    if env_base:
        return env_base.rstrip("/")

    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")

    forwarded_proto = request.headers.get("x-forwarded-proto")
    forwarded_host = request.headers.get("x-forwarded-host")
    if forwarded_host:
        proto = forwarded_proto or "https"
        return f"{proto}://{forwarded_host}".rstrip("/")

    return "https://www.comexagent.com"


def _firebase_project_id() -> Optional[str]:
    return os.getenv("FIREBASE_PROJECT_ID") or os.getenv("FIRESTORE_PROJECT_ID")


def _verify_firebase_auth(request: Request, expected_uid: Optional[str] = None) -> Dict[str, Any]:
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.startswith("Bearer "):
        raise ValueError("Missing bearer token")

    token = auth_header.split(" ", 1)[1].strip()
    project_id = _firebase_project_id()
    req = google_auth_requests.Request()
    claims = google_id_token.verify_firebase_token(token, req, audience=project_id)

    uid = claims.get("sub")
    if expected_uid and uid != expected_uid:
        raise ValueError("Token uid mismatch")

    return claims


def _out_of_scope_response() -> AgentOutput:
    return AgentOutput(
        intent="info",
        output_text="Out of scope. Ask only COMEX trading questions (sale offers, buy orders, pricing, matching, logistics).",
        action={
            "type": "NONE",
            "payload": {},
            "confidence": 1.0,
            "validation_errors": ["out_of_scope"],
        },
    )


class SellerCreateRequest(BaseModel):
    request_id: str
    user_id: str
    user_message: str
    idempotency_key: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)


class OrchestrateRequest(BaseModel):
    agent_output: AgentOutput
    idempotency_key: str


 


@app.get("/")
def root() -> Dict[str, Any]:
    return {"ok": True, "service": "comex-api", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True}


class CreateCheckoutSessionRequest(BaseModel):
    priceId: str
    firebaseUID: str
    email: Optional[str] = None


@app.post("/api/create-checkout-session")
async def create_checkout_session(req: CreateCheckoutSessionRequest, request: Request) -> JSONResponse:
    if not _stripe_enabled():
        return JSONResponse(status_code=500, content={"error": "Stripe is not configured"})

    try:
        _verify_firebase_auth(request, expected_uid=req.firebaseUID)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    if req.priceId.startswith("prod_"):
        return JSONResponse(
            status_code=400,
            content={
                "error": (
                    f"Invalid Price ID: '{req.priceId}'. It looks like you provided a Product ID "
                    "(starting with 'prod_') instead of a Price ID (starting with 'price_')."
                )
            },
        )

    _stripe_init()
    base_url = _public_base_url(request)

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            customer_email=req.email,
            line_items=[{"price": req.priceId, "quantity": 1}],
            metadata={"firebaseUID": req.firebaseUID},
            success_url=f"{base_url}/copilot?payment=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{base_url}/copilot?payment=cancel",
        )
        return JSONResponse(status_code=200, content={"url": session.url})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


class SyncSubscriptionRequest(BaseModel):
    firebaseUID: str
    sessionId: str


@app.post("/api/subscription/sync")
async def sync_subscription(req: SyncSubscriptionRequest, request: Request) -> JSONResponse:
    if not _stripe_enabled():
        return JSONResponse(status_code=500, content={"error": "Stripe is not configured"})

    try:
        _verify_firebase_auth(request, expected_uid=req.firebaseUID)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    _stripe_init()
    db = _firestore_client()

    try:
        session = stripe.checkout.Session.retrieve(req.sessionId)
        session_dict = _coerce_event_to_dict(session)
        subscription_id = session_dict.get("subscription")
        customer_id = session_dict.get("customer")
        if not subscription_id:
            return JSONResponse(status_code=400, content={"error": "Missing subscription on session"})

        subscription = stripe.Subscription.retrieve(subscription_id)
        sub_dict = _coerce_event_to_dict(subscription)

        items = ((sub_dict.get("items") or {}).get("data") or [])
        price = ((items[0] or {}).get("price") or {}) if items else {}
        stripe_status = sub_dict.get("status")
        is_premium = stripe_status in {"active", "trialing", "incomplete"}
        status = "premium" if is_premium else "free"
        plan = _plan_from_price(price)

        db.collection("users").document(req.firebaseUID).set(
            {
                "subscription": {
                    "status": status,
                    "stripeStatus": stripe_status,
                    "stripeCustomerId": customer_id,
                    "stripeSubscriptionId": subscription_id,
                    "plan": plan,
                    "currentPeriodEnd": _dt_from_epoch(sub_dict.get("current_period_end")),
                    "cancelAtPeriodEnd": sub_dict.get("cancel_at_period_end"),
                    "lastUpdated": firestore.SERVER_TIMESTAMP,
                }
            },
            merge=True,
        )

        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "subscription": {
                    "status": status,
                    "stripeStatus": stripe_status,
                    "stripeSubscriptionId": subscription_id,
                    "stripeCustomerId": customer_id,
                    "plan": plan,
                },
            },
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "Internal Server Error", "details": str(e)})


@app.post("/api/subscription/sync-from-token")
async def sync_subscription_from_token(request: Request) -> JSONResponse:
    if not _stripe_enabled():
        return JSONResponse(status_code=500, content={"error": "Stripe is not configured"})

    try:
        claims = _verify_firebase_auth(request)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    firebase_uid = claims.get("sub")
    email = claims.get("email")
    if not firebase_uid or not email:
        return JSONResponse(status_code=400, content={"error": "Missing uid or email in token"})

    _stripe_init()
    db = _firestore_client()

    try:
        customers = stripe.Customer.list(email=email, limit=10)
        customers_dict = _coerce_event_to_dict(customers)
        candidates = customers_dict.get("data") or []
        if not candidates:
            return JSONResponse(status_code=404, content={"error": "No Stripe customer found for this email"})

        best = None
        for cust in candidates:
            subs = stripe.Subscription.list(customer=cust.get("id"), status="all", limit=10)
            subs_dict = _coerce_event_to_dict(subs)
            for sub in (subs_dict.get("data") or []):
                status = sub.get("status")
                if status not in {"active", "trialing", "incomplete"}:
                    continue
                if not best or int(sub.get("created", 0)) > int(best.get("created", 0)):
                    best = {"sub": sub, "customer": cust}

        if not best:
            return JSONResponse(status_code=404, content={"error": "No active subscription found for this email"})

        sub = best["sub"]
        cust = best["customer"]

        items = ((sub.get("items") or {}).get("data") or [])
        price = ((items[0] or {}).get("price") or {}) if items else {}
        stripe_status = sub.get("status")
        plan = _plan_from_price(price)

        db.collection("users").document(firebase_uid).set(
            {
                "subscription": {
                    "status": "premium",
                    "stripeStatus": stripe_status,
                    "stripeCustomerId": cust.get("id"),
                    "stripeSubscriptionId": sub.get("id"),
                    "plan": plan,
                    "currentPeriodEnd": _dt_from_epoch(sub.get("current_period_end")),
                    "cancelAtPeriodEnd": sub.get("cancel_at_period_end"),
                    "lastUpdated": firestore.SERVER_TIMESTAMP,
                }
            },
            merge=True,
        )

        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "subscription": {
                    "status": "premium",
                    "stripeStatus": stripe_status,
                    "stripeSubscriptionId": sub.get("id"),
                    "stripeCustomerId": cust.get("id"),
                    "plan": plan,
                },
            },
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "Internal Server Error", "details": str(e)})


class CreatePortalSessionRequest(BaseModel):
    firebaseUID: str


@app.post("/api/create-portal-session")
async def create_portal_session(req: CreatePortalSessionRequest, request: Request) -> JSONResponse:
    if not _stripe_enabled():
        return JSONResponse(status_code=500, content={"error": "Stripe is not configured"})

    try:
        _verify_firebase_auth(request, expected_uid=req.firebaseUID)
    except Exception:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    _stripe_init()
    base_url = _public_base_url(request)

    db = _firestore_client()
    user_snap = db.collection("users").document(req.firebaseUID).get()
    if not user_snap.exists:
        return JSONResponse(status_code=404, content={"error": "User not found"})

    user_data = user_snap.to_dict() or {}
    subscription = (user_data.get("subscription") or {})
    customer_id = subscription.get("stripeCustomerId")
    if not customer_id:
        return JSONResponse(status_code=400, content={"error": "No Stripe customer found for this user"})

    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{base_url}/copilot",
        )
        return JSONResponse(status_code=200, content={"url": session.url})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


def _coerce_event_to_dict(evt: Any) -> Dict[str, Any]:
    if hasattr(evt, "to_dict"):
        return evt.to_dict()
    if isinstance(evt, dict):
        return evt
    return dict(evt)


def _plan_from_price(price: Dict[str, Any]) -> str:
    recurring = (price.get("recurring") or {}) if isinstance(price, dict) else {}
    interval = recurring.get("interval")
    if interval == "year":
        return "yearly"
    return "monthly"


def _dt_from_epoch(seconds: Any) -> Optional[datetime]:
    try:
        return datetime.fromtimestamp(int(seconds), tz=timezone.utc)
    except Exception:
        return None


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request) -> JSONResponse:
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    sig_header = request.headers.get("stripe-signature")
    if not webhook_secret or not sig_header:
        return JSONResponse(status_code=400, content={"error": "Missing stripe signature or webhook secret"})

    if not _stripe_enabled():
        return JSONResponse(status_code=500, content={"error": "Stripe is not configured"})

    _stripe_init()
    payload_bytes = await request.body()
    payload = payload_bytes.decode("utf-8")

    try:
        event = stripe.Webhook.construct_event(payload=payload, sig_header=sig_header, secret=webhook_secret)
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"Webhook Error: {str(e)}"})

    event_dict = _coerce_event_to_dict(event)
    event_type = event_dict.get("type")
    obj = ((event_dict.get("data") or {}).get("object") or {})

    db = _firestore_client()

    try:
        if event_type == "checkout.session.completed":
            firebase_uid = (obj.get("metadata") or {}).get("firebaseUID")
            subscription_id = obj.get("subscription")
            customer_id = obj.get("customer")

            if firebase_uid and subscription_id:
                subscription = stripe.Subscription.retrieve(subscription_id)
                sub_dict = _coerce_event_to_dict(subscription)
                items = ((sub_dict.get("items") or {}).get("data") or [])
                price = ((items[0] or {}).get("price") or {}) if items else {}

                stripe_status = sub_dict.get("status")
                is_premium = stripe_status in {"active", "trialing", "incomplete"}
                status = "premium" if is_premium else "free"
                plan = _plan_from_price(price)

                update_payload = {
                    "subscription": {
                        "status": status,
                        "stripeStatus": stripe_status,
                        "stripeCustomerId": customer_id,
                        "stripeSubscriptionId": subscription_id,
                        "plan": plan,
                        "currentPeriodEnd": _dt_from_epoch(sub_dict.get("current_period_end")),
                        "cancelAtPeriodEnd": sub_dict.get("cancel_at_period_end"),
                        "lastUpdated": firestore.SERVER_TIMESTAMP,
                    }
                }
                db.collection("users").document(firebase_uid).set(update_payload, merge=True)

        elif event_type == "invoice.paid":
            subscription_id = obj.get("subscription")
            if subscription_id:
                subscription = stripe.Subscription.retrieve(subscription_id)
                sub_dict = _coerce_event_to_dict(subscription)
                stripe_status = sub_dict.get("status")

                matches = (
                    db.collection("users")
                    .where("subscription.stripeSubscriptionId", "==", subscription_id)
                    .limit(1)
                    .stream()
                )
                for user_doc in matches:
                    user_doc.reference.set(
                        {
                            "subscription": {
                                "status": "premium",
                                "stripeStatus": stripe_status,
                                "currentPeriodEnd": _dt_from_epoch(sub_dict.get("current_period_end")),
                                "lastUpdated": firestore.SERVER_TIMESTAMP,
                            }
                        },
                        merge=True,
                    )
                    break

        elif event_type in {"customer.subscription.updated", "customer.subscription.deleted"}:
            subscription_id = obj.get("id")
            stripe_status = obj.get("status")
            is_premium = stripe_status in {"active", "trialing"}
            status = "premium" if is_premium else "free"

            if subscription_id:
                matches = (
                    db.collection("users")
                    .where("subscription.stripeSubscriptionId", "==", subscription_id)
                    .limit(1)
                    .stream()
                )
                for user_doc in matches:
                    user_doc.reference.set(
                        {
                            "subscription": {
                                "status": status,
                                "stripeStatus": stripe_status,
                                "currentPeriodEnd": _dt_from_epoch(obj.get("current_period_end")),
                                "cancelAtPeriodEnd": obj.get("cancel_at_period_end"),
                                "lastUpdated": firestore.SERVER_TIMESTAMP,
                            }
                        },
                        merge=True,
                    )
                    break

        return JSONResponse(status_code=200, content={"received": True})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "Internal Server Error", "details": str(e)})


@app.post("/v1/agents/seller")
def seller_agent(agent_input: AgentInput) -> AgentOutput:
    guard = check_comex_scope(agent_input.user_message)
    if not guard.allowed:
        return _out_of_scope_response()

    agent_input.context["NOW_ISO"] = now_iso()

    mode = os.getenv("COMEX_SELLER_MODE", "auto").lower()
    if mode == "heuristic":
        agent = SellerAgent(llm_parse=heuristic_seller_parse)
        return agent.run(agent_input)

    if mode == "openai":
        return SellerAgent().run(agent_input)

    if os.getenv("OPENAI_API_KEY"):
        return SellerAgent().run(agent_input)

    return SellerAgent(llm_parse=heuristic_seller_parse).run(agent_input)


@app.post("/v1/agents/buyer")
def buyer_agent(agent_input: AgentInput) -> AgentOutput:
    guard = check_comex_scope(agent_input.user_message)
    if not guard.allowed:
        return _out_of_scope_response()

    agent_input.context["NOW_ISO"] = now_iso()

    mode = os.getenv("COMEX_BUYER_MODE", "auto").lower()
    if mode == "heuristic":
        return BuyerAgent(llm_parse=heuristic_buyer_parse).run(agent_input)

    if mode == "openai":
        return BuyerAgent().run(agent_input)

    if os.getenv("OPENAI_API_KEY"):
        return BuyerAgent().run(agent_input)

    return BuyerAgent(llm_parse=heuristic_buyer_parse).run(agent_input)


class BuyerCreateRequest(BaseModel):
    request_id: str
    user_id: str
    user_message: str
    idempotency_key: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)


@app.post("/v1/sales")
def create_sale_from_message(req: SellerCreateRequest) -> Dict[str, Any]:
    guard = check_comex_scope(req.user_message)
    if not guard.allowed:
        agent_output = _out_of_scope_response()
        return {"agent_output": agent_output, "tool_result": {"ok": False, "skipped": True, "reason": "out_of_scope"}}

    req.context["NOW_ISO"] = now_iso()

    mode = os.getenv("COMEX_SELLER_MODE", "auto").lower()
    if mode == "heuristic" or (mode == "auto" and not os.getenv("OPENAI_API_KEY")):
        agent = SellerAgent(llm_parse=heuristic_seller_parse)
    else:
        agent = SellerAgent()

    agent_input = AgentInput(
        request_id=req.request_id,
        user_id=req.user_id,
        user_message=req.user_message,
        conversation=Conversation(messages=[]),
        context=req.context,
        tools_enabled=True,
    )
    agent_output = agent.run(agent_input)
    idem = req.idempotency_key or req.request_id
    tool_result = execute_action(agent_output=agent_output, idempotency_key=idem)
    return {"agent_output": agent_output, "tool_result": tool_result}


@app.post("/v1/buy-orders")
def create_buy_order_from_message(req: BuyerCreateRequest) -> Dict[str, Any]:
    guard = check_comex_scope(req.user_message)
    if not guard.allowed:
        agent_output = _out_of_scope_response()
        return {"agent_output": agent_output, "tool_result": {"ok": False, "skipped": True, "reason": "out_of_scope"}}

    req.context["NOW_ISO"] = now_iso()

    mode = os.getenv("COMEX_BUYER_MODE", "auto").lower()
    if mode == "heuristic" or (mode == "auto" and not os.getenv("OPENAI_API_KEY")):
        agent = BuyerAgent(llm_parse=heuristic_buyer_parse)
    else:
        agent = BuyerAgent()

    agent_input = AgentInput(
        request_id=req.request_id,
        user_id=req.user_id,
        user_message=req.user_message,
        conversation=Conversation(messages=[]),
        context=req.context,
        tools_enabled=True,
    )
    agent_output = agent.run(agent_input)
    idem = req.idempotency_key or req.request_id
    tool_result = execute_action(agent_output=agent_output, idempotency_key=idem)
    return {"agent_output": agent_output, "tool_result": tool_result}


@app.get("/v1/buy-orders")
def list_buy_orders() -> Dict[str, Any]:
    return {"buy_orders": list(get_db().buy_orders.values())}


class UnifiedRequest(BaseModel):
    request_id: str
    user_id: str
    user_message: str
    idempotency_key: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)


@app.post("/v1/request")
def unified(req: UnifiedRequest) -> Dict[str, Any]:
    return handle_request(
        request_id=req.request_id,
        user_id=req.user_id,
        user_message=req.user_message,
        idempotency_key=req.idempotency_key,
        context=req.context,
    )


@app.get("/v1/sales")
def list_sales() -> Dict[str, Any]:
    return {"sales": list(get_db().sales.values())}


@app.post("/v1/orchestrate")
def orchestrate(req: OrchestrateRequest) -> Dict[str, Any]:
    return execute_action(agent_output=req.agent_output, idempotency_key=req.idempotency_key)
