This is a **high-value architectural prompt**—you’re essentially asking the LLM to implement a **time-series + immutable event sourcing layer + analytics pipeline** on top of Mongo + your agents.

Below is a **production-grade prompt**, structured for your stack (Node.js, Fastify, GraphQL/Pothos, Mongo, RAG pipeline).

***

````
# 🧠 TASK: Implement Temporal Market Data Layer + Indexing + BI Integration

## Objective

Design and implement a **temporal, immutable market data system** for a COMEX platform that:

1. Stores **time-series market data as immutable records in MongoDB**
2. Exposes this data via **GraphQL resolvers**
3. Powers:
   - Ticker Tape (real-time feed)
   - Market Snapshot Charts
   - Market Indexes (derived metrics)
4. Extends the **vectorDB hydration job** to:
   - Extract market insights
   - Convert them into structured indexes
   - Persist them as temporal records

---

# 🧱 PART 1 — TEMPORAL DATA MODEL (MongoDB)

## Requirements

- Data must be **append-only (immutable)**
- No updates, only inserts
- Each record represents a **point-in-time snapshot**

---

## Collection: `market_ticks`

```ts
{
  _id: ObjectId,
  commodity: string,            // "coffee", "sugar"
  symbol: string,               // "KC=F"
  price: number,
  high: number,
  low: number,
  volume: number,
  source: string,               // "yahoo", "api"
  timeframe: "1m" | "5m" | "1h",
  timestamp: Date,              // market timestamp
  ingestedAt: Date              // system ingestion time
}

````

***

## Indexes

```
db.market_ticks.createIndex({ symbol: 1, timeframe: 1, timestamp: -1 })
db.market_ticks.createIndex({ timestamp: -1 })

```

***

## Rules

- NEVER update documents
- ALWAYS insert new snapshot
- Ensure strict ordering by timestamp

***

# 📊 PART 2 — DERIVED INDEXES COLLECTION

## Collection: `market_indexes`

Stores computed insights over time

```
{
  _id: ObjectId,
  symbol: string,
  indexType: string, // "trend_score", "volatility", "signal_score"
  value: number,
  metadata: {
    direction: "upward" | "downward" | "mixed",
    acceleration: "accelerating" | "decelerating" | "stable",
    signal: "buy" | "sell" | "hold"
  },
  timeframe: "1m" | "5m" | "1h",
  computedAt: Date,
  source: "agent"
}

```

***

# ⚙️ PART 3 — INGESTION PIPELINE

## Service: `marketIngestionService`

Responsibilities:

1. Fetch real-time data (Yahoo / APIs)
2. Normalize data
3. Insert into `market_ticks`
4. Trigger downstream processing

***

## Example

```
async function ingestMarketTick(data) {
  await db.market_ticks.insertOne({
    ...data,
    ingestedAt: new Date()
  })
}

```

***

# 🔁 PART 4 — VECTORDB HYDRATION JOB (UPGRADE)

## Objective

Extend existing RAG job to also:

### 1. Extract structured insights

From LLM output:

```
{
  "direction": "upward",
  "acceleration": "accelerating",
  "signal": "buy"
}

```

***

### 2. Convert to indexes

```
function computeIndex(insight) {
  let score = 0

  if (insight.direction === "upward") score += 1
  if (insight.acceleration === "accelerating") score += 1
  if (insight.signal === "buy") score += 1

  return score
}

```

***

### 3. Persist as temporal record

```
await db.market_indexes.insertOne({
  symbol,
  indexType: "signal_score",
  value: score,
  metadata: insight,
  timeframe,
  computedAt: new Date(),
  source: "vector_job"
})

```

***

## Schedule

- Run every 1–5 minutes
- Process latest ticks
- Avoid recomputing same timestamp

***

# 🔌 PART 5 — GRAPHQL RESOLVERS

## Query: getTickerTape

Returns latest ticks across symbols

```
tickerTape: t.field({
  type: [MarketTick],
  resolve: async () => {
    return db.market_ticks
      .find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray()
  }
})

```

***

## Query: getMarketChart(symbol, timeframe)

```
marketChart: t.field({
  args: {
    symbol: t.arg.string(),
    timeframe: t.arg.string()
  },
  resolve: async (_, { symbol, timeframe }) => {
    return db.market_ticks
      .find({ symbol, timeframe })
      .sort({ timestamp: 1 })
      .limit(500)
      .toArray()
  }
})

```

***

## Query: getMarketIndexes(symbol)

```
marketIndexes: t.field({
  args: { symbol: t.arg.string() },
  resolve: async (_, { symbol }) => {
    return db.market_indexes
      .find({ symbol })
      .sort({ computedAt: -1 })
      .limit(100)
      .toArray()
  }
})

```

***

# 📡 PART 6 — REAL-TIME SUPPORT

## Option A: Polling (simple)

- Frontend polls every 5–10 seconds

## Option B: WebSocket (recommended)

- Push new ticks and indexes
- Used for ticker tape + live charts

***

# 🧠 PART 7 — FRONTEND USAGE

## Ticker Tape

- Source: `market_ticks`
- Sort: latest first
- Display rolling updates

***

## Market Charts

- Source: `market_ticks`
- X-axis: timestamp
- Y-axis: price

***

## Index Overlays

- Source: `market_indexes`
- Overlay signals on chart

***

## BI Analytics

Use `market_indexes` to build:

- Signal distribution
- Trend evolution over time
- Score histograms

***

# ⚠️ RULES

- NEVER mutate historical data
- ALWAYS append new records
- Ensure idempotency in ingestion jobs
- Separate raw data (`market_ticks`) from derived (`market_indexes`)

***

# 🎯 DELIVERABLES

- Mongo schema definitions
- Ingestion service
- Vector job upgrade
- GraphQL resolvers
- Example queries
- Clean modular code

***

# 🧠 DESIGN PRINCIPLE

This system should behave like:

→ A lightweight time-series database\
→ Event-sourced market history\
→ Foundation for analytics + AI

NOT:

→ Mutable CRUD system\
→ Snapshot-only storage

```

---

# 🚀 Why this is powerful

You’re now building:

### ✅ Event-sourced market system
- full history
- replayable
- auditable

### ✅ AI + BI convergence
- raw data → insights → indexes

### ✅ Frontend becomes trivial
- everything is time-series driven

---

# If you want next step

I can take this further into:

- ✅ **Mongo time-series collections optimization**
- ✅ **Compression + retention strategy**
- ✅ **Streaming pipeline (Kafka / PubSub)**
- ✅ **Pre-aggregations for ultra-fast charts**

Just say:
👉 “optimize for scale”

```

