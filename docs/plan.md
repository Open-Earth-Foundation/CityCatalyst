# Agentic Stationary Energy Plan

## Purpose

Build the first production-ready agentic inventory workflow for CityCatalyst:
a Stationary Energy drafting flow that helps a user complete one GHGI sector
faster, while keeping every data-changing action behind explicit review.

This plan merges the earlier inventory big-picture and current-flow notes into
one implementation overview. The broader architecture target remains in
`docs/AgenticModuleScope.md`; this document describes the first practical slice
of that architecture.

## Scope

In scope:

- GHGI inventories only.
- Stationary Energy only.
- Multi-city and multi-inventory selection before a run starts.
- One selected city, one selected inventory, and one sector per draft run.
- Drafting values from approved, city-scoped source candidates.
- Showing provenance, conflicts, and gaps before anything is saved.
- User review before committing values to the inventory.

Out of scope for this slice:

- General Clima AI chat changes.
- Multi-module agent workspaces.
- Other GHGI sectors.
- HIAP, CCRA, organization, or project workflows.
- Autonomous writes to inventory data.
- Arbitrary source discovery by the model.

## Current Approach Architecture

The first implementation should reuse the systems that already exist instead
of introducing a broad new service boundary.

- Reuse the existing CityCatalyst to Climate Advisor connection.
- Reuse the Climate Advisor database to store draft runs, draft proposals, and
  user decisions before final save.
- Add a city and inventory selection page so the user can choose the target
  workflow scope.
- Add an agentic decisions page aligned with the CityCatalyst visual style.
- Add a draft review page where the user reviews decisions before saving.
- Add feature flags in both CityCatalyst and Climate Advisor. The workflow
  should stay hidden and disabled by default so it does not interfere with the
  current product state while the pilot is being built.
- Implement the first pieces of the ideal architecture, but limit them to
  Stationary Energy:
  - capability wrappers
  - capability registry
  - context loaders
  - confirmation and staging model

The source of truth for committed inventory data remains CityCatalyst. Climate
Advisor can stage drafts and explain decisions, but CityCatalyst applies final
accepted changes through existing inventory write paths.

### Current Implementation Status

The repository is currently CA-heavy.

- Implemented now in Climate Advisor: feature-flag parsing, draft routes for
  start/status/retry/review, the draft workflow service, the draft repository,
  CA database models and migration, the Stationary Energy LLM proposal service,
  thread-context integration, and the CityCatalyst client methods for token
  refresh, allowed-capabilities lookup, and bounded context loading.
- Not yet implemented in CityCatalyst: the Stationary Energy UI pages, the CC
  capability registry/context-loader files, the CC capability routes under
  `/api/v1/internal/ca/capabilities/*`, and the final CC-side commit path for
  accepted rows.
- Because of that split, the current code can persist and review Stationary
  Energy drafts in CA, but the full CC-side commit flow is still the next
  addition.

## Product Shape

### Entry Point

Support two entry paths:

- a multi-city launcher page where the user chooses an accessible city and
  eligible inventory
- a contextual CTA on the Stationary Energy sector page when the user is
  already inside one inventory

Contextual CTA:

- Label: `Let the agent draft this section`
- Supporting copy: `Review every value before saving`

The workflow should still feel like CityCatalyst product navigation, not a
separate assistant workspace.

### Pages

Use one selector route plus scoped routes under the selected city and
inventory:

- City and inventory selection page:
  `/{lng}/GHGI/draft/stationary-energy`

- Agentic decisions page:
  `/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy`
- Draft review page:
  `/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy/review`

The selection page is where the user picks the target city and inventory. The
decisions page is where the user sees source coverage, recommendations,
conflicts, and gaps. The review page is where the user accepts, overrides, or
leaves draft proposals before anything is written to the inventory.

### Decisions Page

The page should show:

- The current Stationary Energy subsectors.
- Existing committed values, if any.
- Draftable rows.
- Source candidates and provenance.
- Recommendation rationale.
- Conflicts where sources disagree.
- Gaps where no approved source clears the minimum bar.
- A clear transition into review.

The page should feel like a CityCatalyst workflow page, not like a generic chat
panel. The agentic layer is a task-specific decision rail beside the inventory
canvas.

### Review Page

The review page should show a durable summary of the staged draft:

- recommended value
- unit
- source name
- source year
- method or tier when available
- confidence or quality indicator
- alternatives for conflicts
- gap explanation for missing data
- existing inventory value, if any
- final action selected by the user

Supported user decisions:

| Decision | Meaning | Commit behavior |
| --- | --- | --- |
| `accept` | Use the recommended draft. | Mark `pending_cc_commit`; the future CC commit step writes through existing CityCatalyst paths. |
| `override_source` | Use another approved source from the alternatives. | Mark `pending_cc_commit`; the future CC commit step writes through existing CityCatalyst paths. |
| `override_manual` | User enters a manual value and unit. | Stage for explicit save; do not let CA write directly. |
| `leave_draft` | Keep the proposal for later. | No inventory write. |

## System Ownership

### CityCatalyst Owns

- User-facing GHGI routes and visual style.
- Auth, permissions, and feature flags.
- Accessible cities plus the selected city, inventory, and sector state.
- Existing inventory write behavior.
- Version history for committed changes.
- Final save after explicit user confirmation.

CityCatalyst should not ask the model to find arbitrary data or commit values.
It should expose only the Stationary Energy capabilities needed for this flow.

### Climate Advisor Owns

- Running the bounded Stationary Energy drafting workflow.
- Storing draft runs, source-candidate snapshots, proposals, review decisions,
  and commit statuses in the CA database.
