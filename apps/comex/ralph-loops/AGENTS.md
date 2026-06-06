# **AGENT.md**

**Overview**

This repo implements an event-driven COMEX AI trading backend on Cloud Run in Google Cloud. Agents **never** write directly to MongoDB; they produce **strict, schema-valid JSON** (OpenAI Structured Outputs) and/or propose tool calls, while services enforce validation, idempotency, and persistence. 

Key transports:

- External: WebSocket (frontend → API Gateway) for streaming.
- Internal: SSE (Orchestrator ↔ Agents/OpenAI) bridged to WS. 

UNSPECIFIED: commodity taxonomy, currency/units, scoring weights, market data providers, notification providers.

## **Agents and responsibilities**

All agents share the same `AgentInput` and `AgentOutput` envelopes; only `action.payload` differs.

- **Seller Agent**: extract/validate a *sale offer* draft from user text; request missing fields; output `CREATE_SALE`.
- **Buyer Agent**: extract/validate a *buy order/demand* draft; output `CREATE_BUY_ORDER`.
- **Insights Agent**: generate actionable trading guidance; may call `get_market_data`; output `NONE`.
- **Info Agent**: answer general COMEX questions (UNSPECIFIED knowledge base); output `NONE`.
- **Matching Agent**: (LLM-optional) explain/validate top-N deterministic matches (do not compute candidates); output `MATCH_EXPLANATION`.
- **Pricing Agent**: (LLM-optional) explain heuristic/ML predictions and assumptions; output `PRICING_EXPLANATION`.
- **Opportunity Agent**: (LLM-optional) turn signals (matches/pricing deltas) into user-facing alert text; output `ALERT_DRAFT`.

## **Schemas (Pydantic, repo canonical)**

Example file path: `libs/comex_common/agents/schemas.py`

```
python
```

**Copy**

```
from pydantic import BaseModel, Field
from typing import Literal, Optional, Any, Dict, List

Role = Literal["user","assistant","system","tool"]

class ChatMsg(BaseModel):
    role: Role
    text: str

class Conversation(BaseModel):
    conversation_id: Optional[str] = None
    messages: List[ChatMsg]
    summary: Optional[str] = None

class AgentInput(BaseModel):
    request_id: str
    user_id: str
    user_message: str
    conversation: Conversation
    context: Dict[str, Any] = Field(default_factory=dict)
    tools_enabled: bool = True

ActionType = Literal[
  "CREATE_SALE","CREATE_BUY_ORDER","NONE",
  "MATCH_EXPLANATION","PRICING_EXPLANATION","ALERT_DRAFT"
]

class Action(BaseModel):
    type: ActionType
    payload: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)
    validation_errors: List[str] = Field(default_factory=list)

class AgentOutput(BaseModel):
    intent: Literal["seller","buyer","insights","info","matching","pricing","opportunity"]
    output_text: str
    action: Action

```

Generate JSON Schema for Structured Outputs via: `python -c "from libs.comex_common.agents.schemas import AgentOutput; import json; print(json.dumps(AgentOutput.model_json_schema(), indent=2))"` 

### **Action payload schemas (minimum required fields)**

Example file path: `libs/comex_common/domain/schemas.py`

```
python
```

**Copy**

```
from pydantic import BaseModel, Field
from typing import Optional, Literal, Dict, Any

Incoterm = Literal["FOB","CFR","CIF","EXW","DAP","DDP"]  # UNSPECIFIED full list
Currency = Literal["USD","BRL","EUR"]                   # UNSPECIFIED

class Volume(BaseModel):
    value: float
    unit: str  # e.g., "containers","tons" (UNSPECIFIED canonical units)

class CreateSalePayload(BaseModel):
    commodity: str
    incoterm: Incoterm
    price: float
    currency: Currency
    volume: Volume
    origin: Optional[str] = None
    destination: Optional[str] = None

class CreateBuyOrderPayload(BaseModel):
    commodity: str
    target_price: float
    currency: Currency
    volume: Volume
    destination: Optional[str] = None

class MatchExplanationPayload(BaseModel):
    sale_id: str
    buy_order_id: str
    score: float
    reason: str

class PricingExplanationPayload(BaseModel):
    sale_id: Optional[str] = None
    predicted_margin: float
    recommended_price: float
    currency: Currency
    assumptions: Dict[str, Any] = Field(default_factory=dict)

class AlertDraftPayload(BaseModel):
    alert_type: Literal["opportunity","risk","timing"]  # UNSPECIFIED
    title: str
    message: str
    severity: Literal["LOW","MEDIUM","HIGH"]

```

## **OpenAI prompts and tool interfaces**

Structured Outputs enforce JSON schema compliance at the API level (preferred over “JSON mode”). \
Tool calling is a multi-step loop: model requests tool → app executes → app sends tool output → model finalizes. 

### **Seller Agent: example Structured-Output prompt**

Example file path: `apps/agents/app/seller.py`

**System**

- You are SellerAgent for COMEX. Extract a sale offer. If required fields missing, set `action.type="CREATE_SALE"` but include `validation_errors` listing missing fields and ask concise questions in `output_text`. Output MUST match `AgentOutput` schema.

**User**

- “Sell 2 containers of coffee FOB Santos at $3800 to Jordan”

### **Tool definitions (for function calling)**

