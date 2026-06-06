# 🎯 Objective

Upgrade the existing lightweight RAG pipeline (query structuring → hybrid retrieval → rerank → grounded prompting → cache) to improve **trustworthiness, ranking quality, and reliability under uncertainty**, without adding heavy infrastructure.

***

# 🧩 Scope of Work

You must implement the following **4 improvements**:

***

## 1. 🔒 Hard Grounding Enforcement (CRITICAL)

### Requirements

- For MARKET\_INSIGHTS responses:
  - If retrieved context contains `market_data`:
    - Only use numbers present in retrieved context
    - MUST include:
      - `sourceUrl`
      - `fetchedAt`
  - If NO `market_data`:
    - MUST NOT generate any numeric values (prices, volumes, etc.)
    - MUST respond clearly:
      > "No recent market data available for this query"

### Tasks

- Update prompt template in `info.py` and `comex_graph.py`
- Add backend guard:
  - Detect absence of market data
  - Strip or block numeric hallucinations

### Acceptance Criteria

- No response includes fabricated numbers
- All numeric answers are traceable to retrieved context

***

## 2. 📊 Retrieval Confidence Scoring

### Requirements

Compute a confidence score per query using:

- Top similarity score
- Number of retrieved results
- Filter match ratio (how well metadata matched)

### Example

```
confidence = (
  0.5 * similarity_score +
  0.3 * min(result_count / 5, 1.0) +
  0.2 * filter_match_ratio
)

```

### Behavior

- High confidence → assertive response
- Medium → cautious language
- Low → explicitly state uncertainty

### Tasks

- Implement in `retrieval.py`
- Pass confidence into agent prompt context

### Acceptance Criteria

- Responses adapt tone based on confidence
- Confidence score logged for observability

***

## 3. ⚡ Improved Re-ranking

### Requirements

Replace current recency-only ranking with weighted scoring:

```
score =
  0.6 * similarity +
  0.3 * recency +
  0.1 * filter_match

```

### Notes

- Normalize recency (e.g., decay over time)
- Use existing metadata fields:
  - `date`
  - `fetchedAt`
  - `ingestedAt`

### Tasks

- Update ranking logic in `retrieval.py`

### Acceptance Criteria

- More relevant + recent documents appear in top 5
- No regression in current retrieval quality

***

## 4. 🧠 Cache Improvement (Near-Duplicate Awareness)

### Requirements

Improve cache hit rate by handling semantically similar queries.

### Approach (lightweight)

- Normalize query:
  - lowercase
  - remove stopwords
- Hash structured query (not raw text)
- Optionally include top embedding vector hash (if available)

### Tasks

- Update cache key logic in `retrieval.py`

### Acceptance Criteria

- Similar queries hit cache
- No incorrect cache collisions

***

# 🧪 Testing Requirements

- Add unit tests for:
  - grounding enforcement (no hallucinated numbers)
  - confidence scoring
  - reranking logic
- Add integration test:
  - query with no market data → no numbers returned
- Validate with real query:
  - “Coffee market trends this week”
  - Ensure response cites `sourceUrl` and `fetchedAt`

***

# 🚫 Constraints

- DO NOT introduce new infrastructure (no new DB, no external reranker)
- MUST reuse:
  - Mongo Atlas Vector Search
  - existing metadata schema
- Keep implementation lightweight (hours, not days)

***

# 📦 Deliverables

- Updated:
  - `retrieval.py`
  - `info.py`
  - `comex_graph.py`
- New tests
- Short summary of changes

***

# ✅ Definition of Done

- System never fabricates market numbers
- Responses clearly reflect confidence level
- Retrieval results are better ranked
- Cache efficiency improved without breaking correctness
- All tests passing

***

