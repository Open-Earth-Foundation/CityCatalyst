# UOW-02 Functional Design — Business Logic Model

## Purpose and scope

This model defines how Climate Advisor consumes the approved CityCatalyst Core
NativeInputCatalog discovery and selected-read capabilities for CC-737. It is
technology-agnostic at the behavior level and is constrained by the existing
Climate Advisor request, workflow, client, token, streaming, and tool-pack
boundaries.

This unit owns the consumer behavior only. Core remains the sole authority for
catalog discovery, authorization, source-state validation, capability mapping,
and bounded result shaping. Climate Advisor must not become a catalog owner,
authorization authority, source owner, or storage client.

The model covers US-03, US-07, and US-09 and consumes the approved UOW-01 Core
contract. It does not authorize application-code changes, prompt changes, or
NFR Requirements work by itself.

## Actors and authority

| Actor or boundary | Responsibility in this unit | Authority it does not have |
|---|---|---|
| City Climate User (P-01) | Starts a chat request in the active CityCatalyst context and receives bounded assistance. | Cannot broaden request scope or authorize a catalog entry. |
| Climate Advisor service (P-02) | Resolves request context, asks Core for discovery, binds a current selection, and constructs selected request-scoped tools. | Cannot decide whether a source is authorized, derive routes, or read storage. |
| CityCatalyst Core | Authenticates the service call, evaluates user/scope/source state, issues safe discovery entries and bounded read results. | Does not transfer catalog or module source ownership to Climate Advisor. |
| Existing Climate Advisor workflow/tool packs | Preserve general chat, inventory, Stationary Energy, Concept Note, legacy datasource, and vector behavior under their current rules. | Must not be replaced or widened by catalog-driven tools. |
| Security and operations governance (P-04) | Reviews consumer non-disclosure, selected-only loading, cleanup, telemetry, and evidence. | Is not an end user or alternate authorization path. |

## Trust and data-flow boundaries

```text
Authenticated message request
        |
        v
Existing route/session/request-context resolution
        |
        v
Request-scoped Climate Advisor coordinator
        |  (typed context; user bearer propagated)
        v
Core discovery ----------------------+
        | safe eligible entries       |
        v                             |
Selection binding                     |
        | exact catalog_id +           |
        | Core-issued capability_id   |
        v                             |
Selected-only tool factory           |
        | typed bounded input         |
        v                             |
Core selected read ------------------+
        | bounded typed result/error  |
        v                             |
Agent execution and safe tool output
```

The discovery response is a point-in-time selection input, not an authorization
grant. Core revalidates every selected read. Climate Advisor receives neither
raw catalog scope data nor module/storage details.

## Request lifecycle

### 1. Resolve the active request

The existing message route and streaming flow establish the authenticated user,
thread, bearer token, workflow context, and applicable organization, project,
city, and inventory context. The effective user is the authenticated user; a
model message, persisted conversation, or arbitrary tool argument cannot
replace it. Missing or inconsistent context is not silently broadened.

The catalog-driven path is considered only after identity and active request
context are resolved. It is not run at process startup, during global agent
configuration, or against every possible workflow.

### 2. Perform request-time discovery

For an active request where the catalog-driven path is allowed, Climate Advisor
uses the existing user-scoped bearer and service-authenticated
`CityCatalystClient` boundary to call Core discovery once for that request.
The client owns endpoint details, request serialization, timeout, and existing
one-time token-refresh behavior.

Core performs candidate filtering and a lightweight readiness check. Discovery:

- evaluates the authorized catalog scope and exact allowlist in Core;
- may ask a source boundary whether the mapped operation is available/readable;
- does not load Climate Advisor capability implementations;
- does not execute a full source read;
- does not read every discovered input's content; and
- returns only safe eligible entries and Core-issued capability IDs.

An empty, disabled, timed-out, or unavailable discovery result produces no
catalog-backed tools. Existing workflow tools continue under their existing
conditions, and no raw-storage or legacy unrestricted fallback is introduced.

### 3. Bind a selection

Climate Advisor may bind only an entry from the current Core discovery response.
The binding retains the exact `catalog_id` and Core-issued `capability_id`
together with the active request context and the capability's typed input
contract. A label, source type, source ID, route string, model-generated name,
or persisted selection by itself is never enough.

Selection binding is a consumer-side integrity check and an input-construction
step; it is not authorization. Core performs the authoritative revalidation on
the selected read.

### 4. Construct selected-only tools

The request-scoped tool factory creates tools only for the selected eligible
entries and their Core-issued capabilities needed by the active request. It
does not pre-register every discovery result, every supported source, or a
generic raw-source tool. It does not dynamically import or load source-specific
Climate Advisor capability code for unselected entries.

Each constructed tool captures the exact selection and active request context.
The model can supply only the capability's declared bounded fields. Required
scope and identity values are derived or bound from the request context; the
model cannot supply replacement user, organization, project, city, inventory,
catalog, capability, route, source, or storage identifiers.

### 5. Execute one selected bounded read

When the selected tool is invoked, the client sends the exact Core-issued
selection plus typed bounded input through the existing internal service
boundary. Core revalidates identity, every applicable scope dimension, current
catalog state, exact capability mapping, source readiness, and result bounds
before executing the module-owned operation.

Only the selected capability may be loaded and executed. Discovery readiness is
not execution, and no request path may turn discovery into a loop of full reads.
The selected capability's result is already shaped by Core; Climate Advisor
performs only contract validation and safe serialization needed for the tool
boundary.

### 6. Transform success or failure safely

Successful output contains only the declared bounded fields. Climate Advisor
does not pass through raw upstream JSON, storage objects, signed URLs, storage
keys/paths, credentials, or unrestricted source payloads.

