# UOW-02 NFR Design — Logical Components

## Component scope

This document defines logical responsibilities for Climate Advisor's
request-time consumption of Core NativeInputCatalog capabilities. Components
are logical boundaries inside the existing services, not new deployable units.
The design preserves Core as the authorization/catalog/source-state authority,
keeps module systems of record authoritative for source data, and keeps
Climate Advisor free of storage credentials and raw storage access.

## Logical component map

```text
Existing message route / streaming handler
                 |
                 v
        Active Request Context
                 |
                 v
       Catalog Request Coordinator
          |                  |
          v                  v
 Typed Core Client     Existing workflow pack gates
          |
          v
   Core discovery boundary
   (filter + lightweight readiness only)
          |
          v
 Discovery Envelope Validator
          |
          v
 Current Selection Binder
          |
          v
 Selected-only Tool Factory
          |
          v
 Typed Capability Tool
          |
          v
   Typed Core Client selected read
          |
          v
 Safe Result / Error Mapper ---> Safe Telemetry
          |
          v
 Existing Agents SDK execution
```

The Core side of the diagram is intentionally opaque to Climate Advisor:

```text
Climate Advisor selected read
        |
        v
Core auth/user binding -> scope -> lifecycle -> allowlist -> readiness
        |
        v
Module-owned bounded operation -> Core shaping/redaction/bounds
        |
        v
Bounded result or stable capability_unavailable error
```

## Component catalogue

### LC-01 — Existing message route and streaming handler

**Role**: Request entry and lifecycle owner for message processing, active user
and thread context, workflow resolution, agent creation, streaming,
cancellation, persistence, and final cleanup.

**Reuse**: Existing Climate Advisor route/streaming path and workflow-context
helpers.

**Inputs**: Authenticated message request, bearer/session state, thread,
workflow/context/options, and existing request correlation.

**Outputs**: `ActiveRequestContext` for agent composition and the existing
streamed response lifecycle.

**NFR responsibilities**:

- Invoke catalog coordination only after identity/context resolution.
- Keep catalog state request-scoped.
- Preserve existing workflow, cancellation, persistence, and final cleanup.
- Never accept model output as authoritative request scope.

**Must not**: Read NativeInputCatalog/source storage, authorize entries, or
construct source routes.

### LC-02 — Active Request Context

**Role**: Logical value object containing authenticated user, thread/correlation,
workflow mode, applicable organization/project/city/inventory context, and a
runtime token reference.

**Reuse/placement**: Existing request/workflow context structures, extended
only through the narrowest approved seam.

**NFR responsibilities**:

- Bind user identity to existing authentication/session state.
- Treat active context as the only context available for selection.
- Reject or omit catalog behavior when required context is missing/inconsistent.
- Keep sensitive scope/token values internal to the request lifecycle.

**Must not**: Broaden scope, persist a catalog grant, or expose bearer/token
values to the model, tool output, or telemetry.

### LC-03 — Catalog Request Coordinator

**Role**: Coordinate one request-time discovery call and pass its safe result to
selection/tool composition.

**New logical seam**: Required consumer behavior; remains inside existing
Climate Advisor service orchestration rather than a new service.

**Inputs**: `ActiveRequestContext`, feature/mode eligibility, and
`TypedCoreClient`.

**Outputs**: Bounded `CoreDiscoveryResponse` or a safe empty/unavailable
outcome; current selection state for the active request.

**NFR responsibilities**:

- Call discovery at most once per eligible active request.
- Call it before catalog-backed tool construction and before agent execution.
- Keep discovery separate from selected execution.
- On disabled/unavailable/malformed/empty discovery, register no catalog tools
  and preserve existing packs.

**Must not**: Load capabilities globally, execute reads, authorize sources, or
create fallback access.

### LC-04 — Typed Core Client

**Role**: Existing `CityCatalystClient` façade extended with narrow typed Core
discovery and selected-read operations.

**Reuse/placement**: `climate-advisor/service/app/services/citycatalyst_client.py`
and its existing auth/timeout/refresh conventions.

**Inputs**: Active bearer/token reference, user/thread context, safe discovery
request or exact selection plus bounded input.

**Outputs**: Validated safe discovery response, bounded selected-read response,
fixed capability-unavailable classification, or safe transport/auth outcome.

**NFR responsibilities**:

- Encapsulate Core endpoint/headers and propagate service + bearer auth through
  existing conventions.
- Apply existing finite timeout and one-time refresh behavior.
- Avoid passing upstream response bodies/error text through the boundary.
- Validate bounded envelopes and close HTTP resources.

**Must not**: Construct module/storage URLs, infer routes, cache authorization,
or expose credentials/storage details.

### LC-05 — Discovery Envelope Validator

**Role**: Validate the Core safe discovery envelope and retain only bounded
eligible entries/capability descriptors.

**New logical seam**: Required consumer validation seam, using existing
Pydantic/schema patterns.

**Inputs**: Core discovery response from `TypedCoreClient`.

**Outputs**: Bounded safe entries with opaque `catalog_id` and matching
Core-issued `capability_id` values.

**NFR responsibilities**:

- Reject malformed required fields, oversized lists/fields, or unsafe shapes.
- Preserve omission semantics; never create placeholders or omission reasons.
- Keep source IDs, raw scope, lifecycle, storage, and permission details out.
- Make no readiness call beyond Core's discovery response.

**Must not**: Reconstruct catalog data, derive routes, or treat eligibility as
read-time authorization.

### LC-06 — Current Selection Binder

**Role**: Bind one current safe discovery entry and its exact Core-issued
capability to the active request.

**New logical seam**: Required request-scoped integrity seam.

**Inputs**: Current safe discovery set, requested selection, active context,
and capability descriptor.

**Outputs**: Immutable `CatalogCapabilitySelection` or a local safe invalid
selection outcome.

**NFR responsibilities**:

- Require exact pair membership in the current discovery response.
- Treat IDs as opaque and retain no source/storage route information.
- Bind required context internally and prevent model replacement.
- Reject stale, forged, malformed, unknown, mismatched, or absent selections
  before tool construction where possible.

**Must not**: Decide authorization, substitute a successor, or skip Core
read-time revalidation.

### LC-07 — Selected-only Tool Factory

**Role**: Construct only the request-scoped source-specific tool for the bound
selection.

**New logical seam**: Required tool composition seam inside existing tool
factory patterns.

**Inputs**: `CatalogCapabilitySelection`, typed descriptor, token reference,
and Core client operation.

**Outputs**: One `RequestScopedCapabilityTool` for the selected operation.

**NFR responsibilities**:

- Load/instantiate only the selected capability wrapper.
- Expose only declared typed bounded input fields.
- Capture active context and selection rather than accepting replacement scope.
- Preserve existing general/inventory/Stationary Energy/Concept Note/legacy/
  vector pack conditions.

**Must not**: Register all discovered capabilities, preload source tools,
execute discovery candidates, expose raw-source arguments, or call storage.

### LC-08 — Typed Capability Tool

**Role**: Model-facing bounded operation wrapper for one selected capability.

**Reuse/placement**: Existing Climate Advisor tool modules and Agents SDK
factory conventions.

**Inputs**: Only `BoundedCapabilityInput` fields declared by its descriptor.

**Outputs**: `BoundedToolResult` or `SafeToolError`.

**NFR responsibilities**:

- Validate types, finite sizes, and capability-specific input bounds.
- Send one exact selection/read request through `TypedCoreClient`.
- Map fixed Core selection errors to the existing safe tool-error shape.
- Preserve token reference updates and close per-tool resources.

**Must not**: Accept arbitrary catalog/capability/route/source/storage IDs,
return raw upstream errors, or perform fallback reads.

### LC-09 — Safe Result and Error Mapper

**Role**: Transform validated Core responses into model/tool-safe output.

**New logical seam**: Required consumer boundary; must remain thin because Core
already shapes/redacts the authoritative result.

**Inputs**: Validated Core response/error and operation context.

**Outputs**: Bounded typed result, stable `capability_unavailable` tool error,
or existing generic non-disclosing transport error.

**NFR responsibilities**:

- Preserve HTTP `404`, `capability_unavailable`, and the fixed generic message
  for selection-resolution failures.
- Reject or normalize unexpected/oversized/forbidden fields before model
  exposure.
- Exclude source existence/state, permission reason, scope, storage, and
  upstream error details.
- Isolate one failed tool from unrelated existing tools.

**Must not**: Add a state-specific explanation, echo the catalog/source ID on
failure, or become a second authorization authority.

### LC-10 — Token and Resource Lifecycle

