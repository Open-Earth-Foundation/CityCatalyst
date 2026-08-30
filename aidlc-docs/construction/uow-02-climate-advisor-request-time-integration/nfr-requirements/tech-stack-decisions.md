# UOW-02 NFR Requirements — Technology Stack Decisions

## Decision scope

These decisions support Climate Advisor's consumer side of CC-737 in the
existing CityCatalyst brown-field monorepo. They reuse current runtimes,
clients, request orchestration, tool factories, token handling, validation,
testing, and operations patterns. They do not authorize application code or
introduce a new storage, authorization, transport, or deployment boundary.

The discovery/readiness distinction is explicit throughout: Core discovery may
perform a lightweight non-content readiness check, while Climate Advisor loads
and executes only the selected capability during a later bounded read.

## Decisions

### TS-UOW02-01 — Reuse the existing Climate Advisor runtime and structure

**Decision**: Implement consumer behavior inside the existing Python
3.11–3.12/FastAPI/Uvicorn Climate Advisor service using its established
`service/app/services`, `service/app/tools`, `service/app/utils`, and test
layouts.

**Rationale**: The service already centralizes agent lifecycle, workflow
context, Core client access, token handling, streaming, and tool composition.
A second runtime or service would create unnecessary contract and lifecycle
drift.

**Constraints**:

- Preserve the existing route/streaming → `AgentService` → tool-pack flow.
- Keep all source access behind the Core client boundary.
- Do not add a new storage owner, catalog database, or authorization service.

**Traceability**: NFR-UOW02-14, NFR-UOW02-15, NFR-UOW02-17; FR-08, FR-10,
FR-11; US-07, US-09.

### TS-UOW02-02 — Extend the existing CityCatalyst client boundary

**Decision**: Add narrow typed client operations for Core discovery and one
selected read to the existing `CityCatalystClient` pattern. Endpoint details,
service headers, bearer propagation, timeout, one-time refresh, response
validation, and safe error classification remain encapsulated in the client.

**Rationale**: Existing client behavior already provides the correct
service-authenticated internal HTTP boundary and token-refresh conventions.
Having tools construct URLs or call source endpoints would bypass ownership
and create a second security boundary.

**Constraints**:

- Use only the approved Core discovery/read contracts and opaque Core-issued
  capability IDs.
- Do not derive routes from `source_type`, labels, source IDs, model output, or
  arbitrary request strings.
- Discovery is one request-time lightweight operation; selected read is a
  separate bounded operation.
- Never expose upstream response bodies, storage details, or credentials.

**Traceability**: NFR-UOW02-02, NFR-UOW02-04, NFR-UOW02-07, NFR-UOW02-11,
NFR-UOW02-15, NFR-UOW02-16; FR-04 through FR-07, FR-10; US-03, US-09.

### TS-UOW02-03 — Use the existing request-context and streaming lifecycle

**Decision**: Resolve active identity, thread, bearer, workflow mode, and
applicable resource context through the current message/streaming flow before
request-time catalog discovery. Pass the resolved context into agent/tool
construction without allowing the model to replace it.

**Rationale**: Existing `StreamingHandler`, workflow context, and message route
already govern active request state and preserve general, Stationary Energy,
and Concept Note routing. Reusing them avoids stale-context and compatibility
drift.

**Constraints**:

- Discovery does not run at service startup or global agent initialization.
- A changed active request context supersedes stale persisted thread context.
- Missing/inconsistent context omits catalog-backed tools safely.
- No UI/public API context expansion is required.

**Traceability**: NFR-UOW02-01, NFR-UOW02-02, NFR-UOW02-19, NFR-UOW02-20;
FR-01, FR-04, FR-08; US-03, US-07, US-09.

### TS-UOW02-04 — Use a request-scoped selection coordinator

**Decision**: Keep the current Core discovery response in bounded request
state and use a narrow coordinator/factory seam to match a selected
`catalog_id` with its exact Core-issued `capability_id`, active context, and
typed capability descriptor.

**Rationale**: Selection membership and tool registration belong to the
consumer, while authorization remains in Core. A request-scoped binding
prevents global capability registration and arbitrary model routing.

**Constraints**:

- A pair not present in the current discovery response cannot construct a
  catalog-backed tool.
- The coordinator treats capability IDs as opaque and never infers routes.
- Selection state is short-lived and contains no token, source handle, storage
  credential, or durable authorization grant.

