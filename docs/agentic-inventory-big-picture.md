# Agentic Inventory Drafting Big Picture

## Goal

Ship one focused agentic feature for CityCatalyst: a sector-scoped drafting subpage that helps a user complete the **Stationary Energy** section of a GHGI inventory faster, with visible provenance on every suggestion and explicit user acceptance before anything is committed.

This is not a generalized assistant workspace. It is a drafting mode inside the inventory product.

## Recommended user-facing surface

### Production route

`/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy`

### Entry point

Add a CTA on the existing sector header inside the inventory flow:

- `Let the agent draft this section`
- Supporting copy: `Review every value before saving`

### Why this route shape

- It keeps the flow scoped to one city, one inventory, one sector.
- It avoids overloading Clima AI with a task-specific UI.
- It makes feature-flagging straightforward.
- It lets the legacy inventory form continue untouched for everyone else.

## What the subpage contains

### Primary layout

- Left: the working inventory canvas
- Right: a contained agent rail for progress, decisions, and status

### Canvas behavior

- Render the actual Stationary Energy subsectors inline.
- Show suggested values directly in the form cells.
- Use a dashed draft treatment until the user accepts.
- Keep the source tag visible by default under every drafted value.
- Expand a provenance drawer inline when the user opens a source tag or row.

### Agent rail behavior

- Opening state with the coverage offer
- Working state with progress and log
- Conflict card when sources disagree
- Gap card when no source exists
- Review summary when drafting is complete
- Final confirmation when values are committed

## Reuse vs build

### Reuse

- Existing GHGI inventory routes, schema, and write endpoints
- Existing inventory read state and subsector structure
- Current version history machinery where possible
- Climate Advisor auth, model routing, streaming, and tracing
- Global API and existing source lookup logic
- Bulk inventory creation and third-party combine logic already used for BPJP inventories
- Current feature flag infrastructure

### Build

- New drafting route and page shell
- Sector entry CTA from the current inventory surface
- Inline draft-cell visual pattern
- Provenance drawer for drafted values
- Bulk Filler skill configuration for Climate Advisor
- Proposal staging and audit persistence
- Accept/reject/override actions tied to current write paths

## System integration map

## Implemented API paths

- UI page: `/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy`
- CityCatalyst draft API: `POST /api/v1/inventory/{inventoryId}/draft/stationary-energy`
- CityCatalyst review API: `POST /api/v1/inventory/{inventoryId}/draft/stationary-energy/review`
- Climate Advisor draft API: `POST /v1/inventory-drafts/stationary-energy`
- Source lookup path: `DataSourceService.retrieveGlobalAPISource(source, inventory)` using each approved `source.apiEndpoint` with `:actor_id`, `:locode`, `:country`, `:year`, and `:gpc_reference_number` substituted from the selected city inventory

The page now sends `cityId` to the CityCatalyst draft API. The API verifies that `cityId` matches the inventory's `city_id` before building the Climate Advisor payload.

## Clear responsibility split

### CityCatalyst UI route

Owns:

- The user-facing page at `/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy`
- Feature flag checks
- Auth and permission checks
- Loading the current inventory and sector state
- Showing drafts, conflicts, gaps, and review UI
- Triggering accept, reject, or override actions

Does not own:

- Ranking source candidates
- Generating rationale text for the recommendation
- Choosing between competing source candidates

### CityCatalyst application route

Recommended internal route:

`POST /api/v1/inventory/{inventoryId}/draft/stationary-energy`

Owns:

- Validating the request scope
- Fetching current subsector state from CityCatalyst
- Fetching approved source candidates from Global API and existing bulk-draft data
- Normalizing all candidates into one consistent payload shape
- Sending that normalized payload to Climate Advisor
- Persisting returned proposals into staging
- Writing accepted values through the existing inventory write endpoints

The concrete app service is `AgenticInventoryDraftService`. It loads `Inventory + City`, Stationary Energy subsectors, existing `InventoryValue` rows, applicable `DataSourceI18n` rows, and fetched Global API data before CA receives anything.

Does not own:

- Free-form reasoning about which source is best
- Writing explanation copy for conflicts and gaps

### Climate Advisor

Owns:

- Evaluating normalized source candidates for one sector only
- Choosing the best candidate when one is clearly better
- Returning a default plus alternatives when there is a meaningful conflict
- Returning a gap when no candidate clears the minimum quality bar
- Writing direct, factual explanations for the UI rail

The concrete CA route is `POST /v1/inventory-drafts/stationary-energy`. It accepts `SectorDraftRequest` and returns `SectorDraftLLMOutput`.