- Calling CityCatalyst through the existing CC-CA connection.
- Ranking approved candidates.
- Explaining recommendations, conflicts, and gaps.
- Returning structured draft proposals for review.

Climate Advisor does not become the inventory source of truth. It stages and
explains draft decisions; CityCatalyst commits accepted changes.

### Source And Data Layer Owns

- Fetching approved source candidates.
- Mapping raw source records to Stationary Energy subsectors.
- Normalizing units, methods, years, geography match, and provenance.
- Returning all eligible candidates, not only the presumed winner.

The model should choose among approved options. It should not discover sources
freely.

For this pilot, `approved` and `allow-listed` mean source candidates already
present in the CityCatalyst datasource catalog and returned by the existing
CityCatalyst source/applicability pipeline for the selected city, inventory,
year, and Stationary Energy scope. CA should not maintain a separate pilot
source allow-list or rank sources that were not returned by the scoped CC
capabilities.

## Implementation Architecture Details

The Stationary Energy slice should make the ideal architecture concrete without
building a generic framework first. The implementation should use the existing
CC-CA connection, but move from manually exposed tools toward a registry-driven
workflow.

### Architecture Components

Each component has one narrow job. The goal is to make the workflow feel like
one CityCatalyst feature while keeping ownership clear between CC and CA.

| Component | What it is | Why it exists |
| --- | --- | --- |
| Stationary Energy selection, decisions, and review pages | CityCatalyst pages inside the GHGI inventory flow. | Let the user choose the target city/inventory, then move through draft decisions, provenance, conflicts, gaps, and final review. |
| Stationary Energy CA bridge routes | Planned CityCatalyst server routes or server actions, following the current `app/src/app/api/v1/chat/*` proxy pattern. | Keep browser auth and session handling on the CC side, then forward server-side requests into CA without making the browser call CA directly. |
| Stationary Energy draft routes | Climate Advisor HTTP routes for start/resume/review. | Keep draft workflow state in CA and give the CC bridge a narrow server-to-server API. |
| Draft workflow service | CA service that coordinates context loading, proposal generation, staging, and review. | Keeps the CA route thin and makes the workflow testable without UI code. |
| CA draft DB | CA persistence for draft runs, source-candidate snapshots, proposals, review decisions, and commit statuses. | Allows drafts to survive refresh, support review before commit, and keep an audit trail of what CA proposed and what still needs a CC commit. |
| CityCatalyst capability client | CA client for executing CC capabilities through the existing CC-CA token pattern. | Stops CA from calling arbitrary CC routes directly and keeps all product access behind typed capabilities. |
| CA-facing capability endpoint | Internal CityCatalyst endpoint used only by CA. | Authenticates CA, validates user scope, resolves the requested capability, and returns a structured result. |
| Stationary Energy capability registry | CC registry of which Stationary Energy capabilities exist and which workflow step can use them. | Prevents a flat tool bag; the draft step can inspect CC state while CA stages draft data internally, and the review step can later expose only the final commit capability. |
| Stationary Energy context loader | CC loader that builds the bounded context for one selected city, one selected inventory, and sector `I`. | Ensures CA sees only the current workflow state for the chosen draft run, not unrelated product data or routes. |
| Product-owned capability wrappers | CC functions around existing services such as inventory reads, source lookup, and committed writes. | Reuses existing domain logic while giving CA small, stable, model-safe operations. |
| OpenAI Agents SDK orchestrator | CA orchestration layer for agent execution, tool use, structured outputs, and model calls. | Keeps agent behavior inside the existing CA runtime instead of inventing a new orchestration service. |
| Candidate ranking or LLM decision | Agent step that evaluates supplied source candidates. | Chooses among approved candidates, explains conflicts and gaps, and returns structured proposals. |
| LangSmith tracing | Trace layer around draft runs, tool calls, model decisions, and proposal outputs. | Makes each recommendation reviewable during pilot debugging and later trust/audit work. |
| MCP documentation surface | Existing MCP docs/discovery context only, not part of this implementation. | Avoids adding protocol overhead and another tool surface to an already complex Stationary Energy slice. |
| DataSourceService and Global API | Existing CC source discovery, filtering, retrieval, and source-apply machinery. | Supplies approved source candidates and applies accepted source-backed values through existing paths. |
| Committed inventory DB | CityCatalyst inventory tables. | Remains the source of truth for saved inventory values. CA never writes here directly. |
| VersionHistoryService | Existing CC version history mechanism. | Records committed changes after the user approves accepted/source-overridden drafts. |

The core boundary is this: CA owns draft orchestration and all pre-commit draft
persistence; CC owns product capabilities, permissions, committed writes, and
version history.

The orchestration rule is simple: CA decides what step the workflow is in and
what it needs next. The registry answers which capabilities are allowed for
that step. The context loader answers what bounded product context should be
loaded for that step. The loader does not orchestrate the registry.

MCP is intentionally not a runtime dependency for this slice. It can remain as
documentation and discovery context for what exists in the repo, but Stationary
Energy drafting should not add new MCP tools or route through MCP. The
capability registry is internal product architecture first; using MCP here
would add another transport, schema, auth, and testing surface without reducing
the core workflow complexity.

### Component Diagram

