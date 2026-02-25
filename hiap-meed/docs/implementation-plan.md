# HIAP-MEED: MEED+ Prioritization Engine Implementation Plan (Repo-Specific)

Goal: Implement the MEED+ prioritization pipeline end-to-end inside `hiap-meed/` with typed Python, Pydantic models, modular block structure, a single API endpoint, configurable weights, and robust logging + request artifacts. Scoring logic can be stubbed initially, but interfaces, models, and orchestration must be stable.

Alignment targets:

- `docs/highlevel-architecture.md`: Hard Filter Gate -> Impact/Alignment/Feasibility -> Weighted Sum -> Final List
- `docs/detailed-block-architecture.md`: block inputs/outputs and evidence expectations
- `AGENTS.md`: package layout, absolute imports (`from app...`), separation of concerns, logging, type hints, `python -m ...`

---

## 0) Tech Choices (current repo reality)

- Runtime: Python 3.12+ (already required)
- API: FastAPI (already in dependencies)
- Models: Pydantic v2 (via FastAPI)
- Dependencies: `pyproject.toml` is the source of truth (uv-managed)
- Logging: stdlib `logging`, configured via `app/utils/logging_config.py` (exists)
- Artifacts: JSONL per request under `logs/requests/` (gitignored)

---

## 1) Repository & Package Structure (must live in `hiap-meed/`)

Implement the prioritizer as a module under `app/modules/` (per `AGENTS.md`).

Target structure:

```text
hiap-meed/
  app/
    __init__.py
    main.py
    run.sh
    utils/
      __init__.py
      logging_config.py
      artifacts.py                 # NEW
      timing.py                    # NEW
    services/
      __init__.py
      data_clients.py              # NEW (protocols only; DB integration later)
    modules/
      __init__.py                  # NEW
      prioritizer/
        __init__.py
        api.py                     # NEW: APIRouter for /v1/prioritize
        config.py                  # NEW: weights + mappings + env flags
        models.py                  # NEW: Pydantic domain + API models
        orchestrator.py            # NEW: pipeline runner
        blocks/
          __init__.py
          hard_filter.py
          impact.py
          alignment.py
          feasibility.py
          final_scoring.py
  tests/
    conftest.py
    integration/
      test_api_health.py
      test_prioritize_smoke.py     # NEW
  docs/
    implementation-plan.md
    highlevel-architecture.md
    detailed-block-architecture.md
  k8s/
    deployment-dev.yml
    deployment-test.yml
    deployment-prod.yml
    service-dev.yml
    service-test.yml
    service-prod.yml
  Dockerfile
  pyproject.toml
  uv.lock
  .env.example
  .gitignore
  .dockerignore
```

Rules (from `AGENTS.md`):

- All code folders have `__init__.py`.
- Absolute imports only: `from app.modules.prioritizer.models import ...`.
- No `print` for logging; use `logging`.
- Use `pathlib.Path`.

---

## 2) Running, Imports, and Packaging (must match `AGENTS.md`)

This repo currently runs the app from `hiap-meed/app` and tests use a `sys.path` workaround. To comply with `AGENTS.md` and keep imports stable:

- Local run (PowerShell) from `hiap-meed/`:
  - `uv sync`
  - `uv run python -m app.main`

- Tests from `hiap-meed/`:
  - `uv run pytest -c pytest.ini`

- Docker packaging must preserve the `app/` package directory so `from app...` imports work.
  - Server entrypoint should be `uvicorn app.main:app --host 0.0.0.0 --port 8000`.

---

## 3) Domain + API Models (Pydantic, stable contracts)

Implement in `app/modules/prioritizer/models.py`.

### 3.1 Domain inputs (architecture-aligned, seeded from `hiap-meed/data/*`)

The `hiap-meed/data/` CSVs are **preliminary seed data** (not imported in production). They are used here to ensure our Pydantic contracts include the real fields we should expect from future external APIs. For this simplified phase, we only model `data/1_city/city.csv`, `data/1_city/city_context.csv`, `data/2_action/actions.csv`, and `data/2_action/actions_mitigation_impact.csv`.

Important normalization expectations for future APIs:

- Set-like CSV strings such as `{'I.1.1','I.1.2'}` should become `list[str]`.

### 3.2 Upstream Data API (assumed for now)

Ignore anything in `hiap-meed/data/3_policy/` for now.

