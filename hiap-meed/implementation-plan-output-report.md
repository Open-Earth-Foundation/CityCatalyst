# City Action Report Endpoint Implementation Plan

## Goal

Add a new `hiap-meed` endpoint that generates a City Action Report for ranked mitigation actions. The report is a per `(city x action)` output plan based on the current City Action Report Notion template and should be technically usable before the final wording, prompts, and chapter details are locked.

The existing `/v1/prioritize` endpoint already computes most of the ranking and evidence needed for the report, but the current public response does not expose every field the report examples use. The first implementation should therefore separate:

- deterministic report context assembly
- chapter-scoped LLM generation
- final report response rendering
- open product decisions around stateless input replay versus persisted report data

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

- whether to compare similar actions in the report or keep that as app UX
- no reliable per-action city-level `tCO2e` estimate yet
- legal data does not cover permits or SEIA applicability
- risk register, governance actor map, and monitoring should stay lightweight unless product wants deeper outputs

## Proposed Endpoint Shape

Recommended first endpoint:

`POST /v1/reports/city-action`

Alternative names to confirm with product/frontend:

- `POST /v1/output-plan`
- `POST /v1/action-report`
- `POST /v1/prioritize/reports`

Recommended first response:

```json
{
  "reports": [
    {
      "locode": "CL ZAL",
      "action_id": "icare_0040",
      "format": "markdown",
      "chapters": [
        {
          "key": "snapshot",
          "title": "Snapshot",
          "markdown": "..."
        }
      ],
      "markdown": "...",
      "metadata": {
        "frontend_request_id": "...",
        "internal_request_id": "...",
        "source_prioritization_request_id": "...",
        "generated_languages": ["en"],
        "source_freshness": {
          "mode": "live_refetch",
          "possibly_changed_since_prioritization": true,
          "checked_against_prioritization_snapshot": false,
          "warnings": [
            "Report data was fetched live and may differ from the data used for the original prioritization run."
          ]
        },
        "warnings": [],
        "data_gaps": []
      }
    }
  ]
}
```

Recommended request, stateless variant:

```json
{
  "meta": {
    "requestId": "...",
    "generatedAtUtc": "...",
    "backendConsumer": "...",
    "upstreamProvider": "...",
    "apiContext": {
      "endpoint": "POST /v1/reports/city-action",
      "locodes": ["CL ZAL"]
    },
    "totalRecords": 1
  },
  "requestData": {
    "requestedLanguages": ["en"],
    "reportFormat": "markdown",
    "selectedActionIds": ["icare_0040"],
    "prioritizationRequest": { "...original /v1/prioritize request..." },
    "prioritizationResponse": { "...prioritize response..." },
    "frontendReportContext": {
      "cityDisplayName": "Valdivia",
      "regionDisplayName": "Los Rios region",
      "additionalNotes": []
    }
  }
}
```

The request should not require both `prioritizationRequest` and `prioritizationResponse` forever. That is an open product/API decision. For the first technical pass, accepting both makes the endpoint reproducible without backend storage.

Minimal stateless request variant:

```json
{
  "meta": {
    "requestId": "...",
    "generatedAtUtc": "...",
    "backendConsumer": "...",
    "upstreamProvider": "...",
    "apiContext": {
      "endpoint": "POST /v1/reports/city-action",
      "locodes": ["CL ZAL"]
    },
    "totalRecords": 1
  },
  "requestData": {
    "locode": "CL ZAL",
    "actionId": "icare_0040",
    "language": "en"
  }
}
```

This minimal request is feasible if the report endpoint refetches the required city, action, policy, legal, mitigation-feasibility, and financial-feasibility data. It should be framed as "generate a current action report" rather than "reproduce the exact report for the prioritization result the user just saw" unless a persisted run ID or ranking snapshot is also supplied.

## State Management Options

### Option A: Persist Data For Reporting

Store enough request/response context when `/v1/prioritize` runs, then the report endpoint can accept a `prioritizationRunId` plus selected action IDs.

Pros:

- frontend does not need to resend large ranking payloads
- report generation can use the exact original run context
- easier audit trail and artifact lookup
- better UX if users return later or regenerate a report

Cons:

- changes `hiap-meed` from stateless API to stateful service
- needs storage lifecycle, retention, privacy, cleanup, and access decisions
- existing local/MLflow artifacts are observability artifacts, not a product data store
- requires product decision on report history and whether reports are user-visible durable objects

Implementation direction if chosen:

- add a small persistence layer for prioritization report contexts
- store normalized `ReportContext`, not arbitrary full logs
- keep MLflow/local artifacts as debugging mirrors, not the primary read path
- return `prioritizationRunId` from `/v1/prioritize`
- add `GET /v1/prioritize/runs/{id}` only if frontend needs readback

### Option B: Keep Backend Stateless And Frontend Resends Context

The report endpoint accepts the relevant prior request/response data and any missing frontend-held display context.

Pros:

- matches current service posture
- fastest first implementation
- no new database or retention policy
- easiest to run in existing deployment model

Cons:

- larger request bodies
- frontend must preserve the data needed for report generation
- if `/v1/prioritize` response omits needed fields, either the frontend cannot provide them or the report endpoint must refetch upstream data
- harder to regenerate old reports unless frontend stores them

Implementation direction if chosen:

- define a strict `CityActionReportApiRequest`
- validate that selected action IDs exist in the supplied ranking
- refetch missing source data through existing data clients when needed
- return explicit `data_gaps` when a section cannot be fully supported

### Recommendation For First Build

Start with a minimal stateless live-refetch variant, but design the service around a normalized internal `ReportContext`. If product later chooses persistence, only the context source changes:

- stateless live-refetch source: build `ReportContext` from `locode`, `actionId`, `language`, and data-client refetches
- stateless replay source: build `ReportContext` from supplied prioritization request/response plus optional refetches
- persisted source: load `ReportContext` by run ID from a database such as Postgres

This avoids coupling prompt generation directly to frontend payload shape.

The first implementation should introduce a `ReportContextProvider`-style boundary even if it only has one concrete live-refetch implementation at first. Later persistence can then add a `PostgresReportContextProvider` without restructuring chapter prompts, report generation, or response assembly.

### Freshness And Staleness Flags

If the report endpoint refetches data from live upstream APIs, the response should include explicit freshness metadata:

- `source_freshness.mode`: `live_refetch`, `frontend_snapshot`, or `persisted_snapshot`
- `source_freshness.possibly_changed_since_prioritization`: `true` when no persisted/supplied prioritization snapshot was compared
- `source_freshness.checked_against_prioritization_snapshot`: whether the service had an original snapshot and compared source metadata
- `source_freshness.changed_sources`: source names whose timestamps, ETags, release IDs, or generated-at metadata differ from the supplied/persisted prioritization snapshot
- `source_freshness.warnings`: frontend-displayable warnings

With a minimal request, the backend usually cannot prove whether data changed because it has no original ranking snapshot. In that case, set `possibly_changed_since_prioritization=true` and explain that the report uses current upstream data.

If a later persisted ranking context exists, compare stored source metadata against freshly fetched source metadata. The comparison should use stable source metadata where available, for example upstream `generated_at_utc`, S3 ETag/LastModified, release IDs, or source URLs.

### User-Specific Ranking Context Caveat

With only `locode`, `actionId`, and `language`, the report endpoint loses user-specific ranking context unless it is supplied or loaded from persistence:

- weights override
- excluded actions
- city strategic preference sectors
- city strategic preference timeframes
- city strategic preference co-benefits
- original `topN`
- original requested languages
- frontend-provided city emissions payload

That may be acceptable for an action report, but the report should not overclaim ranking-run fidelity. It can explain why the action is relevant and feasible using current data, but it cannot fully explain why it appeared at a specific rank in a specific user run unless the original ranking context is supplied or persisted.

## Data Availability By Chapter

### 1. Snapshot

Needed:

- city display name, locode, region, country
- selected action name and ID
- one-line readings for climate benefit, fit, policy backing, legal room, funding, track record
- signal tension
- the ask

Available now:

- locode from ranking metadata
- action ID, rank, final score, block scores
- legal verdict and legal reasoning from ranked action feasibility evidence
- funding route/reason partly from financial feasibility evidence
- policy score category internally from alignment evidence
- city name and region internally from `CityData`

Gaps / needs:

- public `/v1/prioritize` response does not include action name, action type, sector, subsector, description, investment cost, or timeline for ranked actions
- public response does not expose city name or region
- track record / comparable project count is not in the ranking response
- "the ask" likely needs a deterministic rule plus prompt wording, and may need product input

Plan:

- build snapshot from `ReportContext`, not directly from `RankedActionResult`
- derive signal labels with deterministic score-to-band helpers
- generate tension and ask as chapter text using curated fields
- flag missing track-record data until a source is wired

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

- ranked action response only exposes `action_id`, not action details
- sector/subsector labels may need mapping from `Action.emissions` and existing sector/subsector utilities

Plan:

- add a report context builder that joins ranked actions with action pathway records by `action_id`
- do not require the frontend to fabricate action details
- include localized names/descriptions later if report language support expands

### 3. Action Impact

Needed:

- qualitative mitigation potential
- co-benefits
- policy measure/target alignment
- why it matters for the city

Available now:

- impact score and compact impact evidence in public response
- richer impact evidence internally/artifacts includes matched subsectors and subsector contributors
- action co-benefits exist in `Action.co_benefits`
- policy evidence exists internally through action policy scores

Gaps / needs:

- public response does not include full co-benefits or full impact evidence
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

- mitigation feasibility score and rank are available internally
- mitigation feasibility `breakdown` and `dimension_scores` are available internally
- `CityData.city_context` carries local indicator rows

Gaps / needs:

- public ranking response only exposes compact mitigation feasibility fields, not the detailed indicator table used in examples
- mapping local indicators into "support" versus "limit" statements requires either existing upstream breakdown semantics or a new deterministic interpretation layer

Plan:

- include detailed mitigation feasibility breakdown in `ReportContext`
- start with deterministic selection of top supporting and limiting indicators
- let the LLM only turn selected indicators into concise prose
- return `data_gaps` if no city-context indicators are available

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

- public `evidence_summary.alignment` currently includes only compact scores, not full policy evidence
- coverage note likely needs document metadata from policy evidence
- report examples include page references and quote-like summaries, so this section depends on upstream policy evidence quality

Plan:

- report endpoint should refetch policy scores or receive full policy evidence in a report context
- enforce a strict prompt rule: only cite policy statements present in `policy_evidence`
- if no policy evidence exists, output a limited backing note rather than invented policy text

### 6. Legal Mandate & Delivery

Needed:

- legal verdict
- what the city can and cannot do alone
- lead actor and coordination required
- legal basis/laws

Available now:

- ranked action feasibility evidence includes legal verdict, ownership, restrictions, legal justification, and references
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

- public financial feasibility evidence includes route, reason, sector, score presence, and component score
- internal grouped feasibility evidence includes financial `inputs` and `links`
- README notes the first financial feasibility implementation consumes compact batch evidence only and does not fetch linked named opportunities or projects

Gaps / needs:

- public response drops financial `inputs` and `links`
- reachable funds and comparable projects shown in examples are not guaranteed in current ranking response
- comparable project count/source likely requires an additional upstream data source

Plan:

- include route/reason in first implementation
- expose/refetch financial `inputs` and `links` if they contain fund/project references
- otherwise mark funds and precedents as additional required data
- generate a conservative suggested pathway from legal verdict, funding route, and action type

### 8. Where The Information Comes From

Needed:

- reference list with links
- analyst figures / underlying scores
- data gaps and limitations

Available now:

- source metadata exists across city, action pathway, legal, policy, mitigation feasibility, and financial feasibility clients
- ranked action scores and metadata are available
- local/MLflow artifacts already capture full request/response and step details

Gaps / needs:

- source metadata is not consistently exposed in the public response
- final report needs a user-facing source list, not raw debug metadata

Plan:

- normalize source metadata into a report `sources` list
- include analyst figures in a dedicated appendix-like chapter
- include deterministic data gaps from the context builder before LLM generation

## Additional Data Inputs To Flag

These are not fully available from the current public ranking response:

- action name, description, type, sector/subsector, investment cost, implementation timeline
- city display name, region, country display name, and city local indicator rows
- full policy evidence including document names, pages, signal types, quotes/summaries, finding counts, and document counts
- full mitigation feasibility breakdown and local indicator interpretation
- financial fund links, named reachable funds, and comparable precedent projects
- source links in a user-facing citation format
- report-level product wording for "the ask", "track record", and standard caveats
- optional frontend context such as selected report language, selected actions, user-edited assumptions, or report audience

