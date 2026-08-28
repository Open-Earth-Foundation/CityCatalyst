# Application Design Component Methods — CC-737

These are high-level method contracts for Application Design. They are not implementation-ready units and do not prescribe detailed business rules, SQL, route filenames, or test-file placement. Functional Design and Units Generation define those details after approval.

## Shared Conceptual Types

```text
RequestContext
  userId: UserId
  organizationId?: OrganizationId
  projectId?: ProjectId
  cityId?: CityId
  inventoryId?: InventoryId
  correlationId: CorrelationId

CatalogIdentity
  catalogId: CatalogId
  capabilityId: CapabilityId

AuthorizedCatalogEntry
  catalogId: CatalogId
  kind: SafeKind
  owningModule: SafeModule
  sourceType: SafeSourceType
  capabilityIds: CapabilityId[]
  safeLabels?: SafeLabels

CapabilityDefinition
  id: CapabilityId
  operationType: "query"
  requiredResourceScope: ResourceScope[]
  inputSchema: TypedSchema
  outputSchema: TypedSchema
  resultBounds: ResultBounds
  transport: InternalCapabilityTransport

SafeCapabilityError
  code: "capability_unavailable"
  message: "Requested capability is unavailable."
  correlationId?: CorrelationId
```

The `SafeCapabilityError` is returned as HTTP 404 for selection-resolution failures, including stale, forged, malformed selection values, unauthorized, unavailable, missing, withdrawn, superseded, and deleted selections. It contains no catalog/source identity or state. Missing/invalid service authentication remains governed by existing authentication responses; transport-level invalid JSON may remain a request-validation error without source metadata.

## Core Methods

### NativeInputCatalogDiscovery

```text
discoverNativeInputs(
  request: NativeInputDiscoveryRequest,
  session: AppSession
): Promise<AuthorizedCatalogDiscoveryResponse>
```

- **Purpose**: Return eligible active catalog entries for the authenticated user and explicit request context.
- **Input**: User-bound request context plus bounded optional discovery filters.
- **Output**: Safe catalog metadata and Core-issued eligible capability IDs only.
- **Boundary rule**: Omit every unauthorized, unavailable, withdrawn, superseded, missing, or deleted entry; do not return omission reasons.

```text
filterCatalogEntry(
  entry: NativeInputCatalog,
  requestContext: RequestContext,
  session: AppSession
): Promise<AuthorizedCatalogEntry | null>
```

- **Purpose**: Apply all applicable scope, state, source-readiness, and allowlist checks for one entry.
- **Output**: Safe entry or `null`; no disclosure-bearing denial value.

### NativeInputCapabilityRegistry

```text
resolveCapability(
  identity: CatalogCapabilityKey
): CapabilityDefinition | null
```

- **Purpose**: Resolve a statically registered `(owningModule, kind, sourceType)` combination.
- **Input**: Validated catalog identity dimensions.
- **Output**: Typed definition or `null` for unknown/not-ready mapping.

```text
isCapabilityEligible(
  entry: NativeInputCatalog,
  definition: CapabilityDefinition
): boolean
```

- **Purpose**: Confirm a definition is appropriate for the catalog entry before advertising it.
- **Output**: Boolean eligibility only; no route construction from input values.

### Core Selection Authorization and State Validator

```text
authorizeAndResolveSelection(
  selection: NativeInputSelectionRequest,
  requestContext: RequestContext,
  session: AppSession
): Promise<AuthorizedCapabilityContext | SafeCapabilityError>
```

- **Purpose**: Revalidate the selected catalog identity, capability mapping, all applicable scope relationships, catalog state, and source availability immediately before a read.
- **Output**: Internal authorized execution context or the exact generic `capability_unavailable` error.
- **Security rule**: All failure states are equivalent at the caller-visible selection boundary.

```text
validateRequestUser(
  session: AppSession,
  requestUserId: UserId
): void
```

- **Purpose**: Reuse the existing user/session binding pattern.
- **Output**: No value; raises existing authentication/identity error where applicable.

```text
validateApplicableScope(
  session: AppSession,
  requestContext: RequestContext,
  entry: NativeInputCatalog
): Promise<void>
```

- **Purpose**: Enforce every populated applicable user, organization, project, city, and inventory relationship.
- **Output**: No value; internal denial is normalized by the selection boundary.

### Core Bounded Source Capability Adapter

```text
executeBoundedCapability(
  context: AuthorizedCapabilityContext,
  input: CapabilityInput
): Promise<BoundedCapabilityResponse | SafeCapabilityError>
```

