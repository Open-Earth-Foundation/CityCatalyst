# City Action Report Endpoint Implementation Plan

## Goal

Add a new `hiap-meed` endpoint that generates a City Action Report for ranked mitigation actions. The report is a per `(city x action)` output plan based on the current City Action Report Notion template and should be technically usable before the final wording, prompts, and chapter details are locked.

The existing `/v1/prioritize` endpoint already computes most of the ranking and evidence needed for the report, but the current public response does not expose every field the report examples use. The first implementation should therefore separate:

- deterministic report context assembly
- chapter-scoped LLM generation
- final report response rendering
- stateless snapshot replay from frontend-held prioritization data
- CityCatalyst-owned persistence outside `hiap-meed`

## Source Template

Template reviewed: Notion page `City Action Report`, under `CityCatalyst > Pilots > HIAP v3 / MEED+ > Data Reviews`.

Current structure:

1. Snapshot
2. The Action
3. Action Impact
4. City Fit
5. Policy Backing
6. Legal Mandate & Delivery
7. Financing, Precedents & Pathway
8. Where the Information Comes From

The template also flags open items:

- comparable action/project comparison is deferred to frontend exploration for now; the backend can query a future comparable-actions/projects endpoint when it exists
- no reliable per-action city-level `tCO2e` estimate yet
- legal data does not cover permits or SEIA applicability
- risk register, governance actor map, and monitoring should stay lightweight unless product wants deeper outputs

## Proposed Endpoint Shape

Endpoint:

`POST /v1/reports/output-plan`

The endpoint generates one output plan for one selected action. If the frontend wants plans for multiple actions, it should call this endpoint once per action so each plan gets its own isolated context and LLM generation. This avoids mixing evidence across actions and avoids putting many ranked actions into one large context window.

Recommended first response:

```json
{
  "locode": "CL ZAL",
  "action_id": "icare_0040",
  "language": "en",
  "format": "json_chapters_markdown",
  "chapters": [
    {
      "key": "snapshot",
      "title": "Snapshot",
      "markdown": "..."
    }
  ],
  "metadata": {
    "frontend_request_id": "...",
    "internal_request_id": "...",
    "source_prioritization_request_id": "...",
    "source_context": {
      "ranking_basis": "frontend_prioritization_snapshot",
      "additional_context_basis": "live_backend_refetch",
      "staleness_evaluated": false,
      "staleness_notes": [
        "Ranking-specific context came from the frontend snapshot. Additional report context was fetched live by the backend."
      ]
    },
    "required_sources_ok": true,
    "limitations": []
  }
}
```

The response is structured JSON. Each chapter contains its own Markdown body. There is no separate top-level Markdown field in the first contract; a complete document can be assembled by concatenating chapters in order if a caller needs one.

Recommended request, stateless snapshot-replay variant:

```json
{
  "meta": {
    "requestId": "...",
    "generatedAtUtc": "...",
    "backendConsumer": "...",
    "upstreamProvider": "...",
    "apiContext": {
      "endpoint": "POST /v1/reports/output-plan"
    },
    "totalRecords": 1
  },
  "requestData": {
    "locode": "CL ZAL",
    "actionId": "icare_0040",
    "language": "en",
    "prioritizationSnapshot": {
      "request": {
        "...full original /v1/prioritize request...": "..."
      },
      "response": {
        "...full /v1/prioritize response returned to the frontend...": "..."
      },
      "storedAtUtc": "..."
    }
  }
}
```

For the prototype, the frontend should send the full data returned by `/v1/prioritize`, including rankings, ranked actions, removed actions, explanations, score/evidence summaries, metadata, and any other response fields available to the user. It should also send the original `/v1/prioritize` request, which already contains the input snapshot used for ranking, including emissions profile, city data, preferences, weights, exclusions, requested languages, and other request fields that influenced the ranking.

This lets the report use the same ranking basis as the prioritization result while keeping `hiap-meed` stateless. The backend should still query additional source data for report sections because the frontend does not receive every upstream field needed by the output-plan template.

