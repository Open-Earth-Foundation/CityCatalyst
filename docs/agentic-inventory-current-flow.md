# Agentic Inventory Drafting Current Flow

This document describes the implemented Stationary Energy bulk-filler flow as it exists now. It focuses on responsibility boundaries, the data sent to Climate Advisor, and the decisions the CA/LLM-shaped draft skill is allowed to make.

## Big Picture

The agentic page does not let Climate Advisor search the whole product or write inventory values directly. CityCatalyst owns the inventory, city, permissions, catalogue lookup, Global API calls, staging table, and final write. Climate Advisor receives a bounded, city-scoped payload and returns draft proposals only.

```mermaid
flowchart TD
  User["User on agentic inventory page"] --> UI["CityCatalyst UI<br/>/{lng}/cities/{cityId}/GHGI/{inventoryId}/draft/stationary-energy"]
  UI --> DraftAPI["Draft API<br/>POST /api/v1/inventory/{inventoryId}/draft/stationary-energy"]

  DraftAPI --> Perms["PermissionService.canEditInventory"]
  DraftAPI --> Inventory["Load Inventory + City<br/>inventory_id, city_id, city_name, locode, country_code, year"]
  DraftAPI --> Existing["Load current Stationary Energy values<br/>InventoryValue by GPC I.*"]
  DraftAPI --> Catalogue["Load applicable DataSourceI18n rows<br/>DataSourceService.findAllSources + filterSources"]

  Catalogue --> GlobalAPI["Global API calls through DataSourceService<br/>source.apiEndpoint with locode, country, year, GPC ref"]
  GlobalAPI --> Normalize["Normalize source candidates<br/>value, unit, tier, method, geography_match, coverage, confidence, citation"]

  Inventory --> Payload["SectorDraftRequest payload"]
  Existing --> Payload
  Normalize --> Payload

  Payload --> CA["Climate Advisor draft skill<br/>POST /v1/inventory-drafts/stationary-energy"]
  CA --> DraftOutput["SectorDraftLLMOutput<br/>ready / conflict / gap proposals"]

  DraftOutput --> Stage["ProposedInventoryChange<br/>proposal, recommendation, alternatives, rationale, UI message"]
  Stage --> Canvas["Inline draft canvas<br/>draft cells, committed cells, gap cards, source tags"]

  Canvas --> ReviewChoice{"User review decision"}
  ReviewChoice --> Accept["accept recommended source"]
  ReviewChoice --> Override["override to another source<br/>or manual value"]
  ReviewChoice --> Leave["leave_draft"]

  Accept --> ReviewAPI["Review API<br/>POST /api/v1/inventory/{inventoryId}/draft/stationary-energy/review"]
  Override --> ReviewAPI
  Leave --> ReviewAPI

  ReviewAPI --> Apply{"Decision handling"}
  Apply -->|accept| ApplySource["DataSourceService.applySource(forceReplace=true)"]
  Apply -->|source override| ApplySource
  Apply -->|manual override| ManualStage["Stage manual override for follow-up"]
  Apply -->|leave_draft| DraftStage["Keep staged draft"]

  ApplySource --> InventoryWrite["Committed inventory records<br/>InventoryValue, GasValue, ActivityValue, VersionHistory"]
  ApplySource --> Audit["Update ProposedInventoryChange<br/>accepted, selected source, applied_inventory_value_id, decided_by"]
  ManualStage --> Audit
  DraftStage --> Audit
```

## Call Chain And Ownership

| Step | Owner | Responsibility | Data passed forward |
| --- | --- | --- | --- |
| Page entry | CityCatalyst UI | Displays scoped drafting surface and calls the draft API. | `cityId`, `inventoryId`, `locale`, `sectorCode = I` |
| Draft API | CityCatalyst API | Validates permission, inventory/city match, and sector scope. | Authenticated user session, inventory id, city id |
| Inventory state | CityCatalyst backend | Loads city and current Stationary Energy state. | Existing values, notation keys, locked rows, source names |
| Source selection | `DataSourceService` | Filters catalogued sources by inventory year and city/country/region locode. | Applicable Global API-backed sources |
| Source retrieval | Global API | Returns emissions data for specific source, city, year, and GPC reference. | `totals.emissions`, records, quality metadata |
| Candidate normalization | CityCatalyst backend | Converts raw source response into comparable candidates. | Value, unit, tier, coverage, confidence, citation |
| Draft decision | Climate Advisor | Ranks supplied candidates and returns proposals only. | `ready`, `conflict`, or `gap` proposals |
| Proposal staging | CityCatalyst DB | Stores draft output before user acceptance. | `ProposedInventoryChange` rows |
| Review | CityCatalyst API | Applies user decisions and commits only accepted/source-overridden proposals. | `InventoryValue`, `GasValue`, `ActivityValue`, audit fields |