Prompt/config assets:

- `climate-advisor/prompts/inventory_bulk_filler.md`
- `climate-advisor/llm_config.yaml` prompt key `inventory_bulk_filler`

Does not own:

- Crawling arbitrary external data sources
- Discovering new sources outside the approved candidate payload
- Deciding which sector to work on
- Writing directly to the inventory database
- Committing values without explicit acceptance

### Source adapters and data layer

Own:

- Pulling from approved sources only
- Mapping raw source records into CityCatalyst subsector codes
- Providing provenance fields such as source name, year, tier, method, citation, and confidence
- Returning all eligible candidates, not just the presumed winner

## Recommended call chain

1. User opens `/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy`.
2. CityCatalyst resolves the city scope from the route and inventory record:
   - `city_id`
   - `city_name`
   - `locode`
   - `country_code`
   - `inventory_year`
3. CityCatalyst reads the current Stationary Energy sector state for that specific city inventory.
4. CityCatalyst fetches allow-listed source candidates for that city and year using city keys such as `city_id`, `locode`, and `country_code`.
5. CityCatalyst filters out candidates that do not match the city scope or that only belong to a broader geography when a better city match exists.
6. CityCatalyst normalizes the remaining city-scoped candidates into one sector payload.
7. CityCatalyst sends that city-scoped payload to Climate Advisor.
8. Climate Advisor evaluates candidates for that city only and returns proposals, conflicts, gaps, and rationale.
9. CityCatalyst stores proposals as drafts on that city inventory.
10. User accepts, overrides, or leaves drafts pending.
11. CityCatalyst commits accepted values through existing write endpoints for that city inventory.

## Where the city is used

The city is not just part of the page URL. It is an explicit key through the whole chain.

### In routing

- `cityId` scopes the page to one city workspace
- `inventoryId` scopes the run to one inventory for that city

### In source lookup

CityCatalyst should query candidate values with city-specific identifiers such as:

- `city_id`
- `locode`
- `country_code`
- `inventory_year`

If a source only provides country or regional data, that record should arrive marked as a weaker geography match.

### In Climate Advisor input

Climate Advisor should receive the city block directly in the payload so it knows:

- which city the draft is for
- which year the draft is for
- which locale to speak in
- which candidate records are exact city matches versus proxies

### In decision-making

Climate Advisor should never compare across cities or search for values outside the provided city scope. It should only rank candidates already filtered for the target city.

### 1. Frontend

Needs:

- New route under the GHGI inventory tree
- New two-column page component
- Inline draft cell component
- Source tag and provenance drawer component
- Conflict card and gap card UI
- Review banner and accept-all interaction

Suggested component slices:

- `DraftingPageLayout`
- `InventoryDraftTable`
- `DraftValueCell`
- `ProvenanceTag`
- `ProvenanceDrawer`
- `AgentRail`
- `ConflictDecisionCard`
- `GapResolutionCard`
- `DraftReviewBanner`

### 2. CityCatalyst app layer

Needs:

- Read current subsector values for the selected inventory
- Read sector completeness and data already entered
- Stage proposed changes separate from committed values
- Write accepted values through the existing inventory endpoints
- Record the resulting accepted changes in version history

Suggested app responsibilities:

- Route orchestration
- Permission checks
- Feature flag checks
- UI state hydration
- Commit orchestration when the user accepts

### 3. Climate Advisor service

Needs:

- One new skill or prompt configuration for Bulk Filler
- Tool access limited to the drafting task
- Locale-aware voice rules
- LangSmith traces for every run

Suggested tools:

- `get_inventory_sector_state`
- `fetch_external_source_candidates`
- `propose_sector_value_with_provenance`

The skill should not behave like a general chat assistant. It should produce structured proposals and deterministic UI-facing decisions.

Preferred architecture:

- Keep raw source fetching and normalization in CityCatalyst or dedicated source adapters.
- Give Climate Advisor a clean, pre-normalized candidate set for each subsector.
- Let Climate Advisor decide among approved candidates rather than searching freely.

### 4. Third-party data layer

Needs:

- A normalized way to fetch candidate values for the selected city-year-sector-subsector
- Access to already existing BPJP bulk inventory outputs where applicable
- Access to source metadata: source name, year, method, tier, confidence, and citation

Probable sources for the pilot:

- SEEG
- ClimateTRACE
- Existing CityCatalyst bulk-created inventory data for Brazilian municipalities

### 5. Audit and persistence

