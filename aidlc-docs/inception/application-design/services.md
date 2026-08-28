# Application Design Services — CC-737

## Service Boundaries

### S-01 — Core Native Input Discovery Service

- **Owner**: CityCatalyst Core `app`.
- **Purpose**: Resolve the caller-authorized, active subset of NativeInputCatalog entries.
- **Consumes**: Authenticated Core session, request/thread scope, bounded filters, NativeInputCatalog, capability registry, PermissionService, and source-readiness checks.
- **Produces**: Safe discovery metadata and Core-issued capability IDs.
- **Guarantees**:
  - Filters before the response crosses into Climate Advisor.
  - Omits unauthorized, unavailable, withdrawn, superseded, missing, and deleted entries without metadata or reason disclosure.
  - Does not turn catalog existence into an access grant.
- **Failure behavior**: Existing service/authentication failures remain governed by Core patterns; entry-level ineligibility is omission.

### S-02 — Core Capability Registry Service

- **Owner**: Core agentic capability registry/boundary.
- **Purpose**: Resolve explicit supported module/kind/source combinations to bounded definitions.
- **Consumes**: Validated catalog identity dimensions.
- **Produces**: Capability ID, operation type, required scope, typed schemas, result bounds, and approved internal transport reference.
- **Guarantees**:
  - Closed allowlist; unknown combinations fail closed.
  - No route construction from untrusted values.
  - Registry metadata is safe to expose only after discovery authorization.
- **Failure behavior**: Unmapped/not-ready combinations are unavailable and omitted from discovery.

### S-03 — Core Selected Capability Read Service

- **Owner**: Core CA capability boundary plus module adapters.
- **Purpose**: Authorize and execute one selected bounded source read.
- **Consumes**: Service-authenticated request, user bearer session, catalog identity, Core capability ID, request context, and bounded capability input.
- **Produces**: Typed minimum source result or the stable generic selection error.
- **Guarantees**:
  - Revalidates every selected read, independent of discovery.
  - Checks all applicable user/organization/project/city/inventory scope relationships.
  - Confirms active catalog state, allowlist mapping, source availability, and module readability.
  - Keeps storage and source-of-truth ownership in Core/modules.
- **Failure behavior**: Selection-resolution failures normalize to HTTP 404 with `capability_unavailable`; no existence/state/metadata distinction is exposed.

### S-04 — Core Module Source Adapter Service

- **Owner**: Core/module boundaries, with GHGI/HIAP and conditionally CNB adapters.
- **Purpose**: Invoke authoritative module data through existing bounded capability paths.
- **Consumes**: Authorized internal execution context and capability-specific bounded input.
- **Produces**: Capability-specific typed result.
- **Guarantees**: Source-specific field/size bounds, explicit timeout, no raw storage access crossing the boundary.
- **Failure behavior**: Dependency, missing, unreadable, or unavailable source failures are translated at the selected-read boundary to the stable generic error where they are selection-resolution failures; operational failures remain safe and non-disclosing.

### S-05 — Climate Advisor Core Capability Client Service

- **Owner**: Climate Advisor `CityCatalystClient`.
- **Purpose**: Centralize transport to Core catalog capabilities.
- **Consumes**: Request context, Core-issued selection, bounded input, user bearer token, and service configuration.
- **Produces**: Validated discovery/read result or safe client error.
- **Guarantees**:
  - Existing CA service headers and bearer propagation.
  - Existing timeout and one-time 401 refresh behavior.
  - No route derivation, raw storage access, or secret logging.
  - Response-shape validation before tool serialization.
- **Failure behavior**: Preserve `capability_unavailable`; prevent upstream text/status differences from leaking source state.

### S-06 — Climate Advisor Selection and Tool Orchestration Service

- **Owner**: Climate Advisor orchestration/tool layer.
- **Purpose**: Convert the active request's authorized selections into request-scoped bounded tools.
- **Consumes**: Resolved request context, Core discovery result, user selections, token reference, and existing workflow conditions.
- **Produces**: Selected tool set for `AgentService`.
- **Guarantees**:
  - Discovery and registration happen at request time after context resolution and before agent execution.
  - Only selected entries from the authorized discovery result are registered.
  - Invalid/stale/forged selections are not registered and fail closed at read time.
  - Existing general, inventory, Stationary Energy, Concept Note, legacy, and fallback behavior remains governed by current conditions.
- **Failure behavior**: Isolate a failed selected tool and continue with unrelated independently authorized tools when existing orchestration permits; never retry indefinitely or fall back to raw storage.

### S-07 — Safe Capability Result and Telemetry Service

- **Owner**: Existing service-level response/logging conventions in Core and Climate Advisor.
- **Purpose**: Standardize safe result serialization, error envelopes, correlation, and outcome telemetry.
- **Consumes**: Typed success/error results and safe request metadata.
- **Produces**: Bounded tool envelopes, HTTP responses, and redacted structured events.
- **Guarantees**:
  - Caller-visible selected-read failure contract is stable and generic.
  - Telemetry excludes tokens, credentials, raw content, signed URLs, storage keys, and unnecessary sensitive scope data.
  - Logs may retain internal outcome categories without exposing them to the caller.

## Orchestration Sequences

### Authorized discovery and selection

1. Climate Advisor resolves the active request/thread context and user bearer token.
2. `CityCatalystClient` calls Core's catalog discovery capability with CA service headers and the user token.
3. Core authenticates the service and user session, filters catalog rows and source readiness, and resolves the typed allowlist.
4. Core returns safe metadata and eligible capability IDs only.
5. Climate Advisor binds a user selection to that discovery result and current request context.
6. The tool factory creates only selected request-scoped tools.

### Selected bounded read

1. A selected tool validates its bounded arguments.
2. The client calls the Core selected-read capability.
3. Core revalidates user/session, all applicable scope, catalog state, capability ID, and source availability.
4. Core invokes the module-owned bounded adapter.
5. Core shapes the minimum typed result and returns it to Climate Advisor.
6. The tool serializes the bounded result; the client updates a refreshed token reference if applicable and closes resources.

### Denied or unavailable path

1. Discovery omits an ineligible entry without metadata.
2. If a stale, forged, malformed, or invalid selection is nevertheless submitted, Core returns HTTP 404 with the generic `capability_unavailable` contract.
3. Climate Advisor returns the same safe tool error and does not reveal source state.
4. Unrelated tools remain independently governed; a failed selected tool is isolated under the approved continuation rule.

## Service Rules

- Core owns authorization and storage boundaries; Climate Advisor never becomes an authorization authority.
- Request-time registration is not a substitute for per-read Core authorization.
- Service-level transport errors must be safe, bounded, and observable without secrets.
- Any new source capability must enter through the Core registry and an approved module boundary.