## What Climate Advisor Sees

Climate Advisor sees only the bounded `SectorDraftRequest` assembled by CityCatalyst:

```mermaid
flowchart LR
  Request["SectorDraftRequest"] --> Inv["inventory<br/>inventory_id<br/>city_id<br/>city_name<br/>locode<br/>country_code<br/>year<br/>locale"]
  Request --> Sector["sector<br/>code = I<br/>name = Stationary Energy<br/>subsectors"]
  Request --> State["current_state<br/>subsector_code<br/>existing_value<br/>existing_unit<br/>notation_key<br/>is_locked<br/>source_name"]
  Request --> Candidates["candidates<br/>subsector_code<br/>options[]"]
  Candidates --> Option["candidate option<br/>source_id<br/>source_name<br/>value<br/>unit<br/>year<br/>tier<br/>method<br/>geography_match<br/>coverage<br/>confidence<br/>citation<br/>rationale_notes"]
  Request --> Policy["policy<br/>allowed_sources<br/>conflict_variance_threshold<br/>require_explicit_acceptance"]
```

Climate Advisor does not receive arbitrary user files, all city data, other sectors, unrelated module state, credentials, or permission context. It also does not call the Global API directly in the current implementation. CityCatalyst has already fetched and normalized the source candidates before CA runs.

## What Climate Advisor Can Decide

For each Stationary Energy subsector, Climate Advisor can return exactly one of these proposal states:

| Proposal state | Meaning | Required output | UI behavior |
| --- | --- | --- | --- |
| `ready` | One usable candidate is clearly selected. | `recommended` source/value/unit plus rationale. | Shows an inline draft cell with source tag. |
| `conflict` | More than one usable candidate exists and the top two differ meaningfully. | `recommended`, `alternatives`, `needs_user_choice = true`. | Shows chosen draft plus decision card to keep or switch source. |
| `gap` | No usable candidate exists, or row is already locked/committed. | No `recommended`; rationale explains why. | Shows empty/gap state or committed existing row. |

The CA decision is ranking and explanation only. It cannot commit values, bypass review, invent new sources, change the inventory schema, or write to `InventoryValue`.

## Decision Logic Inside The Draft Skill

The current Climate Advisor service uses the same bounded model shape as an LLM skill, but the implemented `generate_stationary_energy_draft` function is deterministic ranking. If the LLM runtime is swapped in, the same Pydantic request/response envelope should remain the guardrail.

```mermaid
flowchart TD
  Start["For each Stationary Energy subsector"] --> Locked{"current_state.is_locked?"}
  Locked -->|yes| LockedGap["Return gap<br/>reason: row already has locked value"]
  Locked -->|no| HasCandidates{"Any supplied candidates<br/>with value, unit, non-missing coverage,<br/>and allowed source?"}
  HasCandidates -->|no| NoData["Return gap<br/>reason: no approved third-party data"]
  HasCandidates -->|yes| Score["Score each candidate"]
  Score --> Geo["geography_match<br/>city_direct > city_proxy > regional_proxy > country_proxy"]
  Score --> Cov["coverage<br/>complete > partial > missing"]
  Score --> Conf["confidence score"]
  Score --> Tier["tier bonus<br/>Tier 1 > Tier 2 > Tier 3"]
  Score --> Year["year distance penalty"]
  Geo --> Rank["Rank candidates"]
  Cov --> Rank
  Conf --> Rank
  Tier --> Rank
  Year --> Rank
  Rank --> Compare{"Top two candidates differ by<br/>policy.conflict_variance_threshold or more?"}
  Compare -->|yes| Conflict["Return conflict<br/>recommended = top candidate<br/>alternatives = remaining candidates"]
  Compare -->|no| Ready["Return ready<br/>recommended = top candidate"]
```