```mermaid
flowchart LR
  subgraph CC["CityCatalyst"]
    UI["Stationary Energy decisions and review pages"]
    CCBRIDGE["CC server bridge routes/actions"]
    CCAPI["CA-facing capability endpoint"]
    Registry["Stationary Energy capability registry"]
    Loader["Stationary Energy context loader"]
    Wrappers["Product-owned capability wrappers"]
    CCDB["Committed inventory DB"]
    Sources["DataSourceService + Global API"]
    History["VersionHistoryService"]
  end

  subgraph CA["Climate Advisor"]
    CARoute["Stationary Energy draft routes"]
    Workflow["Draft workflow service"]
    CAClient["CityCatalyst capability client"]
    CADB["CA draft DB"]
    AgentsSDK["OpenAI Agents SDK orchestrator"]
    Ranker["Candidate ranking / LLM decision"]
    Trace["LangSmith tracing"]
  end

  UI --> CCBRIDGE
  CCBRIDGE --> CARoute
  CARoute --> Workflow
  Workflow --> CAClient
  CAClient --> CCAPI
  CCAPI --> Registry
  CCAPI --> Loader
  Registry --> Wrappers
  Loader --> CCDB
  Loader --> Sources
  Wrappers --> CCDB
  Wrappers --> Sources
  Wrappers --> History
  Workflow --> AgentsSDK
  AgentsSDK --> Ranker
  AgentsSDK --> Trace
  Workflow --> CADB
  CADB --> CARoute
  CARoute --> CCBRIDGE
  CCBRIDGE --> UI
```

### Start-Draft Sequence

```mermaid
sequenceDiagram
  participant User
  participant CCUI as CC decisions page
  participant CCRoute as CC server bridge route
  participant CA as CA draft route
  participant CADB as CA draft DB
  participant Registry as CC capability registry
  participant CCClient as CA capability client
  participant CCToken as CC internal user-token route
  participant CCCap as CC capability endpoint
  participant Loader as CC context loader
  participant Agent as OpenAI Agents SDK orchestrator
  participant Trace as LangSmith tracing

  User->>CCUI: Select city/inventory and open Stationary Energy agentic page
  CCUI->>CCRoute: Submit start/resume request on CC origin
  CCRoute->>CA: POST /v1/stationary-energy-drafts/start
  CA->>CADB: Create draft_run(status="resolving_scope")
  CA->>CA: Resolve workflow_step="draft" and sector scope
  CA->>CCClient: execute get_allowed_capabilities
  CCClient->>CCCap: POST /allowed-capabilities
  CCCap->>Registry: Resolve draft-scoped capability set
  Registry-->>CCCap: Allowed draft capability ids
  CCCap-->>CCClient: capability ids
  CCClient-->>CA: capability ids
  CA->>CCToken: Request user-scoped token if needed
  CCToken-->>CA: Bearer token
  CA->>CCClient: execute load_context
  CCClient->>CCCap: POST capability=load_context
  CCCap->>Loader: Resolve city, inventory, sector, values, sources
  Loader-->>CCCap: StationaryEnergyContext
  CCCap-->>CCClient: context payload
  CCClient-->>CA: context payload
  CA->>Agent: Create agent with draft-scoped tools and context
  Agent->>Agent: Generate ready/conflict/gap proposals
  Agent->>Trace: Record tools, prompts, model output, proposal ids
  Agent-->>CA: Structured proposals
  CA->>CADB: Store proposals
  CA-->>CCRoute: Draft run with proposal ids and summary
  CCRoute-->>CCUI: Draft run with proposal ids and summary
```

For this workflow, token readiness belongs after CA has resolved the workflow
step and allowed capability set, but before any CC context call or agent
creation. That keeps permission failure at the boundary where it belongs and
avoids starting an agent run that cannot execute product calls.

The important ownership point is that CA is still orchestrating this flow. It
asks CC for allowed capabilities and bounded context as separate operations. The
CC context loader does not look up the registry on its own or decide what the
agent may do.

The extra CC route hop is deliberate. Today the browser reaches CA through CC
server routes such as `app/src/app/api/v1/chat/threads/route.ts` and
`app/src/app/api/v1/chat/messages/route.ts`. The Stationary Energy UI should
follow that same boundary instead of teaching the browser to call CA directly.

### Observability And Audit Artifacts

This slice should treat observability as required implementation, not optional
hardening after the pilot. Every draft run should leave behind enough evidence
to debug the recommendation path and enough product context to review what the
system actually did.

Required identifiers across the flow:

- `request_id` for each HTTP request
- `draft_run_id` for the durable CA draft run
- `thread_id` or equivalent conversation/session id when the run is resumed
- `city_id`, `inventory_id`, and `sector_code`
- `workflow_step` such as `draft` or `review`

Required observability outputs:

- LangSmith trace for each proposal-generation run, tagged with the ids above
- structured CA logs for route entry, token refresh, context load, model run,
  proposal storage, and review handling
- structured CC logs for capability execution, permission validation, source
  selection, commit calls, and version-history writes
- durable draft artifact in CA persistence that stores:
  - bounded context summary sent into the model
  - candidate/source references considered for each proposal
  - proposal outputs, rationale, and conflict/gap explanations
  - user review decisions and final commit result

The goal is not to store every raw payload forever. The goal is to preserve the
decision path. That means support and product engineers should be able to
reconstruct:

- what the model saw
- which tools were available
- what it proposed
- what the user changed
- what CC finally committed

Do not persist raw Bearer tokens, service secrets, or unnecessary full product
payload dumps in traces or audit artifacts.

### Current Review Sequence

```mermaid
sequenceDiagram
  participant User
  participant CCReview as CC review page
  participant CCRoute as CC server bridge route
  participant CA as CA review route
  participant CADB as CA draft DB

  User->>CCReview: Accept, override, or leave draft
  CCReview->>CCRoute: Submit review request on CC origin
  CCRoute->>CA: POST /v1/stationary-energy-drafts/{run_id}/review
  CA->>CADB: Store review decisions
  CA->>CADB: Mark accept/source-override rows pending_cc_commit
  CA->>CADB: Mark manual overrides staged_manual
  CA-->>CCRoute: Updated review state
  CCRoute-->>CCReview: Updated review state
```

