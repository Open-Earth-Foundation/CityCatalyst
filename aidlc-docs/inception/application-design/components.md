# Application Design Components — CC-737

## Design Intent

This document defines high-level component boundaries for connecting Core's `NativeInputCatalog` to Climate Advisor. It preserves existing ownership: Core authorizes and resolves sources, module systems of record retain source ownership, and Climate Advisor orchestrates bounded requests. Detailed business rules and implementation units remain deferred.

## Component Inventory

### C-01 — Native Input Catalog Discovery (Core)

- **Purpose**: Return only active NativeInputCatalog entries that are eligible for the authenticated user and explicit request context.
- **Owner**: CityCatalyst Core `app`.
- **Responsibilities**:
  - Query active catalog pointers without treating a pointer as an access grant.
  - Apply least-privilege filtering across every applicable populated user, organization, project, city, and inventory scope.
  - Exclude unauthorized, unavailable, withdrawn, superseded, missing, and deleted entries before response shaping.
  - Expose only safe selection metadata and Core-issued capability IDs.
- **High-level interface**: `discoverNativeInputs(requestContext, discoveryFilters, authenticatedSession) -> AuthorizedNativeInput[]`.
- **Does not**: Return raw source content, storage paths, credentials, signed URLs, or unfiltered catalog rows.

### C-02 — Native Input Capability Registry (Core)

- **Purpose**: Provide a typed, closed mapping from `(owningModule, kind, sourceType)` to approved bounded capability definitions.
- **Owner**: Core capability registry/boundary, following existing agentic capability registry patterns.
- **Responsibilities**:
  - Resolve only statically registered combinations.
  - Associate a stable capability ID, operation type, required scope, transport boundary, input schema, output schema, and result bounds.
  - Treat unknown, unsupported, or not-ready mappings as unavailable.
  - Prevent route derivation from catalog labels, source IDs, or model-generated values.
- **High-level interface**: `resolveCapability(catalogIdentity) -> CapabilityDefinition | unavailable`.
- **Does not**: Authorize access by itself; authorization and source-state checks remain per request/read.

### C-03 — Core Selection Authorization and State Validator

- **Purpose**: Revalidate a selected catalog identity immediately before every source read.
- **Owner**: Core capability service, using existing session and `PermissionService` patterns.
- **Responsibilities**:
  - Validate Climate Advisor service authentication and the user-scoped bearer session.
  - Verify the requested user identity matches the authenticated session.
  - Check every applicable scope relationship.
  - Confirm catalog entry is active, mapped to the requested capability, and backed by an available/readable source.
  - Collapse selection-resolution denial states into the stable non-disclosing read error.
- **High-level interface**: `authorizeAndResolveSelection(selection, requestContext, authenticatedSession) -> AuthorizedCapabilityContext | selectionUnavailable`.
- **Does not**: Return details explaining whether a denied entry exists or why it failed.

### C-04 — Core Bounded Source Capability Adapter

- **Purpose**: Invoke the owning module's system of record and shape the minimum bounded result needed by Climate Advisor.
- **Owner**: Core capability boundary with module-owned adapters.
- **Responsibilities**:
  - Read through approved GHGI/HIAP boundaries and CNB only when its bounded boundary is ready.
  - Enforce capability-specific input validation, field allowlists, finite result limits, and timeouts.
  - Keep source storage, object keys, credentials, and unrestricted payloads behind Core/module boundaries.
  - Return typed safe envelopes or the stable non-disclosing selection error.
- **High-level interface**: `executeBoundedCapability(authorizedContext, boundedInput) -> BoundedCapabilityResult`.
- **Does not**: Delegate raw storage access to Climate Advisor or expose module internals.

### C-05 — Core Capability HTTP Boundary

- **Purpose**: Expose discovery and selected-read operations through existing internal Climate Advisor capability route conventions.
- **Owner**: Core `app/src/app/api/v1/internal/ca/capabilities/`.
- **Responsibilities**:
  - Enforce the existing feature flag and `X-Service-Name`/`X-Service-Key` service authentication.
  - Require and bind the user-scoped bearer session.
  - Parse typed requests and serialize typed responses.
  - Preserve safe HTTP status/error behavior and correlation telemetry.
