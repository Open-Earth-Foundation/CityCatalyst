# UOW-02 NFR Design — Climate Advisor Request-Time Integration Patterns

## Scope and design posture

This document maps the approved UOW-02 NFR Requirements to logical design
patterns for Climate Advisor's consumer side of CC-737. It preserves the
existing CityCatalyst Core and Climate Advisor boundaries and does not add a
service, storage owner, authorization domain, deployment topology, queue,
cache, circuit breaker, worker pool, or shared runtime.

Core remains authoritative for identity, every applicable scope relationship,
catalog state, exact capability mapping, source readiness, authorization, and
final bounded result shaping. Climate Advisor owns only request-time
orchestration and safe contract consumption.

The central performance and security distinction is:

```text
Request context resolved
        |
        v
Core discovery: safe filtering + lightweight non-content readiness
        |       (no CA capability loading, no full reads, no candidate fan-out)
        v
Current safe selection binding
        |
        v
Selected-only tool construction
        |
        v
Selected Core read: revalidation + one bounded source execution
        |
        v
Bounded result or stable non-disclosing error
```

## Pattern P-01 — Request-scoped orchestration

**Intent**: Start catalog consumption only after the existing message/stream
has resolved the authenticated user, bearer/session state, thread correlation,
active workflow, and applicable resource context.

**Structure**:

- Existing route/streaming flow remains the request entry point.
- `AgentService` or the narrowest existing request-time composition seam
  coordinates discovery before agent construction.
- The active context is immutable for selection binding and is not supplied by
  the model as replacement scope.
- Catalog state is short-lived request state, not a persisted authorization
  grant.

**NFRs covered**: NFR-UOW02-01, 02, 03, 10, 15, 19, 20.

**Guardrails**:

- No process-startup/global catalog discovery.
- No discovery before identity/context resolution.
- A changed active context cannot reuse a stale selection.
- Missing/inconsistent context yields no catalog-backed tools.

## Pattern P-02 — Typed Core client façade

**Intent**: Centralize discovery/read transport, auth-header propagation,
timeout, bounded response handling, one-time refresh, and safe error
classification.

**Structure**:

- Extend the existing `CityCatalystClient` responsibility with narrow typed
  discovery and selected-read operations.
- Keep Core endpoint details and service headers inside the client.
- Propagate the user bearer only through the existing secure client path.
- Validate response envelopes before returning data to orchestration/tools.
- Never expose upstream response bodies or exception text to the agent.

**NFRs covered**: NFR-UOW02-04, 05, 07, 11, 12, 14, 15, 16, 18.

**Guardrails**:

- No tool-level URL construction or direct module/storage call.
- No route derivation from source type, labels, source ID, or model output.
- No new cross-language transport or shared client runtime.

## Pattern P-03 — Lightweight discovery/readiness separation

**Intent**: Keep discovery cost and semantics distinct from selected bounded
execution.

**Discovery behavior**:

1. Call Core once for the active request after context resolution.
2. Core filters authorization, lifecycle, allowlist, and source eligibility.
3. Core may perform a lightweight non-content readiness/availability check.
4. Climate Advisor accepts only safe eligible projections.
5. No Climate Advisor capability implementation is loaded.
6. No full source read, content retrieval, or candidate-wide tool execution is
   performed.

**Selected-read behavior**:

1. Bind an exact current `catalog_id` and Core-issued `capability_id` pair.
2. Construct only that selected tool.
3. Validate only its typed bounded input.
4. Call only the selected Core read boundary.
5. Core revalidates and executes the bounded module operation.

**NFRs covered**: NFR-UOW02-02, 03, 04, 05, 21, 22.

**Guardrails**:

- A readiness result is never treated as source content.
- Discovery does not preload all capability modules.
- A selected read is not silently expanded into a batch.
- Metrics distinguish discovery/readiness from selected execution.

## Pattern P-04 — Current-response selection binding

**Intent**: Prevent stale/forged selections and arbitrary model routing while
leaving authorization to Core.

**Structure**:

- Store the bounded current discovery projection in request-scoped state.
- Match `catalog_id` and `capability_id` as an exact pair.
- Treat Core-issued IDs as opaque.
- Capture the active request context and selected descriptor in the tool
  closure/factory output.