This is the current implemented behavior in CA. The next CC-side addition is a
`commit_accepted` capability that CA can call for rows already marked
`pending_cc_commit`.

### Minimal Implementation Snippets

The plan should keep only the smallest code anchors for what we actually intend
to build.

CC registry:

```ts
export const stationaryEnergyRegistry = {
  draft: ["ghgi.stationary_energy.load_context"],
  review: ["ghgi.stationary_energy.commit_accepted"],
};
```

CC context loader:

```ts
export async function loadStationaryEnergyContext(scope, session) {
  await PermissionService.canEditInventory(session, scope.inventoryId);
  return { scope, inventory, currentState, candidates };
}
```

CA orchestration:

```python
enabled = await capability_client.get_allowed_capabilities(step="draft", ...)
token = await token_service.ensure_user_token(user_id)
context = await capability_client.execute("ghgi.stationary_energy.load_context", ...)
proposals = await agent_runner.generate_stationary_energy_proposals(context, enabled)
```

CC internal execution:

```ts
const capability = getStationaryEnergyCapability(capabilityId, workflowStep);
const input = capability.inputSchema.parse(payload);
return NextResponse.json(await capability.execute(input, { session, locale }));
```

Feature flags:

```ts
if (!isEnabled("stationary_energy_agentic")) return notFound();
```

```python
if not settings.stationary_energy_agentic_enabled:
    raise HTTPException(status_code=404, detail="Feature disabled")
```

### Step-Scoped Capability Exposure

```mermaid
flowchart TD
  Step["Workflow step"] --> Draft{"draft step?"}
  Step --> Review{"review step?"}
  Draft --> LoadContext["load_context"]
  Draft --> CAPersistDraft["CA internal: persist candidates and proposals"]
  Draft --> NoCommit["commit_accepted unavailable"]
  Review --> CAReview["CA internal: persist review decisions"]
  Review --> PendingCommit["CA marks accepted rows pending_cc_commit"]
  Review --> Commit["commit_accepted (next CC addition)"]
```

Only CC product reads and product writes should be exposed as capabilities.
Draft-run creation, proposal persistence, and review-decision persistence stay
inside CA service and repository code. No step gets broad inventory write
access.

## Ideal Architecture Slice

The ideal architecture includes module-owned capabilities, a registry, scoped
context loaders, and a confirmation model. This plan implements those ideas only
for Stationary Energy.

### Capability Wrappers

Create narrow wrappers for the Stationary Energy workflow. They should delegate
to existing CityCatalyst routes and services through the existing CC-CA
connection.

Current and next CC-facing wrappers:

| Capability | Type | Purpose |
| --- | --- | --- |
| `ghgi.stationary_energy.load_context` | query | Load the bounded city, inventory, permissions, taxonomy, current values, and source-candidate context in one CC payload. |
| `ghgi.stationary_energy.commit_accepted` | command | Planned next CC addition to commit accepted or source-overridden rows through existing inventory write paths. |

These wrappers should return small, structured payloads. They should not expose
raw product internals or unrelated APIs to the model.

CA-local operations such as creating draft runs, storing source-candidate
snapshots, replacing proposals, and persisting review decisions are not CC
capabilities. They live in CA service and repository code and are backed by the
CA database.

### Capability Registry

Create a small registry for this workflow before generalizing it. The registry
should describe:

- capability id
- operation type: query, command, or workflow
- input schema
- output schema
- required scope: city, inventory, sector
- whether confirmation is required
- whether the capability can write committed product data
- which workflow step can use it

The first registry should only include the CC-side Stationary Energy
capabilities that CA actually needs. It should not include CA-local persistence
operations. This keeps the agent's tool set small and proves the pattern before
it is expanded to other modules or sectors.

### Context Loaders

Use scoped context loaders to build the data the agent can see for each step.

The Stationary Energy context loader should include:

- `cityId`
- `inventoryId`
- city name
- locode
- country code
- inventory year
- locale
- user permission summary
- Stationary Energy subsector list
- existing values and notation keys
- source candidate summary
- current draft run status, if one exists

It should exclude:

- unrelated sectors
- unrelated cities
- credentials or tokens
- raw permission internals
- unrelated module state
- arbitrary user files

### Confirmation And Staging Model

Use a human-in-the-loop staging model:

1. CA creates a draft run.
2. CA stages proposals in its database.
3. The user reviews staged proposals.
4. The user chooses accept, override, or leave draft.
5. CityCatalyst commits only accepted source-backed changes.
6. CityCatalyst records version history for committed changes.
7. CA keeps the draft/audit trail for the run and decisions.

No draft should mutate committed inventory data before the review step.

## Draft Data Model

The CA database should store enough information to resume review and explain
why each draft exists.

### Draft Run

Suggested fields:

- `draft_run_id`
- `city_id`
- `inventory_id`
- `sector_code`
- `status`
- `locale`
- `created_by_user_id`
- `created_at`
- `updated_at`
- `ca_trace_id`

### Draft Proposal

Suggested fields:

- `proposal_id`
- `draft_run_id`
- `subsector_code`
- `status`: `ready`, `conflict`, or `gap`
- `recommended_value`
- `recommended_unit`
- `recommended_source_id`
- `recommended_source_name`
- `source_year`
- `source_method`
- `source_tier`
- `confidence`
- `rationale`
- `ui_message`
- `citation`
- `alternatives_json`
- `current_inventory_value`
- `current_inventory_unit`

### Stored Source Candidate Snapshot

The current CA implementation also persists the source candidate set used for a
draft run so review and retry can operate on the same bounded snapshot.