The request must include `locode`, `actionId`, and `language` in `requestData` because these are domain inputs, not metadata. The `meta` envelope should stay aligned with existing caller metadata where possible: `requestId`, `generatedAtUtc`, `backendConsumer`, `upstreamProvider`, `apiContext.endpoint`, and `totalRecords`. The current `/v1/prioritize` request uses `apiContext.locodes` because it can carry multiple cities in `requestData.cityDataList`; the output-plan request is intentionally single-city, so `locode` belongs in `requestData`.

The backend should validate that `locode` matches the selected city in the supplied prioritization snapshot and that `actionId` exists in the supplied ranking for that city. The requested report `language` is an output choice. If it was not part of the original prioritization request's `requestedLanguages`, the backend should keep a limitation/warning note rather than reject the request.

If `locode`, `actionId`, `language`, or the required prioritization snapshot is missing or malformed, the backend should reject the request with a clear 4xx response instead of falling back to a current-data-only report.

## State Management Decision

`hiap-meed` stays stateless. It does not persist prioritization snapshots, report snapshots, generated reports, or report history as product data.

For the prototype, the frontend stores the prioritization snapshot in browser `localStorage` and resends it to `POST /v1/reports/output-plan` together with one `locode`, one `actionId`, and one `language`. Later, when the external frontend moves into CityCatalyst, CityCatalyst should store the prioritization/report snapshot in its own database, likely Postgres, and still send the required snapshot data to `hiap-meed` in the report request.

MLflow and local artifacts may still record request/response details for observability and debugging, but they are not the product read path and should not be treated as durable report storage.

The backend should:

- define a strict `CityActionReportApiRequest`
- require one `locode`, one `actionId`, one `language`, and a full `prioritizationSnapshot`
- validate that the selected action exists in the supplied ranking
- validate that the supplied snapshot and response refer to the same locode, ranking run, and action where those fields are present
- warn, but do not reject, when the requested report language was not part of the original prioritization request's `requestedLanguages`
- reject missing or malformed snapshots with a clear 4xx error
- build a normalized internal `ReportContext` so frontend snapshot replay and future CityCatalyst database snapshots feed the same report-generation pipeline

## Snapshot, Live Enrichment, And Staleness

The output plan uses two data sources:

- Ranking context from the frontend-supplied prioritization snapshot: rank, scores, explanations, removed actions, user preferences, weights, exclusions, emissions profile, requested languages, original `topN`, and related request metadata.
- Additional report context from live backend refetches: action details, city attributes, policy evidence, legal details, mitigation feasibility context, financial feasibility context, and later comparable actions/projects when that endpoint exists.

This means the response should not present a single freshness mode like `frontend_snapshot`. Instead, metadata should separate the ranking basis from the live enrichment basis, for example:

```json
{
  "source_context": {
    "ranking_basis": "frontend_prioritization_snapshot",
    "additional_context_basis": "live_backend_refetch",
    "staleness_evaluated": false,
    "changed_sources": []
  }
}
```

The first implementation should fetch the additional backend context every time because the frontend does not receive every upstream field needed for the report.

Staleness warnings are deferred until the team decides which metadata should be compared. Once that rule exists, the frontend should show a warning when current data has diverged from the stored prioritization snapshot. Until then, document the need and keep enough metadata in the response to support the future warning.

If a required backend API call fails or returns an invalid response, the endpoint should fail clearly instead of silently producing a weak report. If a working API simply has sparse data for the first implementation, the report should stay conservative and avoid unsupported claims; data quality can improve later.

## Data Availability By Chapter

Each chapter should be built from a normalized `ReportContext` with two inputs:

- frontend snapshot data for the selected action's ranking-specific context
- backend live refetches for richer source data that was not returned to the frontend

The LLM should only receive the selected action's curated chapter context. It should not receive the full ranking list or multiple selected actions in one prompt.

### 1. Snapshot

Needed:

- city display name, locode, region, country
- selected action name and ID
- one-line readings for climate benefit, fit, policy backing, legal room, funding, track record
- signal tension
- the ask

Available now:

- frontend snapshot provides locode, selected action ID, rank, final score, block scores, ranking explanation, preferences, requested language context, and original `topN`
- live backend refetch provides city display data, action metadata, policy details, legal details, mitigation feasibility details, and financial feasibility details

Gaps / needs:

- "the ask" likely needs a deterministic rule plus prompt wording, and may need product input
- track record / comparable project count is deferred until a comparable-actions/projects endpoint exists

Plan:

- build snapshot from `ReportContext`, not directly from `RankedActionResult`
- derive signal labels with deterministic score-to-band helpers
- generate tension and ask as chapter text using curated fields
- omit track-record detail from the first version or keep it generic until a real source is wired

### 2. The Action

Needed:

- name and ID
- type, sector, subsector
- description
- investment-cost band
- implementation timeline

Available now:

- internal `Action` has `action_name`, `action_id`, `action_type`, `description`, `investment_cost`, `implementation_timeline`, `emissions`, and co-benefits
- action pathway client can refetch the action catalog

Gaps / needs:

- sector/subsector labels may need mapping from `Action.emissions` and existing sector/subsector utilities

Plan:

- add a report context builder that joins the selected snapshot action with action pathway records by `action_id`
- do not require the frontend to fabricate action details
- include localized names/descriptions later if report language support expands

### 3. Action Impact

Needed:

- qualitative mitigation potential
- co-benefits
- policy measure/target alignment
- why it matters for the city

Available now:

- impact score, compact impact evidence, and explanation are available from the frontend snapshot
- richer impact evidence internally/artifacts includes matched subsectors and subsector contributors
- action co-benefits exist in `Action.co_benefits`
- policy evidence can be live-refetched through action policy scores

Gaps / needs:

- no reliable city-specific per-action `tCO2e`; template says qualitative impact is expected
- policy targets/quotes need full policy evidence, not just score components

Plan:

- keep output qualitative
- use action-library impact band if available in action raw/emissions data
- use impact score bands as fallback
- include a standard method caveat when no quantified city-level impact exists

### 4. City Fit

Needed:

- overall fit label
- local conditions that support the action
- local conditions that limit the action

Available now:

- frontend snapshot provides the selected action's mitigation feasibility score, rank context, and explanation where returned by `/v1/prioritize`
- live backend refetch can provide mitigation feasibility `breakdown`, `dimension_scores`, and `CityData.city_context` indicator rows

Gaps / needs:

- mapping local indicators into "support" versus "limit" statements requires either existing upstream breakdown semantics or a new deterministic interpretation layer

Plan:

- include detailed mitigation feasibility breakdown in `ReportContext`
- start with deterministic selection of top supporting and limiting indicators
- let the LLM only turn selected indicators into concise prose
- keep the output conservative if city-context indicators are sparse

### 5. Policy Backing

Needed:

- policy alignment label
- evidence base: finding and document counts
- quoted commitments, targets, monitoring, pages
- coverage note

Available now:

- `ActionPolicyScoreRecord` has `policy_support_score`, `policy_support_category`, `n_findings`, `n_docs`, `best_relevance`, and `policy_evidence`
- alignment block evidence carries policy evidence internally

Gaps / needs:

- coverage note likely needs document metadata from policy evidence
- exact page references and quote-like summaries depend on upstream policy evidence quality

Plan:

- report endpoint should live-refetch policy scores and policy evidence
- enforce a strict prompt rule: only cite policy statements present in `policy_evidence`
- implement a minimal version first; if policy evidence is sparse, produce a conservative policy-backing section rather than invented policy text

### 6. Legal Mandate & Delivery

Needed:

- legal verdict
- what the city can and cannot do alone
- lead actor and coordination required
- legal basis/laws

Available now:

- frontend snapshot can include ranked action feasibility evidence with legal verdict, ownership, restrictions, legal justification, and references
- backend can live-refetch legal details where the report needs fields not returned to the frontend
- removed actions include legal evidence when legal hard-filtered

Gaps / needs:

- permits / SEIA applicability are not available
- "who leads" is partly inferable from legal ownership/restrictions but may require prompt conventions or a product-approved actor taxonomy

Plan:

- use existing legal fields directly
- include a standard caveat that permit/SEIA applicability is out of scope unless new legal data is added
- generate "can do / needs coordination" from ownership and restrictions descriptions
- do not override a `blocked` verdict with optimistic language

### 7. Financing, Precedents & Pathway

Needed:

- funding outlook and route
- reachable funds with links
- comparable projects
- suggested pathway / next steps

Available now:

- frontend snapshot can include compact financial feasibility evidence such as route, reason, sector, score presence, and component score
- internal grouped feasibility evidence includes financial `inputs` and `links`
- README notes the first financial feasibility implementation consumes compact batch evidence only and does not fetch linked named opportunities or projects

Gaps / needs:

- reachable funds and comparable projects shown in examples are not guaranteed in the frontend snapshot
- comparable project count/source is deferred until a new comparable-actions/projects endpoint exists

Plan:

- live-refetch financial feasibility context in the first implementation
- include route/reason in the first implementation
- use financial `inputs` and `links` if they contain fund/project references
- defer comparable actions/projects until the future endpoint exists, then query it live as additional report context
- generate a conservative suggested pathway from legal verdict, funding route, and action type

### 8. Where The Information Comes From

Needed:

- reference list with links
- analyst figures / underlying scores
- source status and limitations

Available now:

- source metadata exists across city, action pathway, legal, policy, mitigation feasibility, and financial feasibility clients
- ranked action scores and metadata are available
- local/MLflow artifacts already capture full request/response and step details

Gaps / needs:

- final report needs a user-facing source list, not raw debug metadata

Plan:

- normalize source metadata into a report `sources` list
- include analyst figures in a dedicated appendix-like chapter
- distinguish runtime errors from sparse-but-valid source data

## Additional Data Inputs To Flag

Expected frontend-supplied prototype inputs:

- full `/v1/prioritize` response as returned to the frontend, including rankings, actions, explanations, removed actions, score/evidence summaries, metadata, generated timestamps, and request IDs
- original `/v1/prioritize` request payload
- emissions profile used by prioritization
- city data used by prioritization
- preferences, weights, excluded actions, strategic sectors, timeframes, co-benefit preferences, requested languages, and original `topN`
- one selected `actionId`
- one report `language`

These should be live-refetched by the backend because they are not fully available in the frontend snapshot or need richer source context:

- action name, description, type, sector/subsector, investment cost, implementation timeline
- city display name, region, country display name, and city local indicator rows
- full policy evidence including document names, pages, signal types, quotes/summaries, finding counts, and document counts
- full mitigation feasibility breakdown and local indicator interpretation
- financial fund links, named reachable funds, and comparable precedent projects
- source links in a user-facing citation format
- report-level product wording for "the ask", "track record", and standard caveats
- optional frontend context such as user-edited assumptions or report audience if product later decides to support these fields

Do not ask the frontend to fabricate missing source data. The frontend supplies the ranking snapshot; the backend owns additional source lookups.

## Architecture Recommendation

The first implementation can stay simple:

1. `api.py`: add `POST /v1/reports/output-plan`
2. `models.py`: add request/response DTOs for report generation
3. `report_context.py` or `internal_models.py`: define normalized `ReportContext` models and pure builders
4. `services/report_context_enrichment.py`: fetch live backend context from external/upstream APIs and merge it into `ReportContext`
5. `services/report_generation.py`: call the LLM to generate chapter text from curated chapter inputs
6. `prompts/city_action_report_*.md`: define chapter prompt templates
7. `orchestrator` or a new `report_orchestrator.py`: coordinate one selected action, live enrichment, LLM generation, artifacts, timings, and errors