These are missing or weaker when the request is minimal and no persisted ranking snapshot exists:

- original rank and final score from the user-visible ranking
- original ranking weights and preference inputs
- original frontend city emissions payload used by impact scoring
- original excluded/removed action context
- exact explanation text generated by `/v1/prioritize`
- proof that the action was in the user's returned `topN`
- proof that live upstream data is identical to the data used during prioritization
- deterministic comparison against alternatives in the same ranking run

Possible ways to supply them:

- refetch with existing data clients inside the report endpoint
- extend `/v1/prioritize` response with a richer `report_context` block
- ask frontend to resend the original request and response plus display context
- persist normalized report context from `/v1/prioritize`

## Architecture Recommendation

Do not start with LangGraph.

The first implementation can stay simpler:

1. `api.py`: add `POST /v1/reports/city-action`
2. `models.py`: add request/response DTOs for report generation
3. `services/report_context.py`: build a normalized `ReportContext`
4. `services/report_generation.py`: generate chapter text
5. `prompts/city_action_report_*.md`: define chapter prompt templates
6. `orchestrator` or a new `report_orchestrator.py`: coordinate selected actions, artifacts, timings, and warnings

Keep context retrieval behind a small provider interface:

```python
class ReportContextProvider(Protocol):
    def build_context(self, request: CityActionReportApiRequest) -> ReportContext:
        ...
```

Initial provider:

- `LiveRefetchReportContextProvider`: builds context from `locode`, `actionId`, and current upstream API data.

Later providers:

- `SnapshotReportContextProvider`: builds context from frontend-supplied prioritization request/response.
- `PersistedReportContextProvider`: loads a stored prioritization/report context from Postgres or another durable store.

The chapter generation service should accept only `ReportContext`, never raw API-client responses or database rows.

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

LangGraph may become useful later if product wants:

- human review loops per chapter
- async/background generation
- conditional chapter branching
- resumable workflow state
- tool calls that fetch different sources per chapter
- retries and validation with more complex dependency graphs

For now, a plain Python orchestrator with per-chapter functions is easier to test, easier to read, and consistent with the current `hiap-meed` service style.

## LLM Strategy

Avoid writing the full report in one go.

First implementation:

- deterministic context builder prepares facts and gaps
- deterministic label helpers convert scores to qualitative bands
- chapter prompts receive constrained context
- LLM returns structured chapter output
- backend assembles final markdown
- backend records `data_gaps`, prompt inputs, and chapter outputs as artifacts

Suggested chapter grouping:

- deterministic/no LLM or light LLM: The Action, Where the Information Comes From
- LLM chapter generation: Snapshot, Action Impact, City Fit, Policy Backing, Legal Mandate & Delivery, Financing/Pathway

Validation rules:

- no citations or claims outside supplied context
- no quantified city-level emissions unless a source field explicitly provides it
- no permit/SEIA claims unless new data exists
- legal blocked/conditional/enabled language must match legal verdict
- policy quotes must come from policy evidence
- funds/projects must come from supplied finance/precedent context

## Implementation Phases

### Phase 1: Contract And Context Builder

- Add report request/response models in `app/modules/prioritizer/models.py`.
- Add internal `ReportContext` models, likely in a new `app/modules/prioritizer/report_models.py` or `internal_models.py` if kept small.
- Build context from:
  - minimal `locode`, `actionId`, and `language`
  - optional supplied prioritization request/response
  - selected action IDs
  - action pathway refetch
  - city data refetch
  - policy score refetch
  - feasibility score refetches where needed
- Add `source_freshness` metadata to report responses.
- Add a context-provider boundary so future persisted contexts do not require prompt or chapter-generation rewrites.
- Return a context-only debug mode if useful for early frontend integration.

### Phase 2: Deterministic Chapter Inputs

- Create chapter input builders.
- Add score-to-label helpers for:
  - climate benefit
  - city fit
  - policy backing
  - legal room
  - funding outlook
  - track record when data exists
- Add explicit `data_gaps` and `limitations` before prompt generation.