**Traceability**: NFR-UOW02-03, NFR-UOW02-10, NFR-UOW02-15, NFR-UOW02-16;
FR-03, FR-04, FR-08; US-03, US-09.

### TS-UOW02-05 — Use selected-only tool factories and existing Agents SDK patterns

**Decision**: Construct source-specific tool wrappers with the existing
Climate Advisor Agents SDK/tool-factory conventions only after a current
selection is bound. Expose typed bounded fields and capture active context
internally.

**Rationale**: Existing tool factories provide the established model-facing
contract, error, token-reference, and lifecycle seams. Selected-only factories
minimize the model's tool surface and prevent speculative source access.

**Constraints**:

- Discovery readiness never imports, instantiates, or executes all source tools.
- Only the selected capability is loaded and invoked; unselected entries remain
  unloaded and unread.
- No generic raw-source tool, arbitrary source argument, raw storage field,
  route, or capability selection is exposed.
- Existing general, inventory, Stationary Energy, Concept Note, legacy, and
  vector tool-pack registration rules remain unchanged.

**Traceability**: NFR-UOW02-02, NFR-UOW02-03, NFR-UOW02-10, NFR-UOW02-20;
FR-03, FR-04, FR-05, FR-08; US-03, US-07, US-09.

### TS-UOW02-06 — Reuse the existing token reference and refresh flow

**Decision**: Share the existing request/tool token reference and one-time
refresh behavior used by Climate Advisor's Core-backed tools. A refreshed
token may update the request reference and follow the existing persistence
path; refresh errors remain safe and bounded.

**Rationale**: The established token handler and client methods already bind
refresh to the user and support persistence/cleanup. A new credential store or
per-tool durable credential would violate storage isolation.

**Constraints**:

- Tokens and service keys remain runtime-only secrets.
- No token or refresh response is included in prompts, tool results, logs,
  metrics, traces, or selection state.
- Refresh cannot change the selected catalog/capability pair or trigger a raw
  storage fallback.

**Traceability**: NFR-UOW02-05, NFR-UOW02-07, NFR-UOW02-12, NFR-UOW02-20;
FR-09, FR-10; US-07, US-09.

### TS-UOW02-07 — Preserve typed bounded contracts with existing schema patterns

**Decision**: Use the existing Climate Advisor Pydantic/schema-validation
patterns for discovery envelopes, selection pairs, capability inputs, bounded
results, and safe tool errors. Core remains authoritative for the source
schema, bounds, redaction, and stable selection-resolution response.

**Rationale**: Explicit validation at the consumer boundary detects contract
drift without shifting authorization into Climate Advisor.

**Constraints**:

- Unknown/malformed required discovery or result data fails closed without
  passing upstream bodies through.
- The approved Core `404` / `capability_unavailable` / generic message is
  preserved at the tool boundary.
- Consumer validation cannot add fields, widen bounds, or authorize a source.

**Traceability**: NFR-UOW02-05, NFR-UOW02-11, NFR-UOW02-16, NFR-UOW02-17;
FR-05, FR-07, FR-10, FR-11; US-03, US-09.

### TS-UOW02-08 — Keep resource lifetime short and explicit

**Decision**: Reuse the existing `httpx` async-client, response, stream,
`AgentService`, and tool cleanup patterns. Discovery/read resources are
request/tool bounded and close on success, validation failure, timeout,
cancellation, Core failure, and refresh failure.

**Rationale**: Existing cleanup conventions are already exercised by Climate
Advisor's inventory and source tools. Explicit terminal-path cleanup prevents
connection/token leakage and resource exhaustion.

**Constraints**:

- Do not retain a client, response, source handle, or credential in durable
  selection state.
- A timeout cannot become an unbounded retry or source fallback.
- Cleanup evidence is release-blocking for the catalog-backed path.

**Traceability**: NFR-UOW02-05, NFR-UOW02-07, NFR-UOW02-08, NFR-UOW02-20;
FR-09, FR-10; US-07, US-09.

### TS-UOW02-09 — Reuse existing safe errors and observability conventions

**Decision**: Map Core selection-resolution failures to the existing safe
Climate Advisor tool-error shape while preserving the fixed generic contract.
Use the service's existing logging/trace/telemetry mechanisms with explicit
redaction before emission.

**Rationale**: Existing observability can correlate failures without adding a
new telemetry service or exposing source state. The stable error prevents
consumer-side existence oracles.

**Constraints**:

- Never pass through Core response bodies, upstream exception text, source
  state, scope/permission reasons, storage details, or credentials.