Example file path: `libs/comex_common/openai/tools.py`

```
json
```

**Copy**

```
[
  {
    "type":"function",
    "function":{
      "name":"create_sale",
      "description":"Create a sale offer in Sales Service (idempotent).",
      "parameters":{"type":"object","properties":{
        "idempotency_key":{"type":"string"},
        "payload":{"$ref":"#/definitions/CreateSalePayload"}
      },"required":["idempotency_key","payload"]}
    }
  },
  {
    "type":"function",
    "function":{
      "name":"create_buy_order",
      "description":"Create a buy order in Buy Service (idempotent).",
      "parameters":{"type":"object","properties":{
        "idempotency_key":{"type":"string"},
        "payload":{"$ref":"#/definitions/CreateBuyOrderPayload"}
      },"required":["idempotency_key","payload"]}
    }
  },
  {
    "type":"function",
    "function":{
      "name":"get_market_data",
      "description":"Fetch market/freight/FX snapshot. Provider UNSPECIFIED.",
      "parameters":{"type":"object","properties":{
        "commodity":{"type":"string"},
        "origin":{"type":"string"},
        "destination":{"type":"string"}
      },"required":["commodity"]}
    }
  },
  {
    "type":"function",
    "function":{
      "name":"publish_event",
      "description":"Publish a domain event to Pub/Sub topic comex.domain-events.v1.",
      "parameters":{"type":"object","properties":{
        "event_type":{"type":"string"},
        "event":{"type":"object"}
      },"required":["event_type","event"]}
    }
  }
]

```

UNSPECIFIED: whether Orchestrator or Agents service executes tools. Recommended: Orchestrator executes tools to centralize auth + retries.

## **Streaming and SSE→WS bridging**

OpenAI streaming uses **SSE** (`stream=true`). \
Cloud Run WebSockets are long-running HTTP requests with default 5 min timeout, max 60 min. 

Bridge rule:

- Agents stream SSE deltas → Orchestrator converts to internal SSE → API Gateway relays as WS `chat.delta`.
- On tool call start/finish, emit WS `chat.tool`.

## **Reliability: errors, retries, idempotency**

### **Pub/Sub push delivery**

- Push subscription sends HTTPS POST; subscriber **acks by returning 2xx**, otherwise Pub/Sub retries. 
- `message.data` is base64 bytes; attributes are key/value strings. 
- Default is **at-least-once**; duplicates must be handled (idempotent consumers). 
- If push auth enabled, Pub/Sub signs a JWT in Authorization header. 

### **Idempotency rules**

- All write tools/endpoints require `Idempotency-Key` header or `idempotency_key` field.
- Consumers maintain `events_inbox` collection keyed by `event_id` and short-circuit duplicates.
- Producers use **Transactional Outbox** to avoid dual-write inconsistency. 

### **OpenAI/tool retries**

- Retry OpenAI calls on transient 5xx/timeout with exponential backoff (cap attempts). (UNSPECIFIED exact policy)
- Tool execution: retry safe reads; do not retry writes without idempotency key.

## **Security: service-to-service auth (Cloud Run)**

Inter-service HTTP calls use Google-signed **ID tokens** (audience = target service URL). \
Python snippet (example path `libs/comex_common/auth/idtoken.py`) uses `google.oauth2.id_token.fetch_id_token` which can obtain tokens from metadata server on Cloud Run. 

## **Validation & tests**

### **Unit tests (pytest)**

Example path: `apps/agents/tests/test_seller_schema.py`

- Validate Seller Agent output conforms to `AgentOutput`.
- Validate missing required sale fields produce `validation_errors`.

Sample payload:

- Input: “Sell coffee FOB at 3800” → missing volume/currency → expect validation\_errors contains both.

### **Integration tests**

Example path: `tests/integration/test_pubsub_push.py`

- Start Pub/Sub emulator; publish SALE\_CREATED; assert Matching Service receives push and acks.

Pub/Sub emulator requires Cloud Client Libraries; console and `gcloud pubsub` commands are unsupported. 

## **Developer runbook (local)**

Example paths: `docker-compose.yml`, `scripts/dev_up.sh`

1. Mongo:

- `docker compose up -d mongo`

1. Pub/Sub emulator:

- `gcloud components install pubsub-emulator`
- `gcloud beta emulators pubsub start --project=local --host-port=0.0.0.0:8085 &`
- `$(gcloud beta emulators pubsub env-init)` (sets `PUBSUB_EMULATOR_HOST`). 

1. Tests:

- `pytest -q`

1. WebSocket smoke test:

- `websocat -H="Authorization: Bearer $JWT" wss://localhost:8080/v1/ws/chat`
- send `{"type":"chat.start","request_id":"...","message":{"text":"Sell 2 containers coffee FOB Santos at 3800 USD"}}`

## **References**

- OpenAI Structured Outputs & strict schema enforcement. 
- OpenAI streaming responses over SSE. 
- OpenAI tool calling flow. 
- Cloud Run WebSockets timeouts (5–60 min). 
- Pub/Sub push delivery + ack semantics; message data base64. 
- Pub/Sub push authentication (JWT). 
- Pub/Sub at-least-once reliability note. 
- Pub/Sub emulator usage & env-init. 
- Transactional Outbox rationale. 
- Cloud Run service-to-service auth & ID tokens. 