Assume we integrate with 2 upstream HTTP APIs ("Data API") that provide:

- `CityData`: city identity + socio-economic context (derived from `data/1_city/city.csv` and `data/1_city/city_context.csv`)
- `Action`: the action catalog with embedded mitigation impacts (derived from `data/2_action/actions.csv` and `data/2_action/actions_mitigation_impact.csv`)

Design principle (for now):

- Keep exactly **two** domain data models: `CityData` and `Action`.
- Do not introduce intermediate Pydantic models yet (nested rows remain `list[dict[str, Any]]`).
- Keep an escape hatch (`raw`) for provider fields we haven't modeled.

#### 3.2.1 City data model (`CityData`)

Pydantic contract (to implement in `app/modules/prioritizer/models.py`):

```python
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CityData(BaseModel):
    """
    City identity + socio-economic context.

    Derived from:
    - `data/1_city/city.csv` (single row for the city)
    - `data/1_city/city_context.csv` (many indicator rows for the city)
    """

    comuna_name: str
    locode: str = Field(min_length=1)
    region_name: str
    comuna_code: str
    region_code: str
    comuna: str | None = None

    # Each item is a row-like dict from `city_context.csv`.
    city_context: list[dict[str, Any]] = Field(default_factory=list)

    # Metadata / provider escape hatch.
    as_of: datetime | None = None
    source: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)
```

Expected `city_context[*]` keys (from `data/1_city/city_context.csv`):

- `attribute_type: str`
- `attribute_value: str | float | int | bool | None`
- `attribute_units: str | None`
- `attribute_category: str | None`
- optional: `locode`, `comuna_name`, `comuna`

#### 3.2.2 Action model (`Action`)

Pydantic contract (to implement in `app/modules/prioritizer/models.py`):

```python
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class Action(BaseModel):
    """
    Action catalog entry + mitigation impact signals.

    Derived from:
    - `data/2_action/actions.csv` (one row per action)
    - `data/2_action/actions_mitigation_impact.csv` (many impact rows joined by `action_id`)
    """

    action_id: str = Field(min_length=1)
    action_name: str
    action_type: str | None = None
    description: str | None = None
    action_category: str | None = None
    action_subcategory: str | None = None
    investment_cost: str | None = None
    implementation_timeline: str | None = None
    biome: str | None = None

    # Each item is a row-like dict from `actions_mitigation_impact.csv`.
    impacts: list[dict[str, Any]] = Field(default_factory=list)

    # Metadata / provider escape hatch.
    as_of: datetime | None = None
    source: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)
```

Expected `impacts[*]` keys (from `data/2_action/actions_mitigation_impact.csv`):

- optional: `action_id` (if impacts are returned verbatim; omit if already grouped under the parent `Action`)
- `subsector_number: str | None`
- `gpc_reference_number: str | None` (seed CSV uses a set-like string, e.g. `{'I.1.1','I.1.2'}`)
- `gpc_reference_numbers: list[str] | None` (normalized form)
- `impact_type: str`
- `impact_relationship: str` (`positive|negative`)
- `impact_text: str | None`
- `impact_numeric: int | float | None`
- `methodology: str | None`

Notes:

- Actions are not "for a city". For a given request, we score the full action list against a single `CityData`.

### 3.3 Pipeline outputs

BlockScoreResult

- `score_by_action_id: dict[str, float]` (keyed by `action_id`)
- `evidence_by_action_id: dict[str, dict[str, object]] | None`

Evidence semantics (applies to all `evidence*` fields):

- Purpose: human-readable, non-sensitive explainability/debug metadata for _why_ an action was scored/filtered a certain way.
- Shape: always keyed by `action_id`, and values are shallow JSON-serializable dicts (strings/numbers/bools/lists/dicts).
- Stability: best-effort, additive-only (new keys can be added; consumers must tolerate missing keys).
- Safety: do not include secrets or large blobs; prefer counts and small identifiers.

Recommended evidence keys (initial stubs):

- Hard filter:
  - `discard_reason: str` (e.g. `excluded`)
  - `matched_excluded_action_id: str | None`
- Impact:
  - `emissions_impact_rows: int`
  - `has_any_gpc_reference: bool`
  - `sample_gpc_reference_numbers: list[str]` (small, e.g. up to 3)