- **Purpose**: Execute the approved module-owned operation with explicit schema and result bounds.
- **Input**: Only the validated capability definition, authorized source context, and bounded input.
- **Output**: Typed minimum result or the stable generic error.
- **Boundary rule**: No raw object, signed URL, storage key as an access mechanism, credentials, or unrestricted payload may cross the boundary.

```text
shapeBoundedResult(
  definition: CapabilityDefinition,
  sourceResult: unknown
): BoundedCapabilityResponse
```

- **Purpose**: Enforce field allowlists, size limits, and typed output shape before serialization.
- **Output**: Safe response only.

### Core Capability HTTP Boundary

```text
POST /internal/ca/capabilities/native-inputs/discover
  request: NativeInputDiscoveryRequest
  response: AuthorizedCatalogDiscoveryResponse | AuthError
```

```text
POST /internal/ca/capabilities/native-inputs/read
  request: NativeInputSelectionRequest + CapabilityInput
  response: BoundedCapabilityResponse | SafeCapabilityError | AuthError
```

- **Purpose**: Logical operations under the existing internal CA capability route family. Final route naming and per-capability transport shape are implementation-unit decisions.
- **Required boundary**: Existing CA service authentication, feature flag, bearer-session binding, typed validation, and safe logging.

## Climate Advisor Methods

### CityCatalystClient

```text
discover_native_inputs(
  request_context: RequestContext,
  discovery_filters: DiscoveryFilters,
  token: str | None
): Awaitable[AuthorizedCatalogDiscoveryResponse]
```

```text
read_native_input_capability(
  selection: NativeInputSelection,
  input: CapabilityInput,
  token: str | None
): Awaitable[BoundedCapabilityResponse]
```

- **Purpose**: Call the Core logical operations using existing `_internal_headers`, configured timeouts, one-time 401 refresh, safe status mapping, and client cleanup.
- **Input**: Only selection/context fields approved by Core's contract.
- **Output**: Validated typed response or `CityCatalystClientError` preserving the stable non-disclosing code/status mapping.

```text
normalize_core_error(error: CityCatalystClientError): ClimateAdvisorCapabilityError
```

- **Purpose**: Preserve `capability_unavailable` semantics and prevent upstream response text from becoming a disclosure channel.

### Selection Coordinator

```text
prepare_catalog_capabilities(
  request_context: RequestContext,
  discovery: AuthorizedCatalogDiscoveryResponse,
  selected: Sequence[NativeInputSelection]
): SelectedCapabilitySet
```

- **Purpose**: Bind selections to the current authorized discovery result and request context.
- **Output**: Only selected, allowlisted capability definitions; invalid selections produce no tool registration.

```text
handle_selected_failure(
  error: ClimateAdvisorCapabilityError,
  active_tools: Sequence[Tool]
): ToolFailureOutcome
```

- **Purpose**: Isolate a failed selected tool, return its stable generic error, and preserve independently authorized unrelated tools when existing orchestration permits continuation.

### Bounded Tool Factory

```text
build_native_input_capability_tools(
  selected: SelectedCapabilitySet,
  token_ref: TokenRef
): Sequence[Tool]
```

- **Purpose**: Create request-scoped tools only for the selected capability set.
- **Input**: Core-issued capability IDs and typed definitions, not arbitrary routes.
- **Output**: Bounded function tools with explicit argument/output schemas.

```text
run_native_input_tool(
  capability: CapabilityDefinition,
  input: CapabilityInput,
  token_ref: TokenRef
): Awaitable[SerializedToolResult]
```

- **Purpose**: Use `CityCatalystClient`, propagate refreshed token state, serialize safe result/error envelopes, and close short-lived resources.

### AgentService Integration

```text
load_catalog_capability_tools(
  request_context: RequestContext,
  selected: Sequence[NativeInputSelection]
): Awaitable[Sequence[Tool]]
```

- **Purpose**: Run after context resolution and before `Agent` construction.
- **Output**: Selected catalog tools only; empty sequence when required context/feature boundary is absent.

```text
create_agent(...): Awaitable[Agent]
```

- **Design change**: Add the catalog-tool loading step to the existing composition flow without changing current workflow-specific conditions or registering global catalog tools.

## Method-Level Invariants

- Core methods never authorize from service identity alone.
- Every read revalidates the user/session, every applicable scope, catalog state, capability mapping, and source availability.
- Discovery omission and selected-read failure are non-disclosing at the caller boundary.
- No method returns storage credentials, signed URLs, raw storage paths as access mechanisms, or unrestricted source data.
- Unknown capability IDs, catalog IDs, routes, and model-generated strings are rejected or unavailable.
- Client and tool methods use finite timeouts and close resources on success and failure.

