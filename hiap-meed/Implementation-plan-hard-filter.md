# Implementation plan: Hard Filter block (`hiap-meed/app/modules/prioritizer/blocks/hard_filter.py`)

## Goal

Extend the Hard Filter block to match the architecture and Notion “Data Reviews” intent:

- **Gate 1**: Explicit city exclusions (provided as free text by the frontend; **stubbed for now**)
- **Gate 2**: **Hard legal requirements** (if not satisfied → remove before scoring)

Inputs and behaviors must align with:

- `hiap-meed/docs/detailed-block-architecture.md` (Hard Filter Architecture)
- Notion “Data Reviews” page: `https://www.notion.so/openearth/Data-Reviews-2eceb557728b808e9537da57340bf43a`
  - Especially the “Regulations and Mandates” section and the child page “How Legal Signals, Policy Signals, and Socioeconomic Indicators Work in HIAP Ranking”.

## Current state (repo)

- The frontend request payload provides exclusions as `FrontendCityInput.excludedActionsFreeText` (free text).
- `hard_filter.run(actions, excluded_actions_free_text)` now receives free text directly.
- The Hard Filter block is already split into two explicit sub-filters:
  - `_apply_free_text_exclusion_filter(...)`
  - `_apply_legal_hard_filter(...)`
- Free-text exclusions are currently **stubbed**:
  - `_resolve_excluded_action_ids_from_text(...)` returns an empty set, so no actions are excluded yet from free text.
- Legal hard filtering is currently **stubbed**:
  - `_apply_legal_hard_filter(...)` does not discard actions yet and marks evidence with `legal_filter_status = "not_applied_stub"`.
- `HardFilterResult` currently has no explicit bucket for “discarded due to legal mismatch”.
- The orchestrator calls hard filter before scoring and attaches `hard_filter_result.evidence[action_id]` into the final response evidence.

Relevant files:

- `hiap-meed/app/modules/prioritizer/blocks/hard_filter.py`
- `hiap-meed/app/modules/prioritizer/internal_models.py`
- `hiap-meed/app/modules/prioritizer/orchestrator.py`
- `hiap-meed/app/services/data_clients.py`
- `hiap-meed/tests/integration/test_prioritize_smoke.py`

## Available legal data in this repo (mock + models)

Mock payload:

- `hiap-meed/data/mock/actions_legal_api_mock.json`
  - `legal_requirements[]`: `{ action_id, requirements[] }`
  - Requirement fields include:
    - `strength`: `mandatory | required | recommended | optional | informational`
    - `alignment_status`: `aligns | not_aligned | no_evidence`
    - plus `signal_code`, `signal_name`, `operator`, values, evidence IDs, scope metadata

DTOs already exist in:

- `hiap-meed/app/modules/prioritizer/models.py`
  - `LegalRequirement`, `LegalRequirementsByAction`, `ActionsLegalApiResponse`

Note: Notion uses a conceptual `hard | soft | constraint` strength scale. The repo mock uses the 5-level scale above. This plan maps those to “hard gate” behavior without introducing new external dependencies.

## Target behavior specification (repo-aligned, next increment)

### Hard legal requirement mapping (to implement next)

Define “hard legal requirements” as:

- `strength in {"mandatory", "required"}`

Hard legal gate evaluation per action:

- **Pass (clean)**: all hard requirements have `alignment_status == "aligns"`
- **Pass (unknown flagged)**: one or more hard requirements have `alignment_status == "no_evidence"` and none are `not_aligned`
  - Result: action is **kept**, but the unknown requirement(s) are surfaced in `HardFilterResult.evidence` for frontend flagging
- **Fail**: any hard requirement has `alignment_status == "not_aligned"`
  - Result: action is **discarded** (not sent to scoring blocks)

Handling missing legal data:

- If no legal requirements are available for an action (no record), treat as **no hard requirements** and **pass**.
  - Rationale: prevents missing upstream enrichment from blocking the pipeline during development.

### Evidence contract (Hard Filter)

`HardFilterResult.evidence[action_id]` should be expanded to be explicit and UI-friendly:

- For excluded actions:
  - `discard_reason`: `"excluded"`
  - `matched_excluded_action_id`: `<action_id>`
- For legal discards:
  - `discard_reason`: `"legal_hard_requirement_failed"`
  - `failed_requirements`: list of (signal_code, strength, alignment_status, required_value, legal_signal_value, evidence_ids, evidence_count, location_scope, location_name)
  - Summary fields (always included when legal requirements are provided to the block):
    - `hard_requirements_checked_count`: number of hard requirements evaluated
      - Useful for debugging “why did this get blocked?” and for monitoring coverage (how many actions actually have hard legal gates configured).
    - `hard_requirements_failed_count`: number of hard requirements with `alignment_status == "not_aligned"`
      - Useful for UI messaging (“blocked by 1 hard legal condition”) and for QA to spot overly strict or misconfigured requirements.
- For actions that pass:
  - `discard_reason`: `None`
  - Legal trace fields (always included when legal requirements are provided to the block):
    - `hard_requirements_checked_count`: number of hard requirements evaluated
      - Useful to distinguish “no requirements configured” vs “requirements configured and passed”.
    - `unknown_requirements`: list of hard requirements with `alignment_status == "no_evidence"`
      - Useful for frontend flagging (“legal unknown”) and user workflows to request missing evidence.
    - `hard_requirements_unknown_count`: number of hard requirements with `alignment_status == "no_evidence"`
      - Useful for summary UI and monitoring/QA (legal signal coverage by theme/action family).