- Alignment:
  - `has_action_type: bool`
  - `has_action_category: bool`
  - `has_action_subcategory: bool`
- Feasibility:
  - `city_context_rows: int`

HardFilterResult

- `valid_actions: list[Action]`
- `discarded_excluded: list[Action]`
- `evidence: dict[str, dict[str, object]]` (keyed by `action_id`)

ScoredAction

- `action: Action`
- `impact_score: float`
- `alignment_score: float`
- `feasibility_score: float`
- `final_score: float`
- `rank: int`
- `evidence: dict[str, object]`

### 3.4 API models

PrioritizationRequest

- `locode: str`
- `excluded_action_ids: list[str] = []`
- `weights_override: dict[str, float] | None = None`
- `top_n: int | None = None`

PrioritizationResponse

- `ranked_action_ids: list[str]` (1..N order; index 0 is the highest ranked action)
- `metadata: dict[str, object]` (request_id, timings, counts, discarded totals, weights used)

Validation rules:

- Lists default to empty, but types are validated strictly.
- Weights are validated
- furhter validation logic like locode form "XX YYY". You can refer to hiap\app\prioritizer\models.py for examples.

---

## 4) Configuration (weights, mappings, env)

Implement in `app/modules/prioritizer/config.py`:

- Default weights:
  - impact: 0.55
  - alignment: 0.22
  - feasibility: 0.23

- `validate_weights(weights: dict[str, float]) -> dict[str, float]`
  - ensure required keys exist
  - ensure weights are >= 0
  - if sum != 1: log error and return early

- Impact magnitude mapping (supports both current seed data and future architecture inputs):
  - current seed (`actions_mitigation_impact.csv`): use `impact_numeric` and/or map `impact_text` (e.g. `very low`, `low`) to a multiplier
  - future (architecture): if a reduction-potential band is provided, map it to a multiplier via an explicit config table

Env (document in `.env.example`):

- `LOG_LEVEL` (already)
- `LOG_DIR` default `logs`
- `ARTIFACT_LOG_JSONL` default `true`
- `OPENROUTER_API_KEY` (for LLM in the future like explanations or semantic search, mappings, etc.)
- `OPENAI_API_KEY` (for embeddings in the future)

---

## 5) Logging, Timing, and Artifacts

Logging:

- Keep using `app/utils/logging_config.py` for root logger setup.
- Extend logging (if needed) to write `${LOG_DIR}/app.log` in addition to console.

Timing:

- `app/utils/timing.py`: `time_block(name: str)` context manager returning elapsed seconds.

Artifacts (JSONL):

- `app/utils/artifacts.py`: `ArtifactWriter` writes `${LOG_DIR}/requests/{request_id}.jsonl`.
- Artifacts are best-effort (do not fail requests if artifact write fails; log the exception).

Minimum artifact events:

- request summary counts
- hard filter discarded action ids and reasons
- per-block score summaries
- final ranked list summary
- timings per block
- data versioning (from API request) - basically a data versioning code to identify city data and acttion data versions

Repo hygiene:

- Add `logs/` to `hiap-meed/.gitignore` and `hiap-meed/.dockerignore`.

---

## 6) Block Implementations (stubs now, stable interfaces)

Each block is a module in `app/modules/prioritizer/blocks/` with a typed `run(...)` function.

### 6.1 Hard Filter (`hard_filter.py`)

Inputs:

- actions (fetched from the Data API)
- exclusions: `request.excluded_action_ids`

Outputs:

- `HardFilterResult`

Stub behavior:

- discard if `action.action_id` is in `request.excluded_action_ids`

Evidence:

- per discarded action include reason (`excluded`) and the matched `action_id`.

### 6.2 Impact (`impact.py`)

Inputs:

- valid actions
- `Action.impacts` (filter `impact_type == "emissions"` as the initial mitigation proxy)

Outputs:

- `BlockScoreResult`

Stub behavior:

- 0.0 score for all actions
- evidence includes counts of `emissions` impacts and whether any GPC references were present

### 6.3 Alignment (`alignment.py`)

Inputs:

- valid actions
- `city: CityData` (optional; can be used later for city strategy signals)
- action attributes: `Action.action_category`, `Action.action_subcategory`, `Action.action_type`

Outputs:

- `BlockScoreResult`

Stub behavior:

- 0.0 score for all actions
- evidence includes which action attributes were present (category/subcategory/type).