**Role**: Reuse existing token reference, refresh, client, response, stream,
and cleanup behavior across request/tool execution.

**Reuse/placement**: Existing `TokenHandler`, `CityCatalystClient`,
`AgentService.close`, and tool cleanup seams.

**NFR responsibilities**:

- Keep bearer/service secrets runtime-only.
- Bound client/resource lifetime to the request/tool operation.
- Allow one-time user-scoped refresh and existing persistence behavior.
- Close on success, validation failure, timeout, cancellation, dependency
  failure, and refresh failure.

**Must not**: Store credentials in catalog/selection entities, log secrets, or
keep a source handle after cleanup.

### LC-11 — Existing Workflow Pack Composer

**Role**: Compose catalog-backed tools with existing mode-specific tools under
current registration conditions.

**Reuse/placement**: Existing `AgentService.create_agent` and current tool
builder conditions.

**Inputs**: Active workflow context, existing feature/auth conditions, and the
optional selected-only catalog pack.

**Outputs**: Final Agents SDK tool list and existing prompt/instruction setup.

**NFR responsibilities**:

- Keep catalog tools additive, mode-aware, and selected-only.
- Preserve general/inventory/vector behavior and Stationary Energy/Concept Note
  scoped behavior.
- Omit only the catalog pack when discovery is disabled/unavailable/empty.
- Keep rollout/rollback controlled by existing flags and deployment patterns.

**Must not**: Make catalog tools global, replace existing tools, or widen
legacy datasource access.

### LC-12 — Safe Consumer Telemetry

**Role**: Record low-cardinality operational evidence for discovery, selection,
execution, errors, refresh, timeout, cleanup, and rollout.

**Reuse/placement**: Existing Climate Advisor structured logging/tracing/
metrics conventions.

**Inputs**: Safe correlation and coarse operation outcome.

**Outputs**: Existing telemetry events/fields after redaction.

**NFR responsibilities**:

- Redact before emission.
- Allow only safe correlation/caller reference, permitted IDs, coarse outcome,
  bounded duration, and dependency/timeout category.
- Support readiness-versus-read performance analysis without revealing hidden
  source state.

**Must not**: Record tokens, credentials, source content, raw scope, storage
details, signed URLs, upstream bodies, or sensitive omission reasons.

### LC-13 — Deterministic Consumer Verification Harness

**Role**: Provide service-local fixtures/doubles for Core contracts,
selection, tools, tokens, workflow modes, failures, and cleanup.

**Reuse/placement**: Existing Climate Advisor pytest/asyncio tests; no shared
runtime dependency.

**NFR responsibilities**:

- Prove discovery readiness does not load/execute source tools or full reads.
- Prove selected-only registration and exactly selected execution.
- Cover safe errors, forbidden fields, token refresh, timeout, cancellation,
  cleanup, failure isolation, compatibility, and telemetry redaction.
- Provide partial property-based generators/seeds for pure invariants.

**Must not**: Replace Core security evidence or require production storage.

## Component interaction contracts

| Interaction | Producer | Consumer | Required contract |
|---|---|---|---|
| Active context | LC-01/02 | LC-03/11 | Authenticated user, current workflow, applicable bounded context; no model authority. |
| Discovery request | LC-03 | LC-04 | One request-time typed Core request with existing service/bearer auth. |
| Discovery result | LC-04 | LC-05 | Safe bounded entries only; lightweight readiness semantics; no full content/read. |
| Selection | LC-05 | LC-06 | Exact current `catalog_id` + opaque Core `capability_id` pair. |
| Tool construction | LC-06 | LC-07/11 | Selected-only descriptor and active context; no global load. |
| Tool input | LC-07 | LC-08 | Capability-specific finite typed fields only. |
| Selected read | LC-08 | LC-04 | Exact selection + bounded input through Core; one selected operation. |
| Core result/error | LC-04 | LC-09 | Typed bounded result or fixed safe selection error; no upstream body. |
| Token/resources | LC-04/08 | LC-10 | Existing refresh reference and terminal-path cleanup. |
| Operational evidence | All relevant components | LC-12 | Safe, redacted, coarse telemetry only. |
| Verification | LC-13 | UOW-03 | Deterministic consumer evidence and Core-contract compatibility. |

## Ownership and failure boundaries