Use `services/` only for code that talks to external services or provider clients. In this feature, live data enrichment belongs in `services/` because it calls upstream API clients, and report generation belongs in `services/` because it calls the LLM provider. Pure `ReportContext` models, validation helpers, and chapter input builders should live in module-level models/builders or small local helper modules, not in `services/`.

Keep context retrieval behind a small provider interface:

```python
class ReportContextProvider(Protocol):
    def build_context(self, request: CityActionReportApiRequest) -> ReportContext:
        ...
```

Initial context provider:

- `SnapshotEnrichedReportContextProvider`: builds context from the frontend-supplied prioritization request, prioritization response, one `locode`, one `actionId`, one `language`, and live backend refetches.

The provider can live in `services/report_context_enrichment.py` because it orchestrates upstream API reads. The pure normalization functions it uses should remain small and testable outside `services/`.

The chapter generation service should accept only chapter input models derived from `ReportContext`, never raw API-client responses or database rows.

Use a chapter registry instead of one giant prompt:

```python
REPORT_CHAPTERS = [
    "snapshot",
    "the_action",
    "action_impact",
    "city_fit",
    "policy_backing",
    "legal_mandate_delivery",
    "financing_precedents_pathway",
    "sources_assumptions",
]
```

Each chapter receives only its curated context slice. This keeps token use predictable, makes failures isolated, and lets us regenerate one chapter later without rewriting the full report.

A plain Python orchestrator with per-chapter functions is consistent with the current `hiap-meed` service style.

### Chapter Module Contract

Each report chapter should have a clear, modular implementation contract:

- one chapter input model that contains only the curated fields needed by that chapter
- one chapter output model with `key`, `title`, `markdown`, and optional `source_refs` / `limitations`
- one prompt file or deterministic builder per chapter, not one monolithic report prompt
- one chapter builder function that maps `ReportContext` into the chapter input model
- one generator function that accepts the chapter input model and returns the chapter output model
- unit tests for each chapter input builder and each chapter output contract

Every chapter builder and generator function must have a docstring that states:

- which Notion template section it implements
- which inputs it expects from the prioritization snapshot
- which inputs it expects from live backend enrichment
- which Notion template items are intentionally missing or deferred in the first implementation
- which unsupported claims the prompt must not make

Prompt files should follow the repository prompt conventions: explicit role/task/input/output sections, constrained use of supplied evidence, and a stable output contract. The implementation should follow [AGENTS.md](AGENTS.md) and [.cursor/rules/general.mdc](../.cursor/rules/general.mdc): keep the code simple, use module-level models, use absolute imports, add docstrings to all functions, add short logical block comments in non-trivial orchestration functions, avoid unnecessary abstraction, and update README/service documentation when behavior changes.

## LLM Strategy

Avoid writing the full report in one go.

First implementation:

- deterministic context builder prepares facts, source status, and limitations
- deterministic label helpers convert scores to qualitative bands
- chapter prompts receive constrained context
- LLM returns structured chapter output
- backend returns structured JSON with Markdown chapter bodies
- backend records source status, prompt inputs, and chapter outputs as artifacts

Suggested chapter grouping:

- deterministic/no LLM or light LLM: The Action, Where the Information Comes From
- LLM chapter generation: Snapshot, Action Impact, City Fit, Policy Backing, Legal Mandate & Delivery, Financing/Pathway

Validation rules:

- no citations or claims outside supplied context
- no quantified city-level emissions unless a source field explicitly provides it
- no permit/SEIA claims unless new data exists
- legal blocked/conditional/enabled language must match legal verdict
- policy quotes must come from policy evidence
- funds/projects must come from supplied or refetched finance/precedent context

## Implementation Phases

### Phase 1: Contract And Context Builder

- Add report request/response models in `app/modules/prioritizer/models.py`.
- Add internal `ReportContext` models, likely in a new `app/modules/prioritizer/report_models.py` or `internal_models.py` if kept small.
- Add pure context builders that normalize:
  - required `locode`
  - required `actionId`
  - required `language`
  - required prototype `prioritizationSnapshot.request`
  - required prototype `prioritizationSnapshot.response`
