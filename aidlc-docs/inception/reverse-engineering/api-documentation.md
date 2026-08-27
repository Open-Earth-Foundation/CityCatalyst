# API Documentation

## REST APIs

### Existing Core NativeInputCatalog registration

- **Method**: `POST`
- **Path**: `/api/v1/internal/native-input-catalog`
- **Purpose**: Idempotently register a Core catalog pointer after a producer's durable write.
- **Authentication**: Non-empty `X-Service-Name` and matching `X-Service-Key` (`CC_SERVICE_API_KEY`).
- **Request**: `kind`, `owningModule`, `sourceType`, `sourceId`, at least one of `userId`, `inventoryId`, `cityId`, `projectId`, or `organizationId`, plus optional digest/readiness/labels.
- **Response**: `{ data: catalogEntry, created: boolean }`, status `201` for creation or `200` for idempotent reuse.
- **Current consumer status**: Producer lifecycle only; no CA discovery route.

### Existing Core NativeInputCatalog withdrawal

- **Method**: `DELETE`
- **Path**: `/api/v1/internal/native-input-catalog/{id}`
- **Purpose**: Soft-withdraw a catalog row while retaining it for auditability.
- **Authentication**: NativeInputCatalog service request headers.
- **Response**: Updated catalog entry or not-found.

### Existing Core NativeInputCatalog supersession

- **Method**: `POST`
- **Path**: `/api/v1/internal/native-input-catalog/{id}/supersede`
- **Purpose**: Register a new source identity and mark the active previous row superseded.
- **Authentication**: NativeInputCatalog service request headers.
- **Response**: Previous and replacement entries.

### Existing Climate Advisor capability routes

- **Method**: `POST`
- **Paths**:
  - `/api/v1/internal/ca/capabilities/ghgi/inventory/list-accessible`
  - `/api/v1/internal/ca/capabilities/ghgi/inventory/status-overview`
  - `/api/v1/internal/ca/capabilities/ghgi/inventory/emissions-context`
  - `/api/v1/internal/ca/capabilities/hiap/inventory/context`
  - `/api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context`
  - `/api/v1/internal/ca/capabilities/ghgi/stationary-energy/list-notation-keys`
  - Stationary Energy commit routes and `/api/v1/internal/ca/capabilities/allowed-capabilities` for workflow-specific operations.
- **Purpose**: Expose bounded, module-owned operations to Climate Advisor.
- **Authentication**: CA service headers, feature flag, and user-scoped bearer token where the route reads user resources.
- **Request**: Typed route-specific JSON; existing inventory reads use `user_id`, `city_id`, and `inventory_id` as appropriate.
- **Response**: Route-specific JSON with capability/action identifiers and bounded data. Errors use HTTP status and are serialized by CA tools.

### Existing Climate Advisor public API

- **Methods/paths**: FastAPI `/v1/threads` and `/v1/messages` endpoints.
- **Purpose**: Create/resolve chat threads and stream assistant responses through SSE.
- **Request**: Thread context and message payloads, including optional user-scoped CityCatalyst access token and workflow identifiers.
- **Response**: Thread data or SSE events containing messages, tool calls/results, and completion state.

## Internal APIs

### `NativeInputCatalogService`

- **Methods**: `registerNativeInput(input, transaction?)`, `withdrawNativeInput(catalogId)`, `supersedeNativeInput(catalogId, replacement)`, `requireNativeInputCatalogServiceRequest(req)`.
- **Parameters**: Soft catalog metadata, source identity, nullable scope fields, and request headers.
- **Return types**: `NativeInputCatalogRegistration`, `NativeInputCatalog`, or `{ previous, replacement }`; HTTP errors for invalid/missing state.

### `CityCatalystClient`

- **Methods**: `post_internal_capability(path, json_data, token?, request_timeout?)`, `load_inventory_*`, `load_hiap_context`, Stationary Energy loaders/committers, `validate_user_identity`, and token refresh methods.
- **Parameters**: Internal route path, bounded JSON payload, and optional user bearer token.
- **Return types**: Parsed dictionaries, typed artifacts, or `CityCatalystClientError` with optional status code.

### `AgentService.create_agent()`

- **Parameters**: Optional model and instruction overrides; service instance carries request/thread/workflow scope.
- **Return type**: OpenAI Agents SDK `Agent` with instructions and request-appropriate tools.
- **Current behavior**: Registers inventory/legacy datasource tools for general chat with credentials and thread scope; registers Stationary Energy and CNB tools based on active workflow context; no NativeInputCatalog discovery/source-specific loading yet.

## Data Models

### `NativeInputCatalog`

- **Fields**: `id`, `kind`, `owningModule`, `sourceType`, `sourceId`, nullable user/inventory/city/project/organization scope, `availability`, optional `supersededById`, `contentDigest`, `markdownReady`, and `labels`.
- **Relationships**: Logical pointer to a module-owned source; no cross-database foreign key.
- **Validation**: Required source identity and at least one scope identifier; availability is active/withdrawn/superseded; non-withdrawn source identity is unique.
- **Security note**: A catalog row is existence metadata, not an access grant. Existing catalog lifecycle endpoints authenticate the producing service, not an end-user discovery caller.

### Existing capability contract pattern

- **Core side**: Zod schemas and registry definitions.
- **Climate Advisor side**: Python dictionaries/Pydantic request models depending on workflow, `CityCatalystClient` methods, and JSON tool result envelopes.
- **CC-737 gap**: No shared catalog-discovery/source-capability contract is present yet; exact schemas and error non-disclosure behavior must be resolved in Requirements Analysis/Application Design.