Suggested fields:

- `candidate_id`
- `draft_run_id`
- `datasource_id`
- `name`
- `dataset_year`
- `geography_match`
- `source_scope`
- `normalized_rows`
- `applicability_status`
- `applicability_issues`
- `quality_score`
- `confidence_notes`

### Review Decision

Suggested fields:

- `decision_id`
- `proposal_id`
- `action`: `accept`, `override_source`, `override_manual`, or `leave_draft`
- `selected_source_id`
- `manual_value`
- `manual_unit`
- `note`
- `decided_by_user_id`
- `decided_at`
- `commit_status`
- `cc_version_history_id`

## Runtime Flow

```mermaid
flowchart TD
  User["User opens Stationary Energy launcher or sector CTA"] --> Selector["City and inventory selection"]
  Selector --> ChosenScope["Selected city, inventory, and sector"]
  ChosenScope --> CCPage["Agentic decisions page"]
  CCPage --> CAStart["Start or resume CA draft run"]
  CAStart --> CAResolve["CA resolves workflow step and selected scope"]
  CAResolve --> Registry["Stationary Energy capability registry"]
  CAResolve --> Loader["Stationary Energy context loader"]
  Registry --> Wrappers["Scoped capability wrappers"]
  Loader --> CCState["CityCatalyst inventory and source state"]
  Wrappers --> CCState
  CCState --> CADecide["CA ranks approved candidates"]
  CADecide --> CADrafts["CA stores draft proposals"]
  CADrafts --> DecisionsPage["Decision page shows recommendations, conflicts, gaps"]
  DecisionsPage --> ReviewPage["Review page"]
  ReviewPage --> UserDecision{"User decision"}
  UserDecision -->|accept or source override| CCCommit["CityCatalyst commits through existing write path"]
  UserDecision -->|manual override| ManualStage["Stage manual value for explicit save"]
  UserDecision -->|leave draft| KeepDraft["Keep CA draft pending"]
  CCCommit --> VersionHistory["CityCatalyst version history"]
```

## Candidate Selection Policy

For each Stationary Energy subsector, CA should:

1. Ignore rows that are locked or intentionally completed by the user.
2. Only consider candidates supplied by scoped capabilities.
3. Only consider allow-listed sources, where the allow-list is the existing
   CityCatalyst datasource catalog after CC applicability filtering for the
   selected city, inventory, year, and Stationary Energy scope.
4. Prefer exact city and inventory-year matches.
5. Prefer city-level data over regional or country proxies.
6. Prefer complete subsector coverage over broad approximations.
7. Prefer stronger method and quality metadata when geography and coverage are
   comparable.
8. Return a conflict when two usable candidates differ beyond the configured
   threshold or represent a real methodology tradeoff.
9. Return a gap when no candidate clears the minimum bar.

CA should return structured proposal states:

| State | Meaning | UI behavior |
| --- | --- | --- |
| `ready` | One candidate is clearly best. | Show inline draft and provenance. |
| `conflict` | Multiple usable candidates need user choice. | Show recommendation plus alternatives. |
| `gap` | No usable candidate exists. | Show gap reason and manual next steps. |

## Guardrails

- The product entry can expose multiple accessible cities and inventories, but
  each draft run is scoped to one selected city, one selected inventory, and
  one sector.
- CA never writes directly to committed inventory tables.
- CA never sees unrelated product state.
- CA never receives arbitrary credentials.
- MCP is not used as a runtime transport for this Stationary Energy workflow.
- Source candidates are allow-listed by CityCatalyst's existing datasource
  catalog and applicability filtering, then normalized before ranking.
- Every committed change requires an explicit user decision.
- Drafts remain visually distinct from saved values.
- Version history is created only for committed CityCatalyst changes.
- Feature flags in both CA and CC must default to off. CC should hide the UI
  entry points and pages, and CA should disable the draft workflow endpoints or
  return a feature-disabled response until the pilot is intentionally enabled.
- Every draft run should carry a LangSmith trace reference when tracing is
  enabled.

## Implementation Plan

### 1. CA Adjustments

Already implemented in CA:

- CA feature flag parsing for the Stationary Energy drafting workflow.
- CA draft routes for start, resume/status, retry, and review behind that
  feature flag.
- CA database models and migration for draft runs, source candidates,
  proposals, review decisions, trace references, and resume state.
- A CA workflow service that resolves scope, asks CC for allowed capabilities,
  ensures user token readiness, loads bounded Stationary Energy context, runs
  the proposal generator, and stores draft state.
- Recovery behavior for interrupted draft runs plus schema-oriented tests around
  CA context, proposals, and review decisions.

Remaining CA-side work:

- Expand LangSmith trace linkage and structured CA workflow logs as needed for
  pilot observability.
- Add the final handoff from `pending_cc_commit` review decisions into the
  future CC `commit_accepted` capability.

Exit condition:

With the CA flag enabled in a non-production environment, CA can stage, retry,
review, and resume Stationary Energy draft runs without writing committed
inventory values. With the CA flag disabled, the workflow routes stay
unavailable or return a feature-disabled response.

### 2. Landing Pages And UX Parts

- Add a CC feature flag for the Stationary Energy agentic workflow and keep it
  disabled by default.
- Hide the launcher page, sector CTA, draft pages, and review pages unless the
  CC flag is enabled.
- Add the city and inventory selection page.
- Add the scoped decisions page.
- Add the review page.
- Render current Stationary Energy rows, draft states, provenance, conflicts,
  and gaps in a CC-native layout.
- Support the user decision controls: accept, source override, manual override,
  and leave draft.
