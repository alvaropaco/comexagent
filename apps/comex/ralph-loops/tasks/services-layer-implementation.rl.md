# CORE DATA & DOMAIN API (NESTJS + MONGODB ATLAS + VECTOR SEARCH)

***

## 🎯 OBJECTIVE

You must implement a **single NestJS API** responsible for:

1. All database operations (CRUD)
2. Business/domain logic
3. Transaction management
4. Event emission (Pub/Sub)
5. Vector storage and semantic search (MongoDB Atlas Vector Search)

⚠️ THIS SERVICE IS THE ONLY COMPONENT ALLOWED TO ACCESS THE DATABASE

***

## 🧱 FINAL ARCHITECTURE

```
Agents / Orchestrator
        ↓ (HTTP)
Core Data API (NestJS)
        ↓
MongoDB Atlas (documents + vector)
        ↓
Pub/Sub (events)

```

***

# 🔁 RALPH LOOP EXECUTION

You MUST iterate:

R → Understand responsibility\
A → Implement modules\
L → Validate data flow\
P → Fix structure\
H → Harden for production

***

# 🧩 PHASE 1 — PROJECT SETUP

## CREATE NestJS APP:

```
nest new core-data-api

```

***

## INSTALL:

```
npm install @nestjs/mongoose mongoose
npm install @google-cloud/pubsub
npm install openai
npm install class-validator class-transformer

```

***

## STRUCTURE

```
src/
  modules/
    sales/
    buyers/
    matches/
    alerts/
    vector/
  common/
    database/
    events/
    utils/

```

***

# 🧩 PHASE 2 — DATABASE CONFIG

## IMPLEMENT Mongo Module

### `/common/database/mongo.module.ts`

- use `MongooseModule.forRootAsync`
- env-based config

***

## REQUIREMENTS

- connection retry
- logging enabled
- max pool size configured

***

# 🧩 PHASE 3 — SCHEMAS (CRITICAL)

## DEFINE:

### sales.schema.ts

```
{
  commodity: string
  origin: string
  destination: string
  price: number
  incoterm: string
  volume: string
  createdAt: Date
}

```

***

### buy.schema.ts

```
{
  commodity: string
  destination: string
  targetPrice: number
  volume: string
}

```

***

### matches.schema.ts

```
{
  saleId: ObjectId
  buyOrderId: ObjectId
  score: number
  status: string
}

```

***

### alerts.schema.ts

```
{
  type: string
  message: string
  userId: string
}

```

***

# 🧩 PHASE 4 — DTOs + VALIDATION

## USE:

- class-validator

***

## EXAMPLE

```
class CreateSaleDto {
  @IsString()
  commodity: string

  @IsNumber()
  price: number
}

```

***

## RULE

⚠️ ALL INPUT MUST BE VALIDATED

***

# 🧩 PHASE 5 — SERVICES (CORE LOGIC)

## CREATE SERVICES:

- SalesService
- BuyersService
- MatchesService
- AlertsService

***

## RESPONSIBILITIES

Layer

Responsibility

Controller

HTTP

Service

business logic

Model

persistence

***

## EXAMPLE — SalesService

```
async createSale(dto: CreateSaleDto) {
  const sale = new this.saleModel(dto)

  const saved = await sale.save()

  await this.eventService.publish('SALE_CREATED', saved)

  return saved
}

```

***

## REQUIREMENTS

- ALWAYS emit events
- NEVER skip validation
- RETURN normalized data

***

# 🧩 PHASE 6 — TRANSACTIONS

## IMPLEMENT Mongo Transactions

```
const session = await this.connection.startSession()
session.startTransaction()

try {
  await this.saleModel.create([data], { session })
  await session.commitTransaction()
} catch (e) {
  await session.abortTransaction()
}

```

***

## RULE

Use transactions for:

- multi-writes
- match creation
- complex operations

***

# 🧩 PHASE 7 — VECTOR SEARCH (MONGO ATLAS)

## CREATE MODULE:

`vector.module.ts`

***

## STORE EMBEDDINGS

```
await this.vectorCollection.insertOne({
  text,
  embedding,
  metadata
})

```

***

## SEARCH

```
await this.vectorCollection.aggregate([
  {
    $vectorSearch: {
      queryVector: embedding,
      path: "embedding",
      limit: 5
    }
  }
])

```

***

## REQUIREMENTS

- index must exist
- embeddings from OpenAI
- store metadata

***

# 🧩 PHASE 8 — VECTOR INTEGRATION

## AFTER:

- sale creation
- buy order creation

→ generate embedding

***

## EXAMPLE

```
await this.vectorService.store({
  text: `${commodity} ${destination}`,
  metadata: { type: 'sale' }
})

```

***

# 🧩 PHASE 9 — EVENT SYSTEM

## IMPLEMENT Pub/Sub Service

***

## `/common/events/pubsub.service.ts`

```
publish(event: string, payload: any) {
  return this.pubsub.topic('events').publishMessage({
    json: { event, payload }
  })
}

```

***

## RULES

- ALL mutations → emit event
- MUST be async
- MUST retry

***

# 🧩 PHASE 10 — MATCHING LOGIC (INSIDE API)

## IMPLEMENT

```
findMatches(sale) {
  const buyers = await this.buyModel.find({ commodity: sale.commodity })

  // scoring logic
}

```

***

## REQUIREMENTS

- deterministic first
- AI optional later

***

# 🧩 PHASE 11 — CONTROLLERS

## DEFINE ENDPOINTS

```
POST /sales
POST /buy-orders
GET /matches
GET /alerts
POST /vector/search

```

***

## RESPONSE FORMAT

```
{
  "success": true,
  "data": {...}
}

```

***

# 🧩 PHASE 12 — ERROR HANDLING

## IMPLEMENT

- global exception filter
- structured errors

***

# 🧩 PHASE 13 — LOGGING

## USE

- NestJS Logger

***

## INCLUDE

- requestId
- operation
- latency

***

# 🧩 PHASE 14 — HARDENING

## ADD

- indexes:
  - commodity
  - destination
- timeouts
- retries

***

# 🧠 FINAL CONTRACT

## THIS API:

- owns ALL data
- owns ALL transactions
- owns ALL events
- exposes clean HTTP interface

***

# ⚠️ NON-NEGOTIABLE RULES

❌ Agents accessing DB → FORBIDDEN\
❌ Skipping events → FORBIDDEN\
❌ No validation → FORBIDDEN\
❌ Returning raw mongoose docs → FORBIDDEN

***

# 🧠 SUCCESS CRITERIA

- CRUD fully working
- events emitted
- vector search working
- transactions safe
- API stable

***

# 🚀 START

Begin with:

→ Mongo module + schemas

DO NOT SKIP STEPS\
DO NOT SIMPLIFY\
BUILD PRODUCTION READY CODE