### Phase 3: Chapter Generation Service

- Add `services/report_generation.py`.
- Add prompt files for system prompt and per-chapter report instructions.
- Use OpenAI structured outputs, following the existing explanation-generation pattern.
- Generate each selected action report independently.
- Store per-chapter prompt and output artifacts.

### Phase 4: API Route, Artifacts, And Observability

- Add `POST /v1/reports/city-action` in `api.py`.
- Use `ArtifactWriter` with `request_kind="city_action_report"`.
- Add MLflow tags/params:
  - endpoint
  - selected action count
  - generated chapter count
  - requested languages
  - source prioritization request ID if supplied
- Write artifacts:
  - `input_snapshot.json`
  - `report_context.json`
  - `llm/<chapter>_prompt.txt`
  - `llm/<chapter>_io.json`
  - `response_full.json`
  - `manifest.json`

### Phase 5: Tests

- Unit-test context builder joins selected ranked actions with fetched action/city/policy/finance records.
- Unit-test data-gap behavior when policy, finance, or city-context details are missing.
- Unit-test legal verdict wording guardrails.
- Unit-test score-to-label helpers.
- Integration-test endpoint with mock clients and one selected action.
- Integration-test multiple selected actions to confirm per-action isolation.
- Add prompt/service tests with mocked OpenAI client responses.

Focused command shape:

```powershell
uv run --directory hiap-meed pytest tests/unit/test_report_context.py tests/unit/test_city_action_report_generation.py tests/integration/test_city_action_report_api.py -q
```

## Product Follow-Up Questions

1. Should the report endpoint generate one report per selected ranked action, or one combined report for all `topN` actions?
2. Should frontend select which ranked actions become reports, or should backend default to all returned `topN`?
3. Do we want report generation to be stateless for the first release, or should `/v1/prioritize` create a durable run/report context ID?
4. If stateless, can the frontend preserve and resend the full prioritize request/response, or should the backend refetch everything from locode/action IDs?
5. Should generated reports be persisted and retrievable later, or are they immediate outputs only?
6. Which output format is needed first: markdown, structured JSON chapters, PDF-ready HTML, or all of these?
7. Is the report language always English initially, or should it follow `requestedLanguages`?
8. Should report text include analyst figures in the body, an appendix, or only metadata?
9. What is the approved wording for "the ask" and should it be deterministic by legal/funding route?
10. Should comparable actions/projects be in the report now, or deferred to frontend exploration as the Notion open item suggests?
11. Which source owns reachable funds and comparable projects if they are not already in compact financial feasibility evidence?
12. Are policy quotations acceptable from upstream extracted evidence, or does product require exact verbatim document excerpts with page citations?
13. Should users be allowed to edit assumptions before generation?
14. How should we handle a legally blocked action that still ranks highly because other signals are strong?
15. What report caveats must be mandatory across all outputs?
16. Is it acceptable for the first report to use current refetched data with a freshness warning, even if it may differ from the original ranking run?
17. If the frontend cannot persist ranking payloads, should backend persistence be part of the next milestone immediately after the stateless slice?

## Key Design Decisions To Keep Open

- Stateless replay versus persisted report context
- endpoint naming
- selected actions versus all top-N actions
- markdown-only response versus structured chapters plus rendered markdown
- whether to extend `/v1/prioritize` with report-ready fields
- whether finance/precedent data needs a new upstream client
- whether the first implementation should generate reports synchronously or queue background jobs

## Recommended First Slice

Build the smallest useful vertical slice:

1. Stateless `POST /v1/reports/city-action`
2. Minimal request with `locode`, `actionId`, and `language`
3. English markdown plus structured chapter list
4. Backend refetches action, city, policy, mitigation feasibility, and financial feasibility context through existing clients
5. Response includes `source_freshness` warnings because data may have changed since prioritization
6. Context-provider boundary in place from day one
7. Per-chapter generation with strict data-gap handling
8. No LangGraph yet
9. Explicit warnings for missing funds, precedents, quantified emissions, permits, full policy citations, and missing ranking-run context

This gets the technical foundation in place while leaving the product-sensitive choices visible. The likely next milestone is backend persistence, probably Postgres-backed, for ranking/report contexts if the frontend cannot reliably keep and resend the ranking snapshot.
