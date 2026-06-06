# **MEMORY.md**

**Overview**

This document defines how the backend stores and retrieves “memory” for the COMEX AI platform: short-term conversation context, long-term user preferences, deal history, and vector embeddings for semantic/hybrid retrieval. Atlas Vector Search provides semantic and hybrid search over stored embeddings and supports pre-filtering via indexed metadata fields. 

UNSPECIFIED: legal/compliance regime, exact retention windows per customer segment, PII redaction policy details, and which documents are eligible for embedding.

## **Memory types**

1. **Short-term conversation memory**

- Purpose: continuity for chat turns (current session + recent history).
- Storage: `conversations`, `messages`.

1. **Long-term user profile**

- Purpose: preferences (commodities, preferred incoterms, destinations), notification settings.
- Storage: `user_profiles`.

1. **Deal history**

- Purpose: personalization and analytics.
- Storage: `sales`, `buy_orders`, `matches`, `alerts`, `notifications`.

1. **Embeddings store (vector memory)**

- Purpose: semantic retrieval of prior deals, playbooks, and extracted nuggets.
- Storage: `memory_docs` (raw text + metadata) + `memory_embeddings` (embedding vector + filters).

## **MongoDB collections and indexes**

Example file path: `libs/comex_common/storage/mongo_schema.md` (optional)

### **Collections (minimum)**

- `conversations`: `{_id, user_id, created_at, updated_at, title?, summary?}`
- `messages`: `{_id, conversation_id, user_id, role, text, created_at}`
- `user_profiles`: `{_id=user_id, prefs:{...}, notification_prefs:{...}, updated_at}`
- `sales`, `buy_orders`, `matches`, `alerts`, `notifications`
- `events_outbox`: transactional outbox rows
- `events_inbox`: processed event ids for idempotency
- `memory_docs`: documents to embed
- `memory_embeddings`: embedding vectors + metadata

### **TTL (retention) policies**

MongoDB TTL indexes use `expireAfterSeconds` to automatically remove expired documents. 

Recommended defaults (UNSPECIFIED—adjust per contract):

- `messages`: 90 days
- `conversations`: 180 days
- `events_inbox`: 14 days (dedupe window)
- `events_outbox`: keep 30 days after publish (audit)

Example TTL index creation:

- `db.messages.createIndex({ "created_at": 1 }, { expireAfterSeconds: 7776000 })` 

### **Required secondary indexes (minimum)**

- `messages`: `{conversation_id: 1, created_at: 1}`
- `sales`: `{commodity: 1, created_at: -1}`, `{user_id: 1, created_at: -1}`
- `buy_orders`: `{commodity: 1, created_at: -1}`, `{user_id: 1, created_at: -1}`
- `matches`: `{sale_id: 1, buy_order_id: 1}` unique (optional), `{score: -1, created_at: -1}`
- `events_inbox`: `{event_id: 1}` unique
- `events_outbox`: `{status: 1, created_at: 1}`

## **Vector schema (Atlas Vector Search)**

Atlas Vector Search requires a vector index on the embedding field and optional “filter” fields to enable pre-filtering. \
Atlas Vector Search supports embeddings up to 8192 dimensions (index constraint). 

### **Embedding dimensions and model choices**

OpenAI embeddings default to:

- `text-embedding-3-small`: 1536 dims
- `text-embedding-3-large`: 3072 dims 

Recommendation:

- Start with `text-embedding-3-small` for cost/latency; upgrade to `-large` if retrieval quality needs it. (UNSPECIFIED budget constraints)

### **Collection shapes**

`memory_docs`:

- `_id`
- `user_id` (nullable for global docs)
- `doc_type` enum: `playbook|deal|message|policy` (UNSPECIFIED)
- `text` (chunked)
- `source` (file/url id, UNSPECIFIED)
- `created_at`, `updated_at`
- `pii_level` enum: `none|low|high` (UNSPECIFIED)
- `ttl_at` (optional, for per-doc expiration)

`memory_embeddings`:

- `_id`
- `doc_id` (ref to memory\_docs)
- `embedding` (float array length = dims)
- `embedding_model` (string)
- `metadata` (filterable fields):
  - `user_id` (UUID/string)
  - `commodity` (string)
  - `origin` (string)
  - `destination` (string)
  - `created_at` (date)
  - `visibility` (`private|org|public`) (UNSPECIFIED)

