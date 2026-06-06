# Ralph Loop Run

## Task
Implement an end-to-end slice of the COMEX backend described in `ralph-loops/AGENTS.md` and `ralph-loops/MEMORY.md`: schemas + SellerAgent output + tool execution + persistence, with tests proving the flow.

## Constraints / Context
- Agents do not write directly to MongoDB; they return schema-valid `AgentOutput` (Structured Outputs style).
- Tool execution is performed by a service layer (Orchestrator concept).
- The repo initially contained only the RL docs and no runnable backend code.

## Acceptance Criteria
- [x] Canonical Pydantic schemas exist for `AgentInput`/`AgentOutput` and action payloads.
- [x] SellerAgent returns an `AgentOutput` envelope and can be driven by an injected “LLM parse” function.
- [x] `create_sale` tool validates payload shape and persists a sale record (idempotent).
- [x] An orchestrator function executes the `CREATE_SALE` action.
- [x] Unit + integration tests validate the end-to-end behavior.

## Baseline (RL-1)
- Current state: `ralph-loops/AGENTS.md` and `ralph-loops/MEMORY.md` existed; no `apps/` or `libs/` Python implementation was present.
- Evidence: directory listing under repo root showed only `context/` and `ralph-loops/`.

## Loop 1
### Plan (RL-2)
- Hypothesis: The minimal signal is having the repo-canonical schemas in code, matching `AGENTS.md`.
- Minimal change: Add the Pydantic models for envelopes and action payloads.
- Validation: Import the models from Python.

### Implement (RL-3)
- Added:
  - `libs/comex_common/agents/schemas.py`
  - `libs/comex_common/domain/schemas.py`

### Validate (RL-4)
- Result: Models import cleanly and match the documented shapes.

### Reflect (RL-5)
- Decision: Continue; wire a SellerAgent and tool execution path.

## Loop 2
### Plan (RL-2)
- Hypothesis: A deterministic, testable E2E slice is SellerAgent → Orchestrator → `create_sale` → persistence.
- Minimal change: Implement SellerAgent with an injectable parse function, plus an in-memory persistence adapter to represent “services enforce persistence” (aligning with `AGENTS.md` constraints).
- Validation: Integration test that asserts a sale is persisted.

### Implement (RL-3)
- Added:
  - `apps/agents/seller.py` (SellerAgent with `llm_parse` injection)
  - `apps/orchestrator.py` (executes `CREATE_SALE` via tool call)
  - `libs/comex_common/openai/tools.py` (`create_sale` + tool definitions)
  - `libs/comex_common/storage/in_memory.py` (idempotent persistence)

### Validate (RL-4)
- Result: End-to-end flow can be executed purely in-process.

### Reflect (RL-5)
- Decision: Add tests to lock the behavior.

## Loop 3
### Plan (RL-2)
- Hypothesis: Unit tests should validate `AgentOutput`-shaped results; integration tests should validate persistence after tool execution.
- Minimal change: Add unit + integration tests.
- Validation: Run the test suite.

### Implement (RL-3)
- Added:
  - `tests/unit/test_seller_agent_e2e.py`
  - `tests/integration/test_seller_create_sale_e2e.py`

### Validate (RL-4)
- Command:
  - `python -m pytest -q`
- Result:
  - `4 passed`

### Reflect (RL-5)
- Decision: Complete; acceptance criteria met for the SellerAgent E2E slice.

## Final Outcome
- Delivered a runnable, tested minimal backend slice consistent with the contracts in `AGENTS.md`.
- Persistence is represented via `libs/comex_common/storage/in_memory.py` (in-process), which is compatible with the “agents don’t write to DB” constraint while enabling deterministic E2E tests.
- `MEMORY.md`’s Mongo/Vector specifics remain out of scope for this slice; the persistence adapter is a placeholder for the eventual Mongo-backed implementation.
