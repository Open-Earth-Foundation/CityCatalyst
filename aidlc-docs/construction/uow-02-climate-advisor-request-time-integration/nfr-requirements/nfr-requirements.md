# UOW-02 NFR Requirements — Climate Advisor Request-Time Integration

## Scope and status

This document records the non-functional requirements for Climate Advisor's
consumer side of Linear CC-737 after approval of the UOW-02 Functional Design.
It covers request-time Core discovery, selected-only tool registration and
execution, bounded consumer contracts, safe failures/telemetry, resource
lifecycle, and existing workflow compatibility.

These requirements inherit the approved Core contract and existing CityCatalyst
and Climate Advisor objectives. They do not create a new service, storage
owner, catalog database, authorization domain, deployment topology, transport,
or UI. Application implementation remains gated by subsequent NFR Design and
Code Generation approvals.

## Fixed security and ownership constraints

The following requirements are release-blocking and cannot be traded for
performance, availability, convenience, or compatibility:

1. Core is the final authority for authenticated identity, every applicable
   user/organization/project/city/inventory relationship, catalog lifecycle,
   capability allowlist, source readiness, authorization, and bounded result
   shaping.
2. Climate Advisor is an orchestrator and consumer. It must not authorize
   users, infer routes/capabilities from untrusted data, access catalog or
   source storage, or treat discovery as a durable access grant.
3. Discovery is request-time and bounded. It may use Core's lightweight,
   non-content readiness evaluation but must not load Climate Advisor
   capabilities or execute full reads for every catalog candidate.
4. Only the selected current discovery entry and its Core-issued capability
   may be loaded and executed for a request. Global pre-registration,
   speculative fan-out, and arbitrary source selection are prohibited.
5. Every selected read remains subject to Core revalidation. Stale, forged,
   malformed, unknown, mismatched, unauthorized, withdrawn, superseded,
   missing, deleted, or unavailable selections must not disclose metadata or
   content.
6. The approved selection-resolution outcome remains HTTP `404`, code
   `capability_unavailable`, message `Requested capability is unavailable.`
   Climate Advisor must preserve it without upstream error/body disclosure.
7. Inputs and results are explicit, typed, finite, and field-allowlisted.
   Climate Advisor receives no S3 credentials, bearer/service credentials,
   signed URLs, raw storage access, direct database access, storage paths as
   access mechanisms, or unrestricted source payloads.
8. NativeInputCatalog and module systems of record remain existing owners.
   Existing authentication, feature flags, token refresh, timeout, cleanup,
   CI/CD, deployment, rollback, and operations practices remain in force.

## Capacity and performance

### NFR-UOW02-01 — Inherit measured workload baselines

Discovery, selection, tool construction, and selected reads must use the
current Climate Advisor/Core internal workload baseline. Verification must
measure request rate, concurrency, burst behavior, active workflow mix,
discovery result size, selected-read distribution, and existing client/tool
latency before introducing any threshold. CC-737 adds no fixed capacity target
without evidence.

**Classification**: Baseline; blocking against unbounded work.

**Traceability**: Approved NFR Q1; FR-04, FR-05; NFR-03, NFR-04; US-03, US-07,
US-09.

### NFR-UOW02-02 — Bounded request-time discovery

An eligible request performs at most one Core discovery operation after active
identity/context resolution. Discovery work, response count, field count, and
payload size must use existing bounded conventions. Discovery may perform only
lightweight non-content readiness checks; it must not load Climate Advisor
capability implementations, retrieve source content, or execute full reads for
all candidates.

**Classification**: Blocking.

**Traceability**: Approved NFR Q2; FR-01, FR-04, FR-05; NFR-01, NFR-03,
NFR-07; US-03, US-09.

### NFR-UOW02-03 — Selected-only tool and execution bounds

The request-scoped tool surface must contain only the selected current
Core-issued capability needed by the active request. A tool invocation may
execute only that selected bounded read, with no speculative or unbounded
fan-out, global capability registration, bulk source read, or arbitrary
model-selected capability.

**Classification**: Blocking.

**Traceability**: Approved NFR Q3; FR-03, FR-04, FR-08; NFR-01, NFR-03,
NFR-07; US-03, US-09.

### NFR-UOW02-04 — Separate discovery and selected-read performance