The ranking score currently favors:

- More specific geography, with `city_direct` strongest.
- More complete coverage.
- Higher confidence computed from source quality and fit.
- Better source tier.
- Source year closer to the inventory year.

## User Review Decisions

User review is separate from CA drafting. The review API accepts only explicit decisions and then decides whether a database write is allowed.

```mermaid
flowchart TD
  Decision["DraftReviewDecision"] --> Action{"action"}
  Action -->|accept| Accept["Use proposal.recommended.source_id"]
  Action -->|override| OverrideKind{"Override has selected source?"}
  Action -->|leave_draft| Leave["Keep proposal staged as draft"]

  OverrideKind -->|yes| UseAlt["Use selectedSourceId or selectedSourceName"]
  OverrideKind -->|no, manual value + unit| Manual["Stage manual override<br/>no automatic write yet"]

  Accept --> ValidateSource["Find source and validate applicability<br/>inventory year + city/country/region locode"]
  UseAlt --> ValidateSource
  ValidateSource --> Commit["DataSourceService.applySource(forceReplace=true)"]
  Commit --> Saved["Write InventoryValue, GasValue, ActivityValue<br/>record VersionHistory"]
  Commit --> AcceptedAudit["Mark proposal accepted<br/>store selected source and applied_inventory_value_id"]

  Manual --> ManualAudit["Mark manual_override_staged"]
  Leave --> DraftAudit["Mark draft"]
```

Review action contract:

| Action | Who chooses it | Effect |
| --- | --- | --- |
| `accept` | User or `Accept all` button | Applies the recommended source through `DataSourceService.applySource`. |
| `override` with selected source | User conflict/source decision | Applies the selected source instead of the recommended one. |
| `override` with manual value/unit | User manual correction | Stages the manual override for follow-up; it is not auto-committed by this flow. |
| `leave_draft` | User or gap handling | Leaves the proposal staged; no inventory value is written. |

## Pydantic Boundary

Climate Advisor validates the draft request and output with Pydantic. The important models are:

```python
class SectorDraftRequest(BaseModel):
    inventory: InventoryDraftContext
    sector: SectorDraftContext
    current_state: List[CurrentSubsectorState] = Field(default_factory=list)
    candidates: List[SubsectorCandidateSet] = Field(default_factory=list)
    policy: DraftPolicy = Field(default_factory=DraftPolicy)


class SectorDraftLLMOutput(BaseModel):
    run_id: str
    inventory_id: str
    city_id: str
    city_name: str
    locode: str
    sector_code: str
    locale: Literal["en", "es", "pt"]
    proposals: List[SubsectorDraftProposal] = Field(default_factory=list)


class DraftReviewDecision(BaseModel):
    proposal_id: str
    subsector_code: str
    action: DraftReviewActionType
    selected_source_id: Optional[str] = None
    selected_source_name: Optional[str] = None
    override_value: Optional[float] = None
    override_unit: Optional[str] = None
    note: Optional[str] = None
```

The output validator enforces:

- `gap` proposals must not contain a recommended value.
- `ready` and `conflict` proposals must include a recommended value.
- `conflict` proposals must include at least one alternative.

The review validator enforces:

- `override` must include either a selected source or a manual value and unit.
- `accept` and `leave_draft` must not include override fields.

## Current Implementation Notes

- The first implemented sector is Stationary Energy only, `sectorCode = I`.
- The implemented CA route is `POST /v1/inventory-drafts/stationary-energy`.
- The CityCatalyst draft route is `POST /api/v1/inventory/{inventoryId}/draft/stationary-energy`.
- The CityCatalyst review route is `POST /api/v1/inventory/{inventoryId}/draft/stationary-energy/review`.
- Draft proposals are staged in `ProposedInventoryChange`.
- Accepted/source-overridden values are committed through existing inventory infrastructure, not by Climate Advisor.
- Existing committed values are shown as committed rows on the agentic page and are treated as locked by the draft skill.
