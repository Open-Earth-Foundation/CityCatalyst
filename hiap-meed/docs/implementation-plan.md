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
      repositories.py              # NEW (protocols only; DB integration later)
    modules/
      __init__.py                  # NEW
      meed_prioritizer/
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
- Absolute imports only: `from app.modules.meed_prioritizer.models import ...`.
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

Implement in `app/modules/meed_prioritizer/models.py`.

### 3.1 Domain inputs (architecture-aligned)

Action
- `action_id: UUID`
- `action_name: str`
- `sector_names: list[str]`
- `subsector_names: list[str]`
- `timeline_for_implementation: str | None`
- `co_benefits: dict[str, int] | None`
- `socioeconomic_fit_rules: dict[str, object] | None`

CityStrategicPreferences (used by Hard Filter + Alignment)
- `scope: str` (e.g. `CL`, `CL-RM`, or city code)
- `excluded_actions: list[str]`
- `priority_sectors: list[str]`
- `political_priorities: list[str]`

CityGHGIActivity
- `gpc_refno: str`
- `emissions_tco2e: float`
- `inventory_year: int | None`

ActionMitigationImpact
- `action_id: UUID`
- `gpc_refno: str`
- `reduction_potential_band: str | None`

PolicySignal
- `policy_signal_id: str`
- `signal_type: str`
- `signal_code: str`
- `actor_scope: str`
- `source_name: str | None`

ActionPolicySignal
- `action_id: UUID`
- `policy_signal_id: str`
- `relation_type: str` (`supports|targets|funds|constrains`)

LegalSignal
- `signal_code: str`
- `signal_value: str | bool | int | float | None`
- `scope: str` (includes `CL` baseline and overlays)
- `confidence_tier: str | None`

ActionLegalRequirement
- `action_id: UUID`
- `signal_code: str`
- `operator: str | None` (start with `eq`)
- `required_value: str | bool | int | float | None`
- `strength: str` (`hard|soft|constraint`)

CityMitigationSocioEconomicIndicatorValue
- `indicator_key: str`
- `bucket_value: str` (`very_low|low|moderate|high|very_high`)

### 3.2 Pipeline outputs

BlockScoreResult
- `score_by_action_id: dict[UUID, float]`
- `evidence_by_action_id: dict[UUID, dict[str, object]] | None`

HardFilterResult
- `valid_actions: list[Action]`
- `discarded_excluded: list[Action]`
- `discarded_legal: list[Action]`
- `evidence: dict[UUID, dict[str, object]]`

ScoredAction
- `action: Action`
- `impact_score: float`
- `alignment_score: float`
- `feasibility_score: float`
- `final_score: float`
- `rank: int`
- `evidence: dict[str, object]`

### 3.3 API models

PrioritizationRequest
- `city_preferences: CityStrategicPreferences`
- `actions: list[Action]`
- `ghgi_activities: list[CityGHGIActivity] = []`
- `action_mitigation_impacts: list[ActionMitigationImpact] = []`
- `policy_signals: list[PolicySignal] = []`
- `action_policy_signals: list[ActionPolicySignal] = []`
- `legal_signals: list[LegalSignal] = []`
- `action_legal_requirements: list[ActionLegalRequirement] = []`
- `socioeconomic_indicators: list[CityMitigationSocioEconomicIndicatorValue] = []`
- `weights_override: dict[str, float] | None = None`
- `top_n: int | None = None`

PrioritizationResponse
- `scored_actions: list[ScoredAction]`
- `metadata: dict[str, object]` (request_id, timings, counts, discarded totals, weights used)

Validation rules:
- Lists default to empty, but types are validated strictly.
- Weights are validated/normalized in a single config function.

---

## 4) Configuration (weights, mappings, env)

Implement in `app/modules/meed_prioritizer/config.py`:

- Default weights:
  - impact: 0.55
  - alignment: 0.22
  - feasibility: 0.23

- `validate_weights(weights: dict[str, float]) -> dict[str, float]`
  - ensure required keys exist
  - ensure weights are >= 0
  - if sum != 1: log warning and normalize (default choice)

- Reduction potential band multiplier mapping (explicit mapping; bands are strings)

Env (document in `.env.example`):
- `LOG_LEVEL` (already)
- `LOG_DIR` default `logs`
- `ARTIFACT_LOG_JSONL` default `true`

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