Performance evidence must measure discovery/readiness, selected tool
construction, and selected bounded execution as separate activities. Readiness
cost must not be hidden inside a full-read measurement, and discovery must not
be optimized by preloading or reading every source. Existing client and
workflow timeout conventions remain the baseline; no new release-blocking
percentile target is introduced without platform evidence.

**Classification**: Blocking for measurement integrity; baseline for target.

**Traceability**: Approved NFR Q2/Q4; FR-04, FR-05, FR-10; NFR-03, NFR-08;
US-03, US-09.

### NFR-UOW02-05 — Finite inputs, outputs, and resources

Capability inputs, Core response envelopes, bounded tool results, tool count,
and retained in-flight state must conform to approved finite limits. Oversized,
malformed, or forbidden data must be rejected or safely normalized before
model exposure. HTTP clients, responses, streams, and per-tool resources must
be released on success, failure, timeout, refresh failure, and cancellation.

**Classification**: Blocking.

**Traceability**: Approved NFR Q5; FR-05, FR-10; NFR-01, NFR-03, NFR-08;
US-03, US-09.

## Availability and reliability

### NFR-UOW02-06 — Inherit continuity objectives

Climate Advisor catalog consumption inherits existing CityCatalyst/Core and
Climate Advisor availability, RTO/RPO, disaster-recovery, incident,
deployment, and rollback objectives. CC-737 introduces no independent uptime,
multi-region, or disaster-recovery target.

**Classification**: Baseline.

**Traceability**: Approved NFR Q6; FR-08, FR-10; NFR-04, NFR-05; US-07,
US-09.

### NFR-UOW02-07 — Fail closed on dependency failure

Core discovery/read, token/session, validation, permission, module, timeout,
and malformed-response failures must not produce an unauthorized source
result. Discovery failure omits catalog-backed tools. A selected-resolution
failure preserves the stable safe error. Climate Advisor must not use cached
authorization, substitute a source, retry indefinitely, or fall back to raw
storage/legacy unrestricted access.

**Classification**: Blocking.

**Traceability**: Approved NFR Q7; FR-06, FR-07, FR-10; NFR-01, NFR-04;
US-03, US-07, US-09.

### NFR-UOW02-08 — Isolate selected-tool failures

Failure of one selected catalog-backed tool must not authorize, expose, or
change the availability of an unrelated capability. Existing authorized tools
may continue only under their current orchestration contract. A failed
selection cannot trigger another source read or widen the tool surface.

**Classification**: Blocking.

**Traceability**: Approved NFR Q7; FR-04, FR-10; NFR-04; US-03, US-07, US-09.

## Security and privacy

### NFR-UOW02-09 — Release-blocking consumer threat model

Review and verification must cover:

- service/user confused-deputy behavior and Core authorization bypass;
- IDOR and cross-user, organization, project, city, and inventory selection;
- stale, forged, malformed, unknown, and capability-mismatched selections;
- discovery/read existence oracles and unauthorized metadata disclosure;
- route, module, source, capability, label, and model-input injection;
- global pre-registration, speculative fan-out, and resource-exhaustion abuse;
- credentials, bearer tokens, signed URLs, storage paths, and raw-object/data
  exposure; and
- unsafe logs, telemetry, upstream error text, and unrestricted payloads.

**Classification**: Blocking.

**Traceability**: Approved NFR Q8; FR-01 through FR-07, FR-09 through FR-11;
NFR-01, NFR-02, NFR-06, NFR-08; US-03, US-07, US-09.

### NFR-UOW02-10 — Defense-in-depth placement

Core must enforce authentication, user binding, every applicable scope check,
catalog state, exact allowlisting, source readiness, input/output bounds,
redaction, safe errors, and safe telemetry. Module boundaries enforce source
ownership. Climate Advisor must enforce request-time discovery, current-result
selection binding, selected-only loading, typed consumer validation, safe error
mapping, and cleanup, without treating those checks as a replacement for Core
authorization.

**Classification**: Blocking.

**Traceability**: Approved NFR Q11; FR-03 through FR-07, FR-09, FR-10;
NFR-01, NFR-02, NFR-07; US-03, US-07, US-09.

### NFR-UOW02-11 — Non-disclosure consistency