### 6.4 Feasibility (`feasibility.py`)

Inputs:

- valid actions
- `city_context: city.city_context` (seeded from `city_context.csv`)

Outputs:

- `BlockScoreResult`

Stub behavior:

- 0.0 score for all actions
- evidence includes counts of city context rows

### 6.5 Final Scoring (`final_scoring.py`)

Inputs:

- valid actions
- pillar score dicts
- weights
- optional `top_n`

Outputs:

- `list[ScoredAction]`

Behavior:

- weighted sum
- sort descending
- assign 1-based rank
- apply `top_n`

---

## 7) Orchestrator Pipeline

Implement in `app/modules/prioritizer/orchestrator.py`:

`run_prioritization(request: PrioritizationRequest, request_id: UUID) -> PrioritizationResponse`

Steps:

1. Fetch `CityData` for `request.locode` from the upstream Data API.
2. Fetch the action catalog (`list[Action]`) from the upstream Data API (cacheable).
3. Resolve weights (defaults + optional override) and validate.
4. Hard filter (exclusions via `request.excluded_action_ids`).
5. Run Impact, Alignment, Feasibility blocks.
6. Final scoring and ranking.
7. Build response metadata: timings, counts, discarded totals, weights used, request_id.

Each step:

- logs start/end
- writes an artifact event (summary only)

---

## 8) API Endpoint

Implement router in `app/modules/prioritizer/api.py`:

- `POST /v1/prioritize`
  - request: `PrioritizationRequest`
  - response: `PrioritizationResponse`
  - generate `request_id` UUID
  - call orchestrator
  - return response

Integrate in `app/main.py`:

- keep existing `/` and `/health` endpoints
- include the prioritizer router

Error behavior:

- log exception with stack trace (no secrets)
- return consistent JSON error payload including `request_id`

---

## 9) External Data Clients (assumed; API-based, no CSV imports)

We will **not** import `hiap-meed/data/*.csv` in the service. Those files are only to inform model fields during early development.

With the current assumption, inputs come from two upstream APIs. Define two Protocols in `app/services/data_clients.py` so the orchestrator can swap implementations (HTTP client, cached client, mock client) without changing block interfaces.

Recommended Protocols:

- `CityDataApiClient`
  - `get_city(locode: str) -> CityData`
- `ActionDataApiClient`
  - `list_actions() -> list[Action]`

Suggested upstream endpoints (informational, not binding):

- City API: `GET /v1/cities/{locode}` -> `CityData`
- Action API: `GET /v1/actions` -> `list[Action]`

You can also check hiap\app\services for example APIs (the provider will be the same, but the endpoints will be different). Orrientate on this and maybe improve the API endpoints and the protocol.

---

## 10) Tests (smoke)

Add `tests/integration/test_prioritize_smoke.py`:

- request with:
  - `locode`
  - 2 actions returned by the `ActionDataApiClient` mock (1 excluded via `excluded_action_ids`)
- assert excluded is discarded and remaining is ranked (present in `ranked_action_ids`)
- assert metadata includes timings and discarded counts

Also update `tests/conftest.py` to avoid `sys.path` hacks once module-run layout is in place.

---

## 11) Definition of Done (scaffold)

- Server runs and accepts `POST /v1/prioritize`
- Returns an ordered list of `action_id` values (`ranked_action_ids`) using stub pillar scores but real weighted ranking
- Writes logs to `${LOG_DIR}/app.log` and request artifacts to `${LOG_DIR}/requests/{request_id}.jsonl` (when enabled)
- Blocks are modular and replaceable
- Weights are adjustable and overrideable per request
- Future work can implement one block at a time without changing API contracts

---

## 12) Implementation Order Checklist

1. Create module skeleton (`app/modules/prioritizer/*`)
2. Add Pydantic models
3. Add config + weight validation + impact mapping
4. Add timing + artifacts utilities
5. Implement hard filter minimal + evidence
6. Implement impact/alignment/feasibility stubs + evidence shape
7. Implement final scoring
8. Implement orchestrator
9. Wire API route into `app/main.py`
10. Add smoke test
11. Update `.env.example`, `.gitignore`, `.dockerignore` for `logs/`

## 13) Important Notes

Do not overengineer the solution. Keep it simple and easy to understand.
Do not integrate needles backwards compatibility logic.