Recommended model: `proposed_changes`

Suggested fields:

- `proposal_id`
- `inventory_id`
- `sector_code`
- `subsector_code`
- `suggested_value`
- `suggested_unit`
- `source_name`
- `source_tier`
- `source_year`
- `source_method`
- `confidence`
- `rationale`
- `alternatives_json`
- `status`
- `accepted_value`
- `accepted_by_user_id`
- `accepted_at`
- `trace_id`

Why this matters:

- Reviewers need to see what was suggested before the final save.
- Conflicts need a durable record of which alternative was chosen.
- Future trust work depends on comparing proposals to accepted edits.

If a full table is too heavy for the first cut, use a session-backed staging object first, but design the UI contract to match a future persisted proposal model.

## What is sent to Climate Advisor

Climate Advisor should receive a sector-scoped payload, not a generic prompt with loose context.

Implemented request model:

- `inventory`: `inventory_id`, `city_id`, `city_name`, `locode`, `country_code`, `year`, `locale`
- `sector`: sector code/name plus Stationary Energy subsectors
- `current_state`: existing values or notation keys for the same city inventory
- `candidates`: approved source options grouped by subsector
- `policy`: allowed source list, conflict threshold, explicit-acceptance flag

Suggested request shape:

```json
{
  "inventory": {
    "inventory_id": "inv_123",
    "city_id": "city_456",
    "city_name": "Quilmes",
    "locode": "AR QLM",
    "country_code": "AR",
    "year": 2023,
    "locale": "es"
  },
  "sector": {
    "code": "I",
    "name": "Stationary Energy",
    "subsectors": [
      { "code": "I.1", "label": "Residential" },
      { "code": "I.2", "label": "Commercial & institutional" },
      { "code": "I.3", "label": "Manufacturing & construction" }
    ]
  },
  "current_state": [
    {
      "subsector_code": "I.1",
      "existing_value": null,
      "notation_key": null,
      "is_locked": false
    }
  ],
  "candidates": [
    {
      "subsector_code": "I.3",
      "options": [
        {
          "source_name": "SEEG",
          "source_id": "datasource_uuid",
          "value": 720,
          "unit": "GWh",
          "year": 2021,
          "tier": 2,
          "method": "activity-based",
          "geography_match": "city_proxy",
          "coverage": "partial",
          "confidence": 0.71,
          "citation": "...",
          "rationale_notes": ["Missing full 2023 industrial breakdown"]
        },
        {
          "source_name": "ClimateTRACE",
          "value": 874,
          "unit": "GWh",
          "year": 2023,
          "tier": 3,
          "method": "direct_measurement",
          "geography_match": "city_direct",
          "coverage": "complete",
          "confidence": 0.82,
          "citation": "..."
        }
      ]
    }
  ],
  "policy": {
    "allowed_sources": ["SEEG", "ClimateTRACE", "BPJP_BULK"],
    "conflict_variance_threshold": 0.15,
    "require_explicit_acceptance": true
  }
}
```

Key point:

Climate Advisor should receive candidate data that is already scoped, normalized, and allow-listed. It should not decide what sources exist by itself.

Important:

That payload is city-specific. `city_id`, `city_name`, `locode`, and `country_code` are first-class fields, not incidental metadata.

## How Climate Advisor decides what to use

Recommended decision policy:

1. Ignore subsectors that are already locked or intentionally completed by the user.
2. Only consider candidates from the allow-listed source set in the payload.
3. Prefer an exact city-year match over a proxy year or incomplete coverage.
4. Prefer an exact city match over country, regional, or modeled proxy data.
5. Prefer better subsector fit over broader sector-level approximations.
6. Prefer stronger method and source tier when coverage is otherwise comparable.
7. Prefer the candidate with the highest confidence after the above checks.
8. If two eligible city-scoped candidates differ beyond the configured variance threshold or imply a real methodology tradeoff, return a conflict instead of silently choosing.
9. If no candidate clears the minimum bar, return a gap.

This means Climate Advisor is deciding among approved options, not searching the world for a number.

## What Climate Advisor returns

Suggested response shape:

```json
{
  "run_id": "ca_run_789",
  "sector_code": "I",
  "proposals": [
    {
      "subsector_code": "I.3",
      "status": "conflict",
      "recommended": {
        "source_id": "datasource_uuid",
        "value": 874,
        "unit": "GWh",
        "source_name": "ClimateTRACE",
        "source_tier": 3,
        "source_year": 2023,
        "method": "direct_measurement",
        "confidence": 0.82
      },
      "alternatives": [
        {
          "source_id": "datasource_uuid",
          "value": 720,
          "unit": "GWh",
          "source_name": "SEEG",
          "source_tier": 2,
          "source_year": 2021,
          "method": "activity-based",
          "confidence": 0.71
        }
      ],
      "rationale": "ClimateTRACE provides direct 2023 coverage; SEEG is missing a full industrial breakdown for 2023.",
      "citation": "...",
      "ui_message": "I used ClimateTRACE by default because it has direct 2023 coverage."
    }
  ],
  "summary": {
    "drafted_count": 4,
    "gap_codes": ["I.5", "I.6"],
    "sources_used": ["SEEG", "ClimateTRACE"]
  }
}
```

The CityCatalyst UI should render this response directly into:

- draft cells
- source tags
- conflict cards
- gap cards
- review summary

## Pydantic models for accept, override, or leave draft

I added a concrete reference model in:

`climate-advisor/service/app/models/draft_review.py`

Key distinction:

- `SectorDraftLLMOutput` is the structured output contract for the LLM inside Climate Advisor.
- `DraftReviewDecision` is the post-LLM review action model that captures what the user did with a draft.

The review decision model is:

```python
class DraftReviewDecision(BaseModel):
    proposal_id: str
    subsector_code: str
    action: DraftReviewActionType  # accept | override | leave_draft
    selected_source_id: Optional[str] = None
    selected_source_name: Optional[str] = None
    override_value: Optional[float] = None
    override_unit: Optional[str] = None
    note: Optional[str] = None
```

Behavior:

- `accept`: keep the recommended draft exactly as returned by CA
- `override`: either choose an alternative source or provide a manual value
- `leave_draft`: persist the proposal in draft state without committing it

The apply request wrapper is:

```python
class ApplyDraftReviewRequest(BaseModel):
    inventory_id: str
    city_id: str
    sector_code: str
    decisions: List[DraftReviewDecision]
```

That separation keeps the ownership clean:

- CA proposes
- CityCatalyst stores drafts
- the user decides accept, override, or leave draft
- CityCatalyst applies the decision

## State model

### 1. Opening

- System announces coverage and expected speed-up
- User chooses all drafts or selected subsectors

### 2. Drafting

- Agent processes one subsector at a time
- Draft cells appear inline
- Progress log updates in the rail

### 3. Conflict

- Agent selects a default
- User can keep the default or switch to the alternative
- Decision is stored

### 4. Gaps

- No-source subsectors are grouped
- User can enter manually, mark Not Estimated, or upload a report

### 5. Review

- User accepts all or reviews row by row
- Drafts remain visually distinct until commit

### 6. Accepted

- Values are written
- Source tags remain visible
- Version history and audit trail are updated

## Recommended implementation sequence

### Sprint 1

- Create the route and page shell
- Render the sector canvas with inline draft visuals
- Connect read-only inventory state
- Connect source fetching and proposal generation for Stationary Energy
- Show proposals in UI without committing
- Trace runs in LangSmith

Exit condition:

One internal operator can open a real BPJP city inventory, trigger drafting, and watch Stationary Energy fill with proposals.

### Sprint 2

- Add conflict and gap flows
- Add persistent proposal staging
- Add accept/reject/edit actions
- Commit accepted values through current write paths
- Capture audit data and version history integration

Exit condition:

One internal operator and one city contact can complete the full review-and-accept loop end to end.

## Deliberate constraints

Keep the first release narrow:

- One module: GHGI inventories
- One sector: Stationary Energy
- One pilot geography: Brazilian BPJP
- One task: draft values faster with provenance

Do not expand scope in the MVP to:

- multi-skill agent workspaces
- Clima AI general chat enhancements
- other sectors
- other modules
- cross-module orchestration
- visual polish that does not increase trust or task speed

## Open decisions

### Entry point

Per-sector CTA is the stronger default because it keeps the offer contextual and avoids making the user choose a sector before they see the relevant page.

### Draft persistence

Persistent drafts are safer than auto-commit. Reviewers should be able to see that a sector is still in proposed state.

### Time-saved metric

Keep the metric only if it is backed by a simple estimation rule. Otherwise use a qualitative summary such as `4 subsectors drafted`.

## Deliverables created in this repo

- Static showcase route: `app/src/app/docs/agentic-inventory`
- Architecture brief: `docs/agentic-inventory-big-picture.md`

The showcase route is intentionally seeded and static. It demonstrates the product shape and interaction model without any API or LLM dependency.