| Concern | Climate Advisor component | Authoritative owner |
|---|---|---|
| Active request context | LC-01, LC-02, LC-03 | Existing auth/request/workflow boundary; Core validates authority. |
| Catalog filtering and lifecycle | Consume only through LC-04/05 | CityCatalyst Core / NativeInputCatalog |
| Scope authorization | Do not duplicate; forward context | CityCatalyst Core / permission boundary |
| Capability mapping | Bind opaque IDs only | CityCatalyst Core registry |
| Source readiness/ownership | Consume Core result only | Core + module-owned source boundary |
| Bounded source result | Validate consumption only | Core result shaper + module source owner |
| Tool registration | LC-06, LC-07, LC-11 | Climate Advisor request orchestration |
| Token lifecycle | LC-04, LC-08, LC-10 | Existing Climate Advisor client/token patterns, with Core validation |
| Safe errors/telemetry | LC-09, LC-12 | Consumer mapping; Core remains error/authorization authority |

## Failure behavior by component

| Failure | Consumer behavior | Forbidden behavior |
|---|---|---|
| Missing active context | Omit catalog-backed tools; preserve existing packs. | Broaden scope or ask the model for authoritative IDs. |
| Core discovery disabled/empty/unavailable | No catalog tools; safe bounded orchestration outcome. | Global cache, direct catalog/storage read, raw fallback. |
| Malformed discovery | Fail closed for catalog path; no upstream body exposure. | Synthesize entries or reasons. |
| Stale/forged/mismatched selection | Reject binding or map selected read to stable safe error. | Reveal existence/state or substitute another entry. |
| Core 404 capability unavailable | Existing safe tool-error shape with fixed generic contract. | Echo upstream text or source metadata. |
| Timeout/cancellation | Close resources and isolate failure. | Indefinite retry or leaked client/stream. |
| One selected source failure | Preserve unrelated authorized tools under existing orchestration. | Widen/disable unrelated access. |
| Forbidden/oversized result field | Reject or safely normalize before model exposure. | Pass raw Core/module payload through. |

## Verification ownership matrix

| Component | Required evidence |
|---|---|
| LC-03/04/05 | Request-time one-call discovery, typed contract, lightweight readiness/no full reads, disabled/empty/failure behavior. |
| LC-06/07 | Current-response exact binding, selected-only registration, no arbitrary routing, no unselected loading. |
| LC-08/09 | Bounded typed input/output, selected-only Core execution, fixed safe errors, forbidden-data absence. |
| LC-10 | Refresh, timeout, cancellation, success/failure cleanup, no secret persistence/logging. |
| LC-11 | General/inventory/Stationary Energy/Concept Note/legacy/vector/auth compatibility and feature gates. |
| LC-12 | Safe fields, pre-emission redaction, low-cardinality outcome and timing evidence. |
| LC-13 | Deterministic doubles, negative security cases, partial PBT with reproducible seeds. |

## Traceability

| Logical component area | NFR Requirements | Functional Design / stories |
|---|---|---|
| LC-01–03 request-time context/orchestration | NFR-UOW02-01–04, 07, 15, 19, 20 | Active context/discovery model; US-03, US-07, US-09 |
| LC-04–05 Core client/discovery validation | NFR-UOW02-02, 04–05, 07, 11–18 | Typed Core contract/readiness separation; US-03, US-09 |
| LC-06–08 selection/tool/input/read | NFR-UOW02-03, 05, 09–12, 15–16, 21–22 | Selected-only/bounded-read model; US-03, US-09 |
| LC-09 errors/results | NFR-UOW02-07–08, 11–12, 15–16, 21 | Stable non-disclosure/error rules; US-03, US-09 |
| LC-10 lifecycle | NFR-UOW02-05, 07–08, 12–13, 20–21 | Token/resource lifecycle; US-07, US-09 |
| LC-11 compatibility/rollout | NFR-UOW02-06–08, 14, 19–21 | Workflow coexistence; US-07, US-09 |
| LC-12–13 operations/evidence | NFR-UOW02-09, 13, 17–18, 20–22 | Consumer evidence and safe telemetry; US-07, US-09 |

## Explicit non-goals

These logical components do not add a new deployable service, gateway, catalog
store, authorization domain, module adapter framework, raw-storage client,
shared cross-language package, authorization cache, circuit breaker, queue,
worker, or UI. Any such proposal requires a separately documented and approved
scope/NFR change.