Repo hygiene:
- Add `logs/` to `hiap-meed/.gitignore` and `hiap-meed/.dockerignore`.

---

## 6) Block Implementations (stubs now, stable interfaces)

Each block is a module in `app/modules/meed_prioritizer/blocks/` with a typed `run(...)` function.

### 6.1 Hard Filter (`hard_filter.py`)

Inputs:
- actions
- city exclusions: `CityStrategicPreferences.excluded_actions`
- hard legal requirements: `ActionLegalRequirement` filtered to `strength == "hard"`
- applicable legal signals: `LegalSignal` (scoped to `CL` baseline plus overlays)

Outputs:
- `HardFilterResult`

Stub behavior:
- discard if `action.action_name` is in exclusions
- hard legal check (placeholder):
  - if an action has hard requirements and there is no matching `LegalSignal.signal_code`, discard
  - later implement operator/value comparisons

Evidence:
- per discarded action include reason (`excluded` or `hard_legal_missing_signal`) and relevant codes.

### 6.2 Impact (`impact.py`)

Inputs:
- valid actions
- `CityGHGIActivity`
- `ActionMitigationImpact`
- band -> multiplier mapping
- timeline preference placeholder

Outputs:
- `BlockScoreResult`

Stub behavior:
- 0.0 score for all actions
- evidence includes number of mapped activities and reduction band availability

### 6.3 Alignment (`alignment.py`)

Inputs:
- valid actions
- policy signals + mappings
- city preferences
- action co-benefits

Outputs:
- `BlockScoreResult`

Stub behavior:
- 0.0 score for all actions
- evidence includes count of mapped signals and whether action sectors intersect priority sectors

### 6.4 Feasibility (`feasibility.py`)

Inputs:
- valid actions
- legal signals
- soft/constraint legal requirements
- socio-economic indicator buckets
- action socio-economic fit rules

Outputs:
- `BlockScoreResult`

Stub behavior:
- 0.0 score for all actions
- evidence includes counts of indicators and requirements considered

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

Implement in `app/modules/meed_prioritizer/orchestrator.py`:

`run_prioritization(request: PrioritizationRequest, request_id: UUID) -> PrioritizationResponse`

Steps:
1. Resolve weights (defaults + optional override) and normalize/validate.
2. Hard filter (exclusions + hard legal).
3. Run Impact, Alignment, Feasibility blocks.
4. Final scoring and ranking.
5. Build response metadata: timings, counts, discarded totals, weights used, request_id.

Each step:
- logs start/end
- writes an artifact event (summary only)

---

## 8) API Endpoint

Implement router in `app/modules/meed_prioritizer/api.py`:

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

## 9) Storage Layer Placeholder (interfaces only)

Create `app/services/repositories.py` with Protocols (no DB wiring yet):
- `ActionRepository`
- `SignalRepository`
- `CityRepository`

---

## 10) Tests (smoke)

Add `tests/integration/test_prioritize_smoke.py`:
- request with 2 actions, 1 excluded by name
- empty signals
- assert excluded is discarded and remaining is scored
- assert metadata includes timings and discarded counts

Also update `tests/conftest.py` to avoid `sys.path` hacks once module-run layout is in place.

---

## 11) Definition of Done (scaffold)

- Server runs and accepts `POST /v1/prioritize`
- Returns ranked list with stub pillar scores but real weighted ranking
- Writes logs to `${LOG_DIR}/app.log` and request artifacts to `${LOG_DIR}/requests/{request_id}.jsonl` (when enabled)
- Blocks are modular and replaceable
- Weights are adjustable and overrideable per request
- Future work can implement one block at a time without changing API contracts

---

## 12) Implementation Order Checklist

1. Create module skeleton (`app/modules/meed_prioritizer/*`)
2. Add Pydantic models
3. Add config + weight validation + band mapping
4. Add timing + artifacts utilities
5. Implement hard filter minimal + evidence
6. Implement impact/alignment/feasibility stubs + evidence shape
7. Implement final scoring
8. Implement orchestrator
9. Wire API route into `app/main.py`
10. Add smoke test
11. Update `.env.example`, `.gitignore`, `.dockerignore` for `logs/`