- Add `services/report_context_enrichment.py` for live enrichment from upstream clients:
  - live action pathway refetch
  - live city data refetch
  - live policy score/evidence refetch
  - live legal, mitigation feasibility, and financial feasibility refetches
- Add `source_context` metadata to report responses with separate ranking and live-enrichment basis fields.
- Add a context-provider boundary so future CityCatalyst database snapshots can still arrive through the same request contract.
- Return a context-only debug mode if useful for early frontend integration.

### Phase 2: Deterministic Chapter Inputs

- Create chapter input builders.
- Create one input model per chapter, scoped to only the fields that chapter needs.
- Create one output model per chapter with `key`, `title`, `markdown`, and optional `source_refs` / `limitations`.
- Add score-to-label helpers for:
  - climate benefit
  - city fit
  - policy backing
  - legal room
  - funding outlook
  - track record when data exists
- Add explicit source-status checks and limitations before prompt generation.
- Add docstrings to all chapter builder functions that state covered Notion fields, snapshot inputs, live-enrichment inputs, missing/deferred Notion fields, and unsupported claims.

### Phase 3: Chapter Generation Service

- Add `services/report_generation.py`.
- Keep this in `services/` because it calls the LLM provider; pure Markdown assembly and chapter ordering helpers should stay outside the service if they do not call external providers.
- Add prompt files for system prompt and per-chapter report instructions.
- Keep prompts modular: one prompt or deterministic builder per chapter, each with explicit role/task/input/output sections and a stable output contract.
- Use OpenAI structured outputs, following the existing explanation-generation pattern.
- Generate one selected action report per request.
- Store per-chapter prompt and output artifacts.

### Phase 4: API Route, Artifacts, And Observability

- Add `POST /v1/reports/output-plan` in `api.py`.
- Use `ArtifactWriter` with `request_kind="city_action_report"`.
- Add MLflow tags/params:
  - endpoint
  - selected action ID
  - generated chapter count
  - report language
  - source prioritization request ID if supplied
- Write artifacts:
  - `input_snapshot.json`
  - `report_context.json`
  - `llm/<chapter>_prompt.txt`
  - `llm/<chapter>_io.json`
  - `output_plan.md`
  - `response_full.json`
  - `manifest.json`

### Phase 5: Tests

- Unit-test context builder joins the selected ranked action with fetched action/city/policy/legal/finance records.
- Unit-test request validation for missing `locode`, missing `actionId`, missing `language`, malformed snapshot, city mismatch, and action not found in the supplied ranking.
- Unit-test required live-source failure behavior.
- Unit-test sparse-but-valid source behavior, ensuring the report stays conservative without turning normal sparse data into runtime warnings.
- Unit-test legal verdict wording guardrails.
- Unit-test score-to-label helpers.
- Integration-test endpoint with mock clients and one selected action.
- Integration-test multiple frontend-selected actions as separate endpoint calls to confirm per-action isolation.
- Add prompt/service tests with mocked OpenAI client responses.

### Phase 6: Documentation

- Document that the implementation follows `hiap-meed/AGENTS.md` and `.cursor/rules/general.mdc`, including simple module boundaries, docstrings, absolute imports, logging, and focused tests.
- Document the per-chapter module contract: prompt, input model, output model, source expectations, and Notion-template coverage/missing items.
- Add backend documentation that explains staleness checks are not fully implemented in the first slice and must be discussed with product before finalizing.
- Document that report generation uses the frontend prioritization snapshot plus live backend enrichment, so future staleness checks need agreed comparison rules and metadata.
- Document the expected frontend/CityCatalyst responsibility: store the original prioritization snapshot, track if user inputs changed afterward, and show a staleness warning once product defines the warning behavior.
- Add this as a follow-up implementation task in the relevant README or service docs, not only in this implementation plan.

Focused command shape:

```powershell
uv run --directory hiap-meed pytest tests/unit/test_report_context.py tests/unit/test_city_action_report_generation.py tests/integration/test_city_action_report_api.py -q
```

## Resolved Decisions And Deferred Topics

Resolved decisions:

- Generate one report per selected action.
- The frontend selects which action gets a report.
- The endpoint is `POST /v1/reports/output-plan`.
- The request contains one `actionId`, one `language`, and the full prioritization snapshot.
- The first snapshot schema is raw request/response pass-through plus frontend-held input data, not a normalized `report_context`.
- `hiap-meed` returns immediate outputs only and does not persist generated reports as product data.
- Later persistence belongs in CityCatalyst's database, not in `hiap-meed`.
- The response is JSON with ordered chapters and Markdown chapter bodies.
- Report language is an output choice; if it differs from the original prioritization `requestedLanguages`, the backend should include a limitation/warning note rather than reject the request.
- Comparable actions/projects are deferred. When the future endpoint exists, the report endpoint should query it live as additional context.
- Policy backing should start with a minimal evidence-grounded version.
- User-edited assumptions are a frontend concern; the backend only validates and uses the request it receives.
- Legally blocked high-ranking actions are not a special report-generation problem; the report should accurately reflect the legal verdict in the supplied/refetched evidence.
- Missing or malformed snapshots should be rejected with a clear 4xx response.

Deferred topics:

- Exact frontend staleness warning copy and metadata comparison rules.
- Approved wording for "the ask".
- Mandatory report caveats.
- Whether report generation should stay synchronous or move to background jobs if latency becomes too high.

## Recommended First Slice

Build the smallest useful vertical slice:

1. Stateless `POST /v1/reports/output-plan`
2. Request includes one `actionId`, one `language`, and the full frontend-held prioritization snapshot
3. JSON response with ordered chapters and Markdown chapter bodies
4. Backend builds ranking-run context from the supplied `/v1/prioritize` request, `/v1/prioritize` response, emissions profile, city data, and preferences
5. Backend always refetches additional action, city, policy, legal, mitigation feasibility, and financial feasibility context for the selected action
6. Response metadata separates ranking basis from live enrichment basis through `source_context`
7. Context-provider boundary in place from day one
8. Per-chapter generation with strict context slicing
9. Clear 4xx errors for invalid frontend snapshots and clear failures for required backend source errors
10. Conservative output when working sources contain sparse data

## Frontend Changes To Keep In Mind

The frontend code is outside this repository, but the report endpoint depends on the following frontend behavior:

1. Store a prioritization snapshot after every successful `/v1/prioritize` call. In the prototype this can stay in browser `localStorage`; after the external frontend is moved into CityCatalyst, store the snapshot in the CityCatalyst database.
2. The snapshot should contain the full `/v1/prioritize` response, the full `/v1/prioritize` request, emissions profile, city data, preferences, weights, exclusions, requested languages, original `topN`, generated timestamps, and request IDs.
3. When the user generates a report, send the stored snapshot plus one `actionId` and one `language` to `POST /v1/reports/output-plan`.
4. If the user selects multiple actions, call the endpoint separately for each action.
5. Render only `chapters[].markdown` as the user-facing report body. The concatenated `output_plan.md` artifact is the same reader-facing content for QA and export checks.
6. Treat response metadata, `source_context`, chapter `limitations`, local artifacts, and MLflow artifacts as diagnostic/source-status data unless product explicitly approves specific copy for the UI.
7. Do not reconstruct the snapshot by live-querying current frontend state unless the UX clearly says the report is based on current data, not the earlier prioritization.
8. Track whether inputs changed after the stored prioritization snapshot. The exact staleness warning is deferred, but the frontend should eventually warn if agreed metadata shows divergence.
9. Keep the backend contract stateless from the frontend perspective: the backend receives report inputs in the request and can query additional source data where needed, but it should not depend on browser storage, CityCatalyst storage, or a specific frontend persistence implementation.