The consumer-visible behavior for stale, forged, malformed, unknown,
mismatched, unauthorized, withdrawn, superseded, missing, deleted, and
unavailable selections must not reveal which condition occurred. Climate
Advisor must preserve the stable `capability_unavailable` response and must
not expose source/catalog identity, lifecycle, scope, permission, storage, or
upstream error details.

**Classification**: Blocking.

**Traceability**: Approved NFR Q8/Q12; FR-04, FR-06, FR-07, FR-10;
NFR-01, NFR-06; US-03, US-09.

### NFR-UOW02-12 — Secret and storage isolation

No bearer token, service key, S3 credential, signed URL, storage object/path,
direct database data, raw module response, or unrestricted source payload may
appear in a Climate Advisor tool result, prompt-visible error, selection
record, log, metric, trace, or persisted workflow context. Redaction/rejection
must occur before serialization or telemetry emission.

**Classification**: Blocking.

**Traceability**: Approved NFR Q8/Q11; FR-05, FR-07, FR-09, FR-11;
NFR-01, NFR-02, NFR-06; US-03, US-09.

### NFR-UOW02-13 — Privacy and retention

Use existing privacy and log-retention policies. Consumer telemetry may retain
only safe correlation/caller references, approved IDs where permitted, coarse
outcome categories, bounded durations, and dependency/timeout categories. Raw
requests/responses, source content, unnecessary scope identifiers, and secrets
must not be retained for troubleshooting.

**Classification**: Blocking for privacy/secret handling; baseline for duration.

**Traceability**: Approved NFR Q9; FR-09, FR-10; NFR-06; US-07, US-09.

## Technology and integration constraints

### NFR-UOW02-14 — Reuse the existing Climate Advisor stack

Implementation must reuse the existing Climate Advisor Python/FastAPI/httpx,
Pydantic/schema validation, Agents SDK/tool, streaming, token, and pytest
patterns together with the approved Core internal HTTP contract. No new
framework, client stack, transport, service, storage layer, or shared
cross-language runtime is required by CC-737.

**Classification**: Blocking against unauthorized technology expansion;
baseline for reuse.

**Traceability**: Approved NFR Q10; FR-08, FR-10, FR-11; NFR-05, NFR-07,
NFR-08; US-07, US-09.

### NFR-UOW02-15 — Boundary-local enforcement

The client owns Core transport, authentication-header propagation, timeout,
bounded response handling, and existing one-time refresh conventions. Request
orchestration owns active-context timing and selected-only composition. Tools
own typed input validation and safe result/error mapping. Core and module
boundaries remain authoritative for authorization, source state, source
ownership, and result shaping.

No consumer check may be treated as sufficient if Core enforcement is absent.

**Classification**: Blocking.

**Traceability**: Approved NFR Q11; FR-03 through FR-06, FR-08, FR-10;
NFR-01, NFR-02, NFR-07; US-03, US-07, US-09.

### NFR-UOW02-16 — Explicit typed compatibility contract

Discovery, selection, capability input, bounded result, and safe error
contracts must remain explicit and typed within existing internal API
conventions. Core-issued IDs remain opaque. Contract changes require
synchronized Core/Climate Advisor contract and regression evidence before the
feature is enabled. Existing workflow-specific contracts are not replaced.

**Classification**: Blocking.

**Traceability**: Approved NFR Q12; FR-03 through FR-05, FR-08, FR-11;
NFR-05, NFR-07, NFR-08; US-03, US-07, US-09.

## Maintainability and observability

### NFR-UOW02-17 — Explicit consumer contract documentation

Selection binding, tool-registration conditions, input/output bounds,
redaction, stable error mapping, token/resource lifecycle, workflow
coexistence, and Core ownership must remain explicit and documented near
existing client, agent, and tool patterns. Deterministic fixtures must be
available for downstream verification without production storage access.

**Classification**: Blocking for contract clarity.

**Traceability**: Approved NFR Q10; FR-03, FR-05, FR-11; NFR-07, NFR-08;
US-03, US-09.

### NFR-UOW02-18 — Safe low-cardinality observability

Telemetry must support discovery/read correlation, selected registration,
latency/timeout analysis, dependency failure, refresh failure, cleanup, and
rollout verification without becoming an existence oracle. Redaction applies
before emission. Allowed values are the approved safe caller/correlation
reference, permitted catalog/capability identity, coarse outcome, bounded
duration, and dependency/timeout category.

**Classification**: Blocking.