- Reject absent, malformed, mismatched, or non-current selections before a
  Core read.

**NFRs covered**: NFR-UOW02-03, 09, 10, 11, 15, 16, 21, 22.

**Guardrails**:

- Selection membership is necessary for construction but not authorization.
- No automatic superseded-entry substitution.
- No route/module/source inference from labels or untrusted values.
- Core performs read-time revalidation even after a successful binding.

## Pattern P-05 — Selected-only capability factory

**Intent**: Minimize the agent tool surface and prevent speculative source
access.

**Structure**:

- A factory receives only the current eligible selection and descriptor.
- It creates one bounded source-specific wrapper for that selection.
- The wrapper exposes only declared capability input fields and finite bounds.
- Required identity/scope context is captured from the request, not model input.
- Existing workflow packs are composed under their current conditions; the
  catalog pack is additive and mode-aware.

**NFRs covered**: NFR-UOW02-02, 03, 05, 10, 14, 15, 20, 21.

**Guardrails**:

- No global registration of discovery entries or supported capabilities.
- No generic raw-source tool.
- No arbitrary user/org/project/city/inventory/source/storage arguments.
- Unselected entries remain unloaded and unread.

## Pattern P-06 — Core-authoritative bounded read

**Intent**: Make every selected read a fresh authorization and source-state
decision.

**Structure**:

1. Consumer sends the exact selection and typed bounded input to Core.
2. Core authenticates and binds the user.
3. Core rechecks catalog state, exact capability mapping, every applicable
   scope dimension, and source readiness.
4. The module-owned boundary executes only the approved bounded operation.
5. Core shapes/redacts/limits the result before the response crosses back.
6. Climate Advisor validates the bounded response and exposes the minimum
   typed content to the agent.

**NFRs covered**: NFR-UOW02-03, 05, 07, 09, 10, 11, 12, 15, 16, 21.

**Guardrails**:

- Discovery never substitutes for read-time authorization.
- Consumer validation cannot authorize or widen a read.
- No raw module/storage response crosses the boundary.
- No cache may bypass current Core revalidation.

## Pattern P-07 — Fail-closed safe error mapping

**Intent**: Preserve a stable non-disclosing contract and isolate failures.

**Structure**:

- Core selection-resolution failures remain HTTP `404`, code
  `capability_unavailable`, message `Requested capability is unavailable.`
- The client classifies the response without retaining/passing through the
  upstream body.
- The tool maps the result to the existing safe tool-error shape.
- Discovery failures produce no catalog-backed tools.
- Existing non-catalog tools continue only under their current orchestration
  rules.

**NFRs covered**: NFR-UOW02-07, 08, 09, 11, 12, 15, 18, 19, 21.

**Guardrails**:

- Do not distinguish stale, forged, unauthorized, deleted, or unavailable
  sources in model-visible output.
- Do not retry indefinitely or substitute another source.
- Do not disable unrelated tools solely because one selected tool failed.
- Authentication/transport errors remain generic and non-disclosing.

## Pattern P-08 — Existing token/reference and resource lifecycle

**Intent**: Reuse secure credential and cleanup behavior without creating a
durable secret or connection boundary.

**Structure**:

- Share the existing mutable request token reference used by Core-backed tools.
- Permit the existing one-time refresh path to update that reference.
- Keep clients, responses, streams, and tool resources request/tool bounded.
- Close resources on success, validation failure, timeout, cancellation, Core
  failure, and refresh failure.
- Persist refreshed tokens only through the existing token handler when its
  current workflow requires it.

**NFRs covered**: NFR-UOW02-05, 07, 08, 12, 13, 18, 20, 21.

**Guardrails**:

- Never log or serialize tokens/service keys.
- Never retain a source handle or client in selection state.
- Refresh cannot change selection or broaden scope.
- Cleanup is observable through deterministic tests, not secret logging.

## Pattern P-09 — Boundary redaction and safe observability

**Intent**: Make secret/non-disclosure enforcement happen before output or
telemetry emission.

**Structure**:

- Core remains the first result-shaping/redaction boundary.
- Climate Advisor validates the returned shape and removes/rejects forbidden
  fields before model/tool serialization.
- Structured logs/traces use safe correlation, permitted identity/selection
  references, coarse outcome, bounded duration, and dependency/timeout class.