The approved Core selection-resolution contract is HTTP `404`, code
`capability_unavailable`, message `Requested capability is unavailable.`
Climate Advisor preserves that stable contract at the tool boundary and does
not expose upstream response text or distinguish stale, forged, malformed,
unauthorized, withdrawn, superseded, missing, deleted, or unavailable state.

Transport/authentication failures that are outside selection resolution remain
governed by existing Climate Advisor error handling, but still cannot disclose
source metadata or secrets.

### 7. Complete and clean up

The request continues with unrelated existing tools only under the current
orchestration contract. A selected-tool failure does not make another source
available and does not disable unrelated authorized tools by implication.

The existing mutable token reference may be updated by the approved one-time
refresh path and persisted using the existing token handler. Request/tool HTTP
clients and other resources are closed on success, failure, timeout, refresh
failure, and cancellation. No token or credential is included in logs, tool
results, prompts, or persisted selection state.

## Workflow coexistence

| Active mode | Existing behavior | Catalog-driven behavior |
|---|---|---|
| General chat | Existing inventory and vector tools remain governed by current conditions. | Add the request-time selected-only pack only when context, token, feature boundary, and discovery permit it. |
| Stationary Energy review/start-draft | Existing draft and start-draft tools remain scoped to their current workflow context. | Do not replace, widen, or implicitly add catalog tools unless the approved active-mode contract explicitly permits them. |
| Concept Note | Existing persisted-run source tools remain governed by bundle/workflow-step checks. | Do not replace them; catalog tools, if allowed by the active mode, remain selected-only and independently bounded. |
| Missing/invalid catalog context | Existing workflow behavior remains unchanged. | Register no catalog-backed tools and return a safe bounded orchestration outcome. |
| Core disabled/unavailable/empty | Existing workflows remain available under current rules. | Register no catalog-backed tools; never fall back to raw storage. |

## Functional invariants

1. Discovery occurs only after active identity/context resolution and at most
   once for the active request.
2. Discovery performs lightweight readiness checks only; it never executes full
   reads for all candidates and never loads unselected Climate Advisor tools.
3. Every registered catalog-backed tool corresponds to an exact entry and
   capability ID from the current Core discovery response.
4. Only the selected capability is loaded and executed for a selected read.
5. Core, not Climate Advisor, authorizes the caller and revalidates every read.
6. The model cannot provide arbitrary scope, route, catalog, capability,
   source, or storage arguments.
7. Selection-resolution failures preserve one stable non-disclosing error
   contract and omit source existence/state, scope, labels, content, and
   upstream text.
8. Successful tool results satisfy the Core-declared typed fields and finite
   bounds and contain no storage credentials or raw storage access.
9. A failed discovery or selected read cannot widen another tool's access or
   trigger a raw-storage/legacy unrestricted fallback.
10. Existing workflow tool packs, feature/auth boundaries, token refresh, and
    cleanup behavior remain compatible.

## Verification model and handoff

| Evidence area | Required UOW-02 evidence | UOW-03 handoff |
|---|---|---|
| Client contract | Typed discovery/read request/response parsing, Core endpoint encapsulation, timeout and one-refresh behavior. | Cross-service contract comparison. |
| Discovery | Request-time invocation, context binding, safe omission/empty behavior, no CA capability load or full reads. | Integrated discovery/registration trace. |
| Selection/tools | Current-response binding, selected-only registration, typed bounded inputs, no arbitrary routing. | Selected-only tool inspection and execution. |
| Read/error | Core revalidation consumption, bounded success, stable `capability_unavailable`, no upstream/source disclosure. | Stale/forged/denied/unavailable comparisons across services. |
| Compatibility | General, inventory, Stationary Energy, Concept Note, legacy, vector, auth, token-refresh, timeout, cancellation, and cleanup regressions. | Joint workflow matrix. |
| Security/telemetry | Forbidden-field assertions; safe correlation/outcome logging without tokens, storage data, or raw content. | Integrated safe-telemetry review. |

## Traceability

| Model area | Requirements / NFRs | Stories | Linear CC-737 concern |
|---|---|---|---|
| Active context and request-time discovery | FR-01, FR-02, FR-04, FR-06, NFR-01, NFR-03 | US-03, US-07, US-09 | Authorized, request-scoped catalog consumption. |
| Selection binding and selected-only loading | FR-03, FR-04, FR-08, NFR-05, NFR-07 | US-03, US-09 | Only selected Core-issued capabilities become tools. |
| Bounded read/result/error consumption | FR-05, FR-06, FR-07, FR-10, NFR-01, NFR-02, NFR-06 | US-03, US-09 | Exact bounded source read with non-disclosure and no raw storage access. |
| Workflow coexistence and graceful degradation | FR-08, FR-10, NFR-04, NFR-05 | US-07, US-09 | Existing Climate Advisor behavior remains compatible. |
| Consumer contract/security evidence | FR-09, FR-11, NFR-06, NFR-08 | US-09 | Climate Advisor contract, registration, compatibility, and security tests. |

The model also consumes the approved UOW-01 Core functional design, business
rules, domain entities, NFR design, and verification evidence. Any proposed
change to Core authorization, catalog ownership, exact bounded result shape,
or stable selection error returns to UOW-01 rather than being implemented in
Climate Advisor.

## Explicit non-goals

This model does not introduce catalog persistence, source storage access,
Climate Advisor authorization, a generic raw-source tool, global capability
registration, a new transport, a prompt redesign, a new workflow mode, a
shared runtime package, a storage credential, a signed-URL flow, or unrelated
refactoring.