- Keep draft values visually distinct from committed values.
- Add access and UX tests so the new surfaces do not appear or interfere with
  the existing GHGI flow while the feature flag is off.

Exit condition:

With the CC flag enabled, an internal user can choose a city and inventory,
inspect draft recommendations, review them, and move through the full UI flow.
With the CC flag disabled, the current GHGI experience remains unchanged.

### 3. Remaining CC Integration

- Add Stationary Energy capability wrappers.
- Add a Stationary Energy-only capability registry.
- Add context loaders for city selection, inventory, sector, existing values,
  and approved source candidates.
- Add or expose the CC internal endpoints needed by CA:
  - allowed capabilities lookup
  - bounded context loading
  - accepted draft commit
- Keep all CC integration behind the CC feature flag so the workflow cannot be
  triggered accidentally from production UI or CA.
- Validate permissions, scope ownership, and inventory-city consistency inside
  CC.
- Commit accepted source-backed values through existing inventory write paths.
- Record CityCatalyst version history for committed changes.
- Add access-scope tests and confirmation tests for accepted and overridden
  drafts.

Exit condition:

With both CC and CA flags enabled and the remaining CC capability routes added,
the full Stationary Energy workflow can run end to end through the existing
CC-CA connection. With either flag disabled, the agentic path stays hidden or
blocked and does not interfere with the current app behavior.

## Open Decisions

- Whether the decisions and review pages should be separate routes or two steps
  in one route.
- Whether manual override commits in the first release or stays staged for a
  later explicit save path.
- Whether a later pilot needs a narrower source allow-list on top of the
  existing CityCatalyst datasource catalog. The first pilot uses the existing CC
  catalog plus applicability filtering as the allow-list.
- Which conflict variance threshold is acceptable for Stationary Energy.
- How much of the CA draft/audit trail should be mirrored into CityCatalyst
  version history.

## Final Page And Functionality Outline

This is the intended end-state location map for the first Stationary Energy
agentic workflow.

### User-Facing Pages

| Page | Route | Owner | Purpose |
| --- | --- | --- | --- |
| City and inventory selection page | `/{lng}/GHGI/draft/stationary-energy` | CityCatalyst | Lets the user choose among accessible cities and eligible inventories before starting a draft run. |
| Existing Stationary Energy sector page | `/{lng}/cities/{cityId}/GHGI/{inventoryId}` or the current inventory sector route | CityCatalyst | Entry point. Shows the normal Stationary Energy inventory UI and a CTA to start agentic drafting. |
| Agentic decisions page | `/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy` | CityCatalyst UI + Climate Advisor draft state | Shows current rows, source coverage, recommended drafts, conflicts, gaps, provenance, and progress. |
| Draft review page | `/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy/review` | CityCatalyst UI + Climate Advisor review state | Lets the user accept, override, manually stage, or leave each draft before save. |
| Saved inventory page | Existing inventory route after review | CityCatalyst | Shows committed values after accepted drafts are saved through the normal inventory write path. |

### Page 1: City And Inventory Selection Page

Route:

`/{lng}/GHGI/draft/stationary-energy`

Primary layout:

- Search and filter bar.
- List or table of accessible cities.
- Nested or adjacent eligible inventory selection.
- Entry action to continue into Stationary Energy drafting.

What appears:

- Accessible cities for the current user.
- Inventory year, type, and status summary for eligible GHGI inventories.
- Clear selected state for city and inventory.
- Disabled continue action until both city and inventory are selected.

What it calls:

- Existing CityCatalyst city and inventory listing APIs.
- No CA draft run is created from this page until the user confirms the target
  scope.
- On continue, navigate to the decisions page with `cityId` and `inventoryId`.

Frontend implementation location:

- `app/src/app/[lng]/GHGI/draft/stationary-energy/page.tsx`
- Supporting components, for example:
  - `CityInventorySelector`
  - `CitySearchInput`
  - `InventoryPickerTable`
  - `SelectedScopeSummary`

### Page 2: Existing Stationary Energy Sector Page

Location:

- Existing GHGI inventory UI.
- Add only a Stationary Energy-specific CTA near the sector header or sector
  action area.

What appears:

- Current Stationary Energy completion state.
- Existing sector rows and values.
- CTA: `Let the agent draft this section`.
- Supporting copy: `Review every value before saving`.
- Disabled or hidden CTA when the user does not have edit access.

What it calls:

- No new draft call until the user clicks the CTA.
- On click, navigate to the decisions page with `cityId` and `inventoryId`.

### Page 3: Agentic Decisions Page

Route:

`/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy`

Primary layout:

- Left: Stationary Energy inventory canvas.
- Right: agentic decision rail.

Canvas areas:

- Existing committed rows.
- Draftable subsector rows.
- Draft value cells with clear draft styling.
- Source tags attached to each draft value.
- Inline provenance drawer or expandable provenance row.

Agent rail areas:

- Draft run status.
- Source coverage summary.
- Recommendation rationale.
- Conflict cards.
- Gap cards.
- Link or button to continue to review.

Main behavior:

1. Page loads with the selected city, inventory, and sector scope.
2. CityCatalyst UI calls a CC server route or server action that starts or
   resumes the CA draft run.
3. CA uses the Stationary Energy context loader and capability registry.
4. CA stores draft proposals in the CA database.
5. The page renders proposals as ready, conflict, or gap states.
6. Nothing is committed to CityCatalyst inventory tables from this page.

Frontend implementation location:

- `app/src/app/[lng]/cities/[cityId]/GHGI/[inventory]/draft/stationary-energy/page.tsx`
- Supporting components under the same route folder or a nearby feature folder,
  for example:
  - `StationaryEnergyDraftCanvas`
  - `DraftValueCell`
  - `SourceProvenanceTag`
  - `ProvenanceDrawer`
  - `AgentDecisionRail`
  - `ConflictCard`
  - `GapCard`