## **Embedding generation strategy**

When to embed:

- On creation/update of `memory_docs` (async job).
- On finalized `sales`, `buy_orders`, and `matches` (store a normalized “nugget” doc) (UNSPECIFIED exact templates).

How to embed:

- Use OpenAI Embeddings endpoint and store the vector; embedding dimensions default as above. 

Consistency:

- Publish `MEMORY_DOC_UPSERTED` via outbox; embedding worker consumes and upserts `memory_embeddings`. Transactional outbox prevents dual-write inconsistencies. 

## **Retrieval strategy (hybrid + filters)**

Atlas Vector Search supports:

- **Semantic search** (vector similarity)
- **Hybrid search** (vector + text) 

Pre-filtering:

- Use `$vectorSearch.filter` to narrow scope by metadata (boolean/date/objectId/numeric/string/UUID). 

Recommended retrieval defaults (UNSPECIFIED tune):

- `k = 8` (top results)
- `min_score = 0.75` (vector similarity threshold, UNSPECIFIED scale)
- Always filter by `visibility` and `user_id` for private memory.

## **Memory update rules**

1. **Conversation**

- Append message per turn; optionally update conversation `summary` every N turns (UNSPECIFIED).
- If a user requests deletion, delete all user-owned memory docs and embeddings (see sample queries).

1. **Profile**

- Update only through explicit user action or explicit “save preference” flow (UNSPECIFIED).

1. **Embeddings**

- Each `memory_doc` update increments `version`; embedding worker recomputes embedding and replaces in `memory_embeddings`.
- Ensure idempotency: key by `(doc_id, embedding_model, version)`.

## **Privacy and PII handling**

- Do not embed raw secrets (API keys, tokens). (UNSPECIFIED detection rules)
- Mark docs with `pii_level`; for `high`, store only redacted text or skip embedding entirely (UNSPECIFIED policy).
- Enforce per-user isolation using `metadata.user_id` filters in vector queries.

## **Sample Python (pymongo) queries**

Example file path: `libs/comex_common/vector/atlas.py`

```
python
```

**Copy**

```
from pymongo import MongoClient
from datetime import datetime

db = MongoClient(MONGO_URI).get_database("comex")

def upsert_memory_doc(doc):
    db.memory_docs.update_one({"_id": doc["_id"]}, {"$set": doc}, upsert=True)

def delete_user_memory(user_id: str):
    db.memory_embeddings.delete_many({"metadata.user_id": user_id})
    db.memory_docs.delete_many({"user_id": user_id})

def vector_search(user_id: str, query_vec: list[float], k: int = 8):
    pipeline = [
      {"$vectorSearch": {
        "index": "memory_embedding_v1",
        "path": "embedding",
        "queryVector": query_vec,
        "numCandidates": 200,
        "limit": k,
        "filter": {"metadata.user_id": user_id, "metadata.visibility":"private"}
      }},
      {"$project": {"doc_id": 1, "score": {"$meta": "vectorSearchScore"}}}
    ]
    return list(db.memory_embeddings.aggregate(pipeline))

```

Vector pre-filtering works only if filter fields are indexed as `filter` type in the vector index definition. 

## **Validation tests**

Example path: `tests/integration/test_memory_vector.py`

- Insert `memory_docs` + `memory_embeddings` for a user; run vector query with `filter.metadata.user_id`; ensure no cross-user leakage.
- TTL: create a short TTL index for a test collection and verify expiration behavior (time-dependent; allow slack). 
- Event consistency: publish `MEMORY_DOC_UPSERTED` twice; ensure embedding worker processes once using `events_inbox` dedupe (at-least-once). 

## **References**

- Atlas Vector Search semantic/hybrid search, and pre-filtering capability. 
- Atlas Vector Search embedding dimension constraint (≤8192). 
- OpenAI embeddings default dimensions (1536/3072). 
- MongoDB TTL indexes (`expireAfterSeconds`). 
- Transactional Outbox to avoid dual-write issues. 
- Pub/Sub at-least-once delivery requires idempotent processing. 