- Raw request/response bodies, source content, scope details, credentials,
  signed URLs, storage paths, and upstream error text are excluded.

**NFRs covered**: NFR-UOW02-09, 10, 11, 12, 13, 18, 21.

**Guardrails**:

- Redaction occurs before the sink, not only in downstream retention.
- Telemetry must not distinguish hidden source states.
- Permitted IDs are logged only when they cannot disclose unauthorized
  existence under the approved policy.

## Pattern P-10 — Existing-workflow compatibility and rollout

**Intent**: Introduce catalog consumption additively and reversibly.

**Structure**:

- Deploy/verify Core contract first, then enable Climate Advisor consumption
  with existing feature controls.
- Keep general, inventory, Stationary Energy, Concept Note, legacy datasource,
  vector, auth, token-refresh, timeout, and cleanup conditions unchanged.
- When context/discovery/feature support is absent, omit catalog tools and keep
  existing behavior.
- Rollback disables the additive catalog path only.

**NFRs covered**: NFR-UOW02-06, 07, 08, 14, 19, 20, 21.

**Guardrails**:

- No raw-storage fallback during partial deployment.
- No unconditional catalog tools across workflow modes.
- No public API/UI or prompt contract change without separate approval.

## Pattern P-11 — Deterministic verification and operations evidence

**Intent**: Prove consumer behavior without production storage and make the
security boundary reviewable.

**Required evidence**:

- Client contract parsing for safe discovery/read responses and fixed errors.
- Discovery readiness invokes no full read and loads no source tools.
- Current selection binding and selected-only registration.
- Exactly one selected bounded read with Core revalidation fixture.
- Stale/forged/malformed/mismatched/unavailable non-disclosure.
- Forbidden-field, credential, storage, and raw-content absence.
- Timeout, one-time refresh, cancellation, cleanup, and failure isolation.
- Existing workflow/tool-pack compatibility and feature-gate behavior.
- Safe telemetry/redaction assertions.
- Partial property-based tests for pure selection, registration, bounds,
  serialization, and safe-error invariants with reproducible seeds.

**NFRs covered**: NFR-UOW02-09, 10, 17, 18, 20, 21, 22.

## Pattern-to-requirement matrix

| Pattern | Primary NFR coverage | Primary stories |
|---|---|---|
| P-01 Request-scoped orchestration | 01, 02, 03, 10, 15, 19, 20 | US-03, US-07, US-09 |
| P-02 Typed Core client façade | 04, 05, 07, 11, 12, 14–16, 18 | US-03, US-09 |
| P-03 Readiness separation | 02–05, 21–22 | US-03, US-09 |
| P-04 Selection binding | 03, 09–11, 15–16, 21–22 | US-03, US-09 |
| P-05 Selected-only factory | 02–03, 05, 10, 14–15, 20–21 | US-03, US-07, US-09 |
| P-06 Core bounded read | 03, 05, 07, 09–12, 15–16, 21 | US-03, US-09 |
| P-07 Safe error mapping | 07–09, 11–12, 15, 18–19, 21 | US-03, US-07, US-09 |
| P-08 Token/resource lifecycle | 05, 07–08, 12–13, 18, 20–21 | US-07, US-09 |
| P-09 Redaction/observability | 09–13, 18, 21 | US-03, US-07, US-09 |
| P-10 Compatibility/rollout | 06–08, 14, 19–21 | US-07, US-09 |
| P-11 Verification/operations | 09–10, 17–18, 20–22 | US-07, US-09 |

## Explicitly rejected patterns

- Global catalog/capability preloading.
- Full-read readiness probes for every discovered input.
- Consumer-side authorization as a substitute for Core.
- Direct Climate Advisor-to-module/storage/database access.
- Raw S3 credentials, signed URLs, storage paths, or unrestricted payloads.
- Authorization/result caching that bypasses per-read Core revalidation.
- Indefinite retries, stale authorization, automatic substitution, or raw
  fallback.
- New service, gateway, shared runtime, cache, circuit breaker, queue, worker,
  topology, or unrelated refactoring.

## Deferred implementation choices

Code Generation may select concrete module/function names, schema-library
models, exact numeric bounds from existing defaults, feature-flag wiring,
telemetry names, and test-file locations. The choices must preserve these
patterns and the approved UOW-01 Core contract.