- Allowed telemetry is limited to safe correlation/caller reference, permitted
  selected identity, coarse outcome, bounded duration, and dependency/timeout
  category.
- Telemetry must not distinguish unauthorized/unavailable source existence.

**Traceability**: NFR-UOW02-11, NFR-UOW02-12, NFR-UOW02-13, NFR-UOW02-18;
FR-07, FR-09, FR-10; US-03, US-09.

### TS-UOW02-10 — Use deterministic service-local and cross-service fixtures

**Decision**: Use existing Climate Advisor pytest/asyncio tests with
deterministic doubles for the Core client, discovery response, selected-read
response, token refresh, timeouts, cancellation, tool factories, workflow
packs, and cleanup. UOW-03 consumes the approved Core fixtures/contracts
without creating a shared runtime dependency.

**Rationale**: Service-local tests can prove selected-only behavior and safe
consumer transformations without production storage. Cross-service fixtures
prevent the consumer from redefining Core semantics.

**Constraints**:

- Example-based security and compatibility tests are mandatory.
- Partial property-based tests cover pure selection, registration,
  serialization, bounds, and safe-error invariants with reproducible seeds.
- Tests must prove readiness does not load/read sources and selected execution
  invokes only the chosen capability.

**Traceability**: NFR-UOW02-09, NFR-UOW02-17, NFR-UOW02-21, NFR-UOW02-22;
FR-11, NFR-08; US-07, US-09.

### TS-UOW02-11 — Reuse feature-gated rollout and existing topology

**Decision**: Roll out Core first, verify its contract, then enable the
Climate Advisor additive path using existing feature flags, CI/CD, deployment,
monitoring, rollback, and incident processes. Add no new service, queue,
worker, cache, database, region, storage, or shared runtime.

**Rationale**: The approved requirements inherit platform operations and make
Core-first sequencing the safest brown-field rollout. Existing workflows remain
available when the catalog path is disabled or unavailable.

**Constraints**:

- Rollback disables catalog-driven consumption only.
- Rollback never activates raw storage, legacy unrestricted access, or a second
  authorization path.
- No public API/UI change is required for this unit.

**Traceability**: NFR-UOW02-06, NFR-UOW02-07, NFR-UOW02-19, NFR-UOW02-20;
FR-08, FR-10; US-07, US-09.

## Technology decision matrix

| Concern | Selected existing pattern | Explicitly rejected for CC-737 |
|---|---|---|
| Runtime/structure | Existing Climate Advisor Python/FastAPI service and current app layout | New service/runtime |
| Core transport | Existing typed `CityCatalystClient` internal HTTP boundary | Direct module/storage calls, generic bypass helper, new transport |
| Request orchestration | Existing message/streaming → `AgentService` lifecycle | Startup/global catalog loading or a second coordinator outside the request flow |
| Selection/tools | Existing Agents SDK tool factories with request-scoped selected-only binding | Global tool registration, generic raw-source tool, model-derived routes |
| Schema/contracts | Existing Pydantic/schema validation plus approved Core contract | Untyped pass-through or client-side authorization |
| Tokens/resources | Existing token reference, refresh, `httpx`, and cleanup patterns | Durable credentials, per-tool secret stores, leaked clients/streams |
| Tests | Existing pytest/asyncio deterministic doubles and partial PBT | Happy-path-only, production-storage-dependent evidence |
| Operations | Existing flags, CI/CD, monitoring, deployment, rollback, incident process | New topology, queue, cache, worker, region, storage, or DR target |

## Decision guardrails

Any later implementation proposal must demonstrate that it:

1. starts discovery only after active request identity/context resolution;
2. performs lightweight non-content readiness only during discovery;
3. loads and executes only the selected Core-issued capability;
4. preserves Core as authorization and result-shaping authority;
5. preserves module source ownership and bounded result contracts;
6. prevents tokens, credentials, signed URLs, storage access, and unrestricted
   payloads from reaching Climate Advisor output/telemetry; and
7. reuses existing lifecycle, workflow, test, feature-gate, and operations
   patterns without unrelated refactoring.

If a new technology, topology, storage boundary, authorization path, or
cross-service shared runtime becomes necessary, work pauses for a separately
documented and approved scope/NFR change.

## Deferred implementation details

NFR Design and Code Generation may choose concrete schema/model names, client
method names, tool factory location, metric names, exact numeric bounds from
current defaults, feature-flag wiring, and test-file placement. Those choices
must remain inside this decision set and all approved Functional Design/NFR
Requirements constraints.