**Traceability**: Approved NFR Q9; FR-07, FR-09, FR-10; NFR-04, NFR-06;
US-07, US-09.

## Compatibility and rollout

### NFR-UOW02-19 — Core-first feature-gated rollout

Use existing feature flags and deployment/rollback processes. Core's approved
contract must be deployed and verified before Climate Advisor consumption is
enabled. When catalog context, discovery, or the feature boundary is absent,
existing workflows remain available and no catalog-backed tools are registered.
Rollback disables only the additive catalog path and never activates storage
fallback.

**Classification**: Blocking for rollout safety.

**Traceability**: Approved NFR Q13; FR-08, FR-10; NFR-04, NFR-05; US-07,
US-09.

### NFR-UOW02-20 — Existing workflow compatibility

Regression evidence must cover general chat, inventory, Stationary Energy
review/start-draft, Concept Note, legacy datasource, vector fallback,
service-authentication, bearer/session binding, token refresh, timeout,
cancellation, cleanup, and feature-gate behavior. Catalog-driven tools must
not silently replace or widen existing workflow packs.

**Classification**: Blocking.

**Traceability**: Approved NFR Q12/Q13; FR-08, FR-10, FR-11; NFR-04, NFR-05,
NFR-08; US-07, US-09.

## Verification and release gates

### NFR-UOW02-21 — Release-blocking consumer evidence

Existing CI gates must include passing Climate Advisor contract/security and
compatibility evidence for:

- one-per-request discovery after active context resolution;
- lightweight readiness with no full-read or capability-loading fan-out;
- current-response selection binding and selected-only tool registration;
- exactly selected bounded execution through Core;
- Core revalidation consumption and opaque capability IDs;
- authorized and denied/stale/forged/malformed/unavailable selection behavior;
- stable non-disclosing errors and forbidden-field absence;
- bounded inputs/results and no storage credentials/raw storage access;
- token refresh, timeout, cancellation, client/resource cleanup, and failure
  isolation;
- existing workflow/tool-pack compatibility and feature-gated rollout; and
- safe telemetry plus redaction before emission.

**Classification**: Blocking.

**Traceability**: Approved NFR Q14; FR-11; NFR-01, NFR-04, NFR-08; US-09.

### NFR-UOW02-22 — Partial property-based evidence

Where practical, pure selection membership, selected-only registration,
safe-projection, input/output bounds, serialization, and safe-error mapping
must use domain generators, shrinking, and reproducible seeds. Property-based
evidence supplements and does not replace critical example-based security,
authorization, compatibility, and lifecycle tests.

**Classification**: Blocking for applicable invariants; evidence-driven for
coverage selection.

**Traceability**: Approved NFR Q14; FR-11; NFR-08; US-09.

## NFR traceability summary

| NFR area | Requirements | Stories | Linear CC-737 concern |
|---|---|---|---|
| Request-time discovery/readiness | FR-01, FR-04, FR-05, FR-06; NFR-01, NFR-03 | US-03, US-09 | Discover at request time without full reads or CA capability loading. |
| Selected-only loading/execution | FR-03, FR-04, FR-08; NFR-01, NFR-03, NFR-07 | US-03, US-09 | Load and execute only the selected Core-issued capability. |
| Bounds, errors, and storage isolation | FR-05, FR-06, FR-07, FR-10; NFR-01, NFR-02, NFR-06 | US-03, US-09 | Bounded Core-mediated reads and no credentials/raw storage. |
| Reliability and lifecycle | FR-09, FR-10; NFR-03, NFR-04, NFR-06 | US-07, US-09 | Timeouts, refresh, cancellation, cleanup, and isolated failure. |
| Compatibility and rollout | FR-08, FR-10, FR-11; NFR-04, NFR-05, NFR-08 | US-07, US-09 | Preserve current workflow packs and feature-gated rollout. |
| Security and evidence | FR-01 through FR-11; NFR-01, NFR-06, NFR-08 | US-03, US-07, US-09 | Contract/security/compatibility evidence at the CA boundary. |

## Deferred NFR Design choices

NFR Design and Code Generation may still determine concrete numeric limits from
existing defaults, metric/event names, schema-library types, client lifetime
implementation, feature-flag name, fixture location, and CI command wiring.
Those choices must satisfy every blocking requirement above and may not create
a new authorization, storage, persistence, transport, or topology boundary.