Note:
- Non-blocking legal constraints / implementation notes (Notion “constraint”) are intentionally **not** emitted by the Hard Filter block in this plan.
- They should be derived and attached later in the **Feasibility** stage as feasibility evidence (and potentially as a feasibility modifier), because they do not determine eligibility.

## Internal contracts to introduce / update

### 1) Add internal legal requirement model

Add a small internal model in `hiap-meed/app/modules/prioritizer/internal_models.py` used between orchestrator and block:

- `HardFilterLegalRequirement`
  - `signal_code: str`
  - `signal_name: str`
  - `operator: str`
  - `required_value: str | None`
  - `legal_signal_value: str | None`
  - `strength: str`
  - `alignment_status: str`
  - `location_scope: str | None`
  - `location_name: str | None`
  - `evidence_ids: list[str] = Field(default_factory=list)`
  - `evidence_count: int = 0`

Motivation:

- Keep blocks dependent on **internal contracts** (consistent with existing `Action`, `CityData`, `HardFilterResult`).
- Avoid importing external DTOs directly into block logic.

### 2) Extend `HardFilterResult`

Update `HardFilterResult` in `internal_models.py`:

- Add `discarded_legal: list[Action] = Field(default_factory=list)`

Counts should be surfaced in orchestrator metadata similarly to `discarded_excluded`.

## Block API changes

### Update `hard_filter.run()` signature

Proposed signature:

```python
def run(
    actions: list[Action],
    excluded_actions_free_text: str | None,
    legal_requirements_by_action_id: dict[str, list[HardFilterLegalRequirement]] | None = None,
) -> HardFilterResult:
    ...
```

Notes:

- `excluded_actions_free_text` is the frontend source input.
- `excluded_action_ids` is an **internal, resolved** exclusion set produced inside the block.
  - Source of truth from frontend is `excludedActionsFreeText` (free text).
  - Current implementation plan: resolve free text → IDs is a **stub** returning an empty set (no exclusions).
  - Future implementation plan: semantic matching over action name/description (and/or a curated mapping table) to derive a concrete `excluded_action_ids` set.

Backward compatibility note:

- Call sites can pass `None` during rollout; in that case legal gate is skipped (no legal discards).

## Pipeline plumbing plan

The orchestrator currently does not fetch legal data. To enable real legal hard filtering:

### 1) Add legal client interface + stub

In `hiap-meed/app/services/data_clients.py`:

- Add `LegalDataApiClient` with method:
  - `get_action_legal_requirements(self, locode: str) -> dict[str, list[HardFilterLegalRequirement]]`
- Add `StubLegalDataApiClient` returning `{}` by default (keeps pipeline working without legal enrichment)
- Add a file-backed mock implementation that reads:
  - `hiap-meed/data/mock/actions_legal_api_mock.json`
  - Parses it (using `ActionsLegalApiResponse` from `hiap-meed/app/modules/prioritizer/models.py`)
  - Converts it into the internal mapping:
    - `dict[action_id -> list[HardFilterLegalRequirement]]`
- Add an API-backed implementation `ApiLegalDataApiClient` (placeholder for now):
  - For now it can return `{}` (no legal enrichment), but it must exist so the service can already be configured to use the `api` code path.
  - Later it will implement the real HTTP call and parse the upstream payload into the same internal mapping shape.
- Add dependency provider `get_legal_data_api_client()` that selects mock vs stub vs api via env var, e.g.:
  - `HIAP_MEED_LEGAL_DATA_SOURCE=mock|stub|api` (default `mock` for local dev until real API integration is ready)
  - Use `pathlib.Path` to locate the mock file via a repo-root-relative path derived from `__file__`.

### 2) Inject legal client into API route

In `hiap-meed/app/modules/prioritizer/api.py`:

- Add dependency injection for legal client
- Pass into `run_prioritization(...)`

### 3) Update orchestrator to fetch + pass legal requirements

In `hiap-meed/app/modules/prioritizer/orchestrator.py`:

- Fetch legal requirements:
  - `legal_requirements_by_action_id = legal_data_api_client.get_action_legal_requirements(request.locode)`
- Call hard filter with legal requirements
- Update artifact event + response metadata counts:
  - add `discarded_legal`

## Test plan (integration)

Update `hiap-meed/tests/integration/test_prioritize_smoke.py`:

- Add `MockLegalDataApiClient` and override the new dependency (same pattern as city/actions).
- Add a new test verifying hard legal discards (once legal data wiring is added):
  - Arrange two actions: `A_ok`, `A_blocked`
  - Provide legal requirements:
    - for `A_blocked`: one requirement with `strength="mandatory"` and `alignment_status="not_aligned"`
    - for `A_ok`: either no hard requirements or all `aligns`
  - Assert:
    - response `ranked_action_ids` excludes `A_blocked`
    - `metadata.counts.discarded_legal == 1`

- Add a second test where `alignment_status="no_evidence"` is **kept** and `metadata.counts.discarded_legal == 0`, while `hard_filter` evidence for that action includes `unknown_requirements`.

## Documentation updates (after implementation)

After code is implemented and tests pass:

- Update `hiap-meed/docs/detailed-block-architecture.md`:
  - Implementation status table:
    - Hard Filter | Legal requirement check → **Implemented**

## Rollout steps (suggested)

1. Add internal model + `HardFilterResult.discarded_legal`.
2. Implement legal gate in `hard_filter.py` with `legal_requirements_by_action_id` input.
3. Add legal client interface + stub + DI wiring.
4. Update orchestrator to fetch/pass legal data and report counts.
5. Add integration test(s).
6. Update architecture doc status.