Backend calls:

- Planned CC browser-facing bridge route or server action, following the
  existing `app/src/app/api/v1/chat/*` pattern.
- Underlying CA routes:
  - `POST /v1/stationary-energy-drafts/start`
  - `GET /v1/stationary-energy-drafts/{run_id}`
- CC internal capability used by CA:
  `ghgi.stationary_energy.load_context`

### Page 4: Draft Review Page

Route:

`/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy/review`

Primary layout:

- Review summary header.
- Table or grouped list of draft proposals.
- Per-row decision controls.
- Final save action.

Each row shows:

- subsector code and name
- current committed value, if any
- recommended value and unit
- recommended source
- confidence or source quality indicator
- rationale
- alternatives for conflicts
- gap reason when no source exists
- selected user decision

Allowed actions:

- `accept`: mark the recommended source-backed value `pending_cc_commit`.
- `override_source`: mark another approved source-backed value `pending_cc_commit`.
- `override_manual`: stage a manual value for explicit save.
- `leave_draft`: keep the proposal without committing.

Main behavior:

1. Page loads the CA draft run and proposal state.
2. User chooses decisions for proposals.
3. User submits those decisions through a CC server route or server action.
4. CA records decisions in the CA database.
5. Accepted and source-overridden proposals are marked `pending_cc_commit`.
6. Manual overrides are staged and left-draft rows remain uncommitted.
7. The future CC `commit_accepted` step can later consume the
   `pending_cc_commit` rows and perform the actual CityCatalyst write.

Frontend implementation location:

- `app/src/app/[lng]/cities/[cityId]/GHGI/[inventory]/draft/stationary-energy/review/page.tsx`
- Supporting components:
  - `DraftReviewSummary`
  - `DraftReviewTable`
  - `ReviewDecisionControl`
  - `ConflictSourcePicker`
  - `ManualOverrideFields`
  - `FinalSaveBar`

Backend calls:

- Planned CC browser-facing bridge route or server action, following the
  existing `app/src/app/api/v1/chat/*` pattern.
- Underlying CA routes:
  - `GET /v1/stationary-energy-drafts/{run_id}`
  - `POST /v1/stationary-energy-drafts/{run_id}/review`
- Planned next CC internal capability for final save:
  `ghgi.stationary_energy.commit_accepted`

### Page 5: Saved Inventory Page

Location:

- Existing GHGI inventory route after review is complete.

What appears:

- Accepted values as normal committed inventory values.
- Existing source display behavior where available.
- Existing version history entry for the save.
- Draft-only or left-draft proposals remain outside committed inventory data.

What it calls:

- Existing CityCatalyst inventory read APIs.
- Existing version history APIs.
- No CA call is required to show committed values.

### Functionality Placement By Layer

| Layer | Location | Responsibility |
| --- | --- | --- |
| CityCatalyst UI | Planned new Stationary Energy selector, draft, and review routes | User workflow, city/inventory selection, visual style, decision controls, and navigation back to inventory. |
| CityCatalyst CA bridge route | Planned CC server route or server action, mirroring `app/src/app/api/v1/chat/threads/route.ts` and `app/src/app/api/v1/chat/messages/route.ts` | Authenticated browser-facing entrypoint that proxies draft workflow requests to CA. |
| CityCatalyst capability endpoint | Planned: `app/src/app/api/v1/internal/ca/capabilities/...` | Internal CA-only execution surface for scoped capabilities. |
| CityCatalyst capability wrappers | Planned: `app/src/backend/agentic/ghgi/stationary-energy/capabilities.ts` | Stable wrappers around existing inventory/source/commit logic. |
| CityCatalyst registry | Planned: `app/src/backend/agentic/ghgi/stationary-energy/registry.ts` | Step-scoped list of capabilities available to CA. |
| CityCatalyst context loader | Planned: `app/src/backend/agentic/ghgi/stationary-energy/context.ts` | Loads bounded city, inventory, sector, current value, and source context. |
| CityCatalyst existing services | `DataSourceService`, `PermissionService`, `VersionHistoryService`, inventory models | Domain logic, permissions, source retrieval, committed writes, and version history. |
| Climate Advisor routes | `climate-advisor/service/app/routes/stationary_energy_drafts.py` | Start/resume draft runs, return review state, and record review decisions. |
| Climate Advisor workflow service | `climate-advisor/service/app/services/stationary_energy_draft_service.py` | Orchestrates context loading, proposal generation, staging, and review. |
| Climate Advisor draft repository | `climate-advisor/service/app/services/stationary_energy_draft_repository.py` | Persists draft runs, source-candidate snapshots, proposals, and review decisions in the CA database. |
| Climate Advisor CC client | `climate-advisor/service/app/services/citycatalyst_client.py` | Calls CC token and capability endpoints using the existing token/client pattern. |
| Climate Advisor LLM runner | `climate-advisor/service/app/services/stationary_energy_llm_service.py` | Runs structured Stationary Energy proposal generation. |
| LangSmith tracing | CA tracing configuration and draft-run trace references | Captures context, tool calls, model output, and proposal ids for debugging and audit review. |
| Climate Advisor database models | `climate-advisor/service/app/models/db/stationary_energy_draft.py` | Defines CA-owned tables for draft runs, source candidates, proposals, and review decisions. |
| MCP | Documentation/discovery context only | Not used for runtime calls in this Stationary Energy workflow. |

### End-State User Journey