- **High-level interface**: Internal POST operations for catalog discovery and selected bounded reads; exact route names are finalized during unit generation.
- **Does not**: Become a public catalog API or expose producer lifecycle endpoints.

### C-06 — Climate Advisor Catalog Capability Client

- **Purpose**: Encapsulate Climate Advisor-to-Core discovery and selected-read transport.
- **Owner**: `climate-advisor/service/app/services/citycatalyst_client.py`.
- **Responsibilities**:
  - Reuse existing internal headers, user bearer propagation, timeout, one-time refresh, error mapping, and cleanup behavior.
  - Parse and validate Core's typed safe envelopes.
  - Preserve the stable non-disclosing selection error without translating it into metadata-bearing errors.
  - Update the shared token reference only when the existing refresh flow produces a replacement token.
- **High-level interface**: `discover_native_inputs(...)`, `read_native_input_capability(...)`.
- **Does not**: Resolve routes from untrusted catalog data or access storage directly.

### C-07 — Climate Advisor Selection Coordinator

- **Purpose**: Keep discovery results and active-request selections bound to the current request context.
- **Owner**: Climate Advisor service/orchestration layer.
- **Responsibilities**:
  - Request discovery after context resolution and before agent execution.
  - Accept selections only from the authorized discovery result.
  - Carry catalog identity, Core-issued capability identity, and explicit context into a tool factory.
  - Isolate failed selections and preserve independently authorized tools under the approved continuation rule.
- **High-level interface**: `prepareCatalogCapabilities(requestContext, selectedInputs) -> SelectedCapabilitySet`.
- **Does not**: Treat discovery as final authorization or retain selections beyond the active request.

### C-08 — Climate Advisor Bounded Tool Factory and Wrappers

- **Purpose**: Register only selected source-specific tools and execute them through the client.
- **Owner**: Climate Advisor `app/tools/` and `AgentService` integration.
- **Responsibilities**:
  - Build request-scoped tool objects from validated capability definitions.
  - Expose typed, bounded arguments and safe tool result envelopes.
  - Create short-lived Core clients or use the established lifecycle pattern and close them on all paths.
  - Return the stable non-disclosing error for invalid/stale/forged selections.
  - Prevent arbitrary tool names, routes, source IDs, and storage references from becoming executable inputs.
- **High-level interface**: `buildNativeInputCapabilityTools(selectedCapabilitySet, tokenRef) -> Tool[]`.
- **Does not**: Register every supported source or provide raw datasource/storage fallback.

### C-09 — Climate Advisor Agent Integration

- **Purpose**: Add catalog-driven tools to the existing request-time agent composition without changing existing workflow packs.
- **Owner**: `AgentService.create_agent()`.
- **Responsibilities**:
  - Invoke the selection coordinator only when the active request has the required context and feature boundary.
  - Add only the selected catalog tools to the current agent.
  - Leave general chat, inventory, Stationary Energy, Concept Note, legacy datasource, and vector fallback behavior governed by current conditions.
  - Record safe tool-registration outcomes.
- **High-level interface**: Existing `create_agent()` flow extended by a catalog-capability registration step.
- **Does not**: Move authorization into the agent or let the model choose arbitrary source routes.

### C-10 — Safe Capability Telemetry

- **Purpose**: Make discovery/read outcomes traceable without creating a disclosure channel.
- **Owner**: Existing Core and Climate Advisor logging/telemetry conventions.
- **Responsibilities**:
  - Record correlation reference, safe caller reference, approved capability/catalog identity where permitted, outcome category, and duration.
  - Redact tokens, credentials, raw content, signed URLs, storage keys, and unnecessary scope data.
  - Distinguish operational outcome categories internally without exposing distinctions to the caller.
- **High-level interface**: Existing structured logging/telemetry hooks, not a new storage or audit service.

## Component Boundary Rules

1. Core is the final authority for identity, scope, catalog state, capability mapping, source availability, and read authorization.
2. NativeInputCatalog remains a pointer registry; discovery metadata never grants source access.
3. Climate Advisor may retain only request-scoped selection/tool state and receives bounded results.
4. Module systems of record remain authoritative for source content.
5. Unknown mappings and any authorization/source-state uncertainty fail closed.
6. Existing authentication, feature flags, timeout, token refresh, and cleanup conventions remain the integration baseline.