```mermaid
flowchart TD
  Launcher["City/inventory selection page"] --> Decisions["Agentic decisions page"]
  Inventory["Existing Stationary Energy page"] --> CTA["Let the agent draft this section"]
  CTA --> Decisions
  Decisions --> Ready["Ready draft values"]
  Decisions --> Conflict["Conflict decisions"]
  Decisions --> Gap["Gap explanations"]
  Ready --> Review["Draft review page"]
  Conflict --> Review
  Gap --> Review
  Review --> Accept["Accept or source override"]
  Review --> Manual["Manual override staged"]
  Review --> Leave["Leave as draft"]
  Accept --> Commit["Commit through CityCatalyst"]
  Commit --> Saved["Saved inventory page"]
  Manual --> ReviewState["CA review state remains staged"]
  Leave --> ReviewState
```

The important boundary is that the user experiences this as one Stationary
Energy workflow in CityCatalyst, while the implementation remains split by
ownership: CA stages and explains draft decisions; CC owns scoped capabilities,
permissions, committed writes, and version history.

## Issues

### CA-persisted draft runs are not discoverable by the frontend

The Stationary Energy draft state is correctly persisted in the Climate Advisor
database, but the CityCatalyst frontend can currently resume a draft only when
the browser still has the exact `draft_run_id` cached in local storage. If that
local pointer is missing, stale, cleared, or from a different browser, the
decisions page has no CA-backed way to discover the latest draft run for the
selected user, city, inventory, and sector. The UI can therefore appear as if no
draft exists even though CA still owns a durable run and all associated source
candidates, proposals, review decisions, and thread context.

Current behavior:

1. The decisions page checks local storage for
   `stationary-energy-draft:{inventory_id}`.
2. If a cached `draftRunId` exists, the page calls
   `GET /v1/stationary-energy-drafts/{draft_run_id}` through the CC bridge.
3. If no cached id exists, the page does not ask CA to find an existing run for
   the selected inventory.
4. Starting a draft calls `POST /v1/stationary-energy-drafts/start`, which
   creates a new CA run instead of resuming the latest persisted run.

Why this is a problem:

- CA is intended to be the durable owner of pre-commit draft state, but the
  frontend currently treats browser local storage as the only way to discover
  that state.
- Refresh in the same browser can work, but cross-browser, cleared-storage, or
  stale-storage cases can lose the resume path.
- Re-running a demo or user flow can create another draft run for the same
  inventory, which makes the UI harder to reason about and can mix a new draft
  with already committed inventory values.
- The existing CA database index on `user_id`, `city_id`, `inventory_id`, and
  `sector_code` suggests this lookup was anticipated, but no resume/list route
  currently exposes it to the CC bridge.

Implementation deep dive:

- CA stores `stationary_energy_draft_runs` with `user_id`, `city_id`,
  `inventory_id`, `sector_code`, `status`, `workflow_step`, `thread_id`, and
  timestamps.
- CA also stores child records for source-candidate snapshots, proposals, and
  review decisions.
- The current CA route contract supports:
  - `POST /v1/stationary-energy-drafts/start`
  - `GET /v1/stationary-energy-drafts/{draft_run_id}`
  - `POST /v1/stationary-energy-drafts/{draft_run_id}/retry`
  - `POST /v1/stationary-energy-drafts/{draft_run_id}/review`
  - `POST /v1/stationary-energy-drafts/{draft_run_id}/save`
- There is no route that answers: "for this authenticated user, city, inventory,
  and Stationary Energy sector, what is the latest draft run I should resume?"
- The CC frontend therefore cannot reconstruct the durable CA run id from the
  selected city and inventory alone.

Possible solutions:

1. Add a CA-backed resume endpoint.
   - Add `GET /v1/stationary-energy-drafts/resume`.
   - Query by authenticated `user_id`, `city_id`, `inventory_id`, and
     `sector_code="stationary_energy"`.
   - Return the latest owned draft run with source candidates, proposals, and
     review decisions.
   - Return `404` when no run exists.

2. Add a CC bridge route for that resume endpoint.
   - Add `GET /api/v1/stationary-energy-drafts/resume`.
   - Pass the current CC session user id and token to CA.
   - Accept `city_id` and `inventory_id` as query params.
   - Keep the browser talking only to CC-origin routes, matching the existing
     bridge pattern.

3. Change frontend resume order.
   - Treat local storage as a cache, not the source of truth.
   - First try the cached `draftRunId` if present.
   - If it is missing or fails, call the CA-backed resume bridge endpoint.
   - If CA returns a draft, write the returned `draft_run_id` back into local
     storage and render it.
   - Only show "No draft" when CA returns `404`.

4. Define resume status semantics.
   - Decide whether resume should return only active pre-commit states, such as
     `ready`, `reviewed`, or `pending_cc_commit`, or also return `saved` runs.
   - A practical UX is to resume active unsaved runs automatically and expose
     saved runs through history or a "view previous draft" affordance.
   - If saved runs are returned, the primary action should read `Start new
     draft` rather than `Start draft`, because the existing run is no longer an
     editable in-progress draft.

5. Add tests around the missing-storage case.
   - CA service test: create multiple runs for the same user/city/inventory and
     verify resume returns the latest allowed run.
   - CC bridge test: verify the route forwards the authenticated user and
     inventory scope correctly.
   - Frontend test: clear local storage, open the decisions page, and verify the
     persisted CA draft is loaded instead of starting a fresh run.

Preferred patch:

Implement solutions 1, 2, and 3 first, with explicit status semantics from
solution 4. This keeps CA as the durable source of truth while preserving local
storage as a fast client-side hint. It also prevents accidental duplicate draft
runs when the browser cache is missing.
