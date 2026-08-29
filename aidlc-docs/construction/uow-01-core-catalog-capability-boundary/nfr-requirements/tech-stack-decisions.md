# UOW-01 NFR Requirements — Technology Stack Decisions

## Decision scope

These decisions support CC-737 within the existing CityCatalyst brown-field monorepo. They are NFR-stage choices, not authorization to refactor or add infrastructure. The selected approach reuses the existing stack and ownership boundaries.

## Decisions

### TS-01 — Reuse the existing Core runtime and service structure

**Decision**: Implement Core-side behavior within the existing TypeScript/Next.js/Node application and its established internal API, backend service, and test structures.

**Rationale**: Core already owns NativeInputCatalog, service-authenticated Climate Advisor capability routes, permission checks, module capability registries, request validation, structured errors, and Jest tests. A new service or runtime would create a second authorization/storage boundary and increase contract drift.

**Constraints**:

- Preserve existing service authentication, user-scoped bearer/session binding, feature gates, and `apiHandler`/HTTP error conventions.
- Keep Core as the final authorization and result-shaping authority.
- Do not add a parallel catalog or storage owner.

Traceability: NFR-UOW01-11, NFR-UOW01-15, NFR-UOW01-16, NFR-UOW01-20; FR-01, FR-06, FR-08.

### TS-02 — Reuse existing Core validation and data-access patterns

**Decision**: Use the repository's existing Zod/request-validation conventions, Sequelize models/transactions, Postgres access, PermissionService patterns, and capability-registry structures. Numeric bounds and schema details must be derived from existing conventions during NFR Design/Code Generation.

**Rationale**: These patterns already express typed requests, source lifecycle data, authorization/resource relationships, and deterministic testing. Introducing a second validation or persistence abstraction is outside scope.

**Constraints**:

- All inputs are bounded before catalog/source work begins.
- Catalog lifecycle and source ownership remain existing model/service responsibilities.
- Database access cannot be exposed to Climate Advisor.

Traceability: NFR-UOW01-02, NFR-UOW01-05, NFR-UOW01-15, NFR-UOW01-17; FR-02, FR-05, FR-06, FR-10.

### TS-03 — Reuse existing internal HTTP capability transport

**Decision**: Extend the existing authenticated internal Climate Advisor capability route family and client conventions. Do not introduce a new transport, generic gateway, MCP expansion, or direct module/storage connection for this issue.

**Rationale**: The existing boundary already supports service headers, user-scoped authorization, typed request handling, timeouts, token refresh, and bounded capability responses. Reuse preserves compatibility and operational ownership.

**Constraints**:

- Exact route names and concrete envelope details remain implementation decisions within the approved contract.
- Selection-resolution failures preserve HTTP 404, `capability_unavailable`, and the generic message.
- Transport errors cannot disclose source state.

Traceability: NFR-UOW01-04, NFR-UOW01-12, NFR-UOW01-19, NFR-UOW01-20; FR-04, FR-07, FR-10.

### TS-04 — Reuse existing module-owned capability boundaries

**Decision**: Integrate only with existing approved bounded GHGI/HIAP capability boundaries, and include CNB only if its existing boundary is demonstrated ready and separately accepted. Do not create a generic adapter layer or move source access into Core/Climate Advisor.

**Rationale**: Module systems of record must remain authoritative. Existing boundaries can enforce source-specific semantics while Core enforces caller scope, catalog state, allowlisting, and final response shaping.

**Constraints**:

- An unavailable or not-ready boundary makes the catalog entry unavailable.
- No raw S3/object/database access or unrestricted source response crosses the service boundary.
- Source-specific fields and limits are declared by the capability definition and enforced before serialization.

Traceability: NFR-UOW01-02, NFR-UOW01-08, NFR-UOW01-11, NFR-UOW01-13, NFR-UOW01-16; FR-03, FR-05, FR-06.

### TS-05 — Reuse the existing Climate Advisor Python client/tool stack

**Decision**: Implement consumer-side contract calls using the existing Climate Advisor Python 3.11–3.12 service, FastAPI/Uvicorn runtime, `httpx` client, Pydantic/schema-validation patterns, Agents SDK tool factories, pytest/pytest-asyncio tests, token reference, refresh, timeout, and cleanup behavior.

**Rationale**: Climate Advisor already centralizes Core HTTP calls and request-time tool registration. Reusing those patterns avoids a second client, token lifecycle, or tool-loading mechanism.

**Constraints**:

- Climate Advisor consumes Core-issued capability IDs and typed responses; it cannot redefine authorization.
- Tools are request-scoped and selected-only.
- Tokens are propagated only through existing secure client behavior and are never included in tool results or logs.

Traceability: NFR-UOW01-04, NFR-UOW01-05, NFR-UOW01-15, NFR-UOW01-16, NFR-UOW01-21; FR-04, FR-08, FR-10.

### TS-06 — Use existing error and redaction conventions with one safe selection contract

**Decision**: Preserve existing authentication/transport error plumbing where it is non-disclosing, and add the approved stable selection-resolution contract at the Core boundary. Apply redaction before logs, telemetry, and serialization.

**Rationale**: Authentication failures and transport failures have existing operational semantics, while source-selection failures need a stable non-disclosing contract to prevent existence oracles.

**Constraints**:

- Selection failures collapse to HTTP 404, code `capability_unavailable`, message `Requested capability is unavailable.`
- Error normalization must not echo upstream response text or source details.
- Redaction is an enforcement step, not a downstream observability assumption.

Traceability: NFR-UOW01-12, NFR-UOW01-13, NFR-UOW01-18, NFR-UOW01-19; FR-07, FR-09, FR-10.

### TS-07 — Reuse existing test runners and add deterministic contract fixtures

**Decision**: Use Core Jest/API test conventions and Climate Advisor pytest/asyncio conventions. Add deterministic doubles/fixtures for catalog states, permission outcomes, capability mappings, source boundaries, timeouts, bounded responses, and safe errors. Cross-service evidence consumes Core-owned contract fixtures.

**Rationale**: The repository already has independent service test suites and patterns for permission, capability, client, tool, token-refresh, and cleanup behavior. Deterministic fixtures allow negative security evidence without production storage access.

**Constraints**:

- Example-based security/contract tests are mandatory.
- Partial property-based testing applies to pure scope, allowlist, selection, projection, serialization, bounds, and safe-error invariants.
- Seeds and shrinking must be reproducible where property-based tests apply.

Traceability: NFR-UOW01-10, NFR-UOW01-17, NFR-UOW01-22, NFR-UOW01-23; FR-11, NFR-08.

### TS-08 — No new infrastructure or topology

**Decision**: Use existing deployment, feature-flag, CI/CD, monitoring, rollback, and incident processes. Do not add a service, queue, cache, worker pool, region, database, storage bucket, shared runtime, or new persistence entity.

**Rationale**: The approved NFR answers inherit platform availability/recovery/scaling objectives and explicitly reject topology expansion. The change is a contract integration within existing boundaries.

**Constraints**:

- Roll out Core first, verify the contract, then enable Climate Advisor consumption.
- Preserve legacy behavior when catalog context or the feature boundary is absent.
- Rollback must disable the new path without widening raw datasource/storage access.

Traceability: NFR-UOW01-03, NFR-UOW01-07, NFR-UOW01-20, NFR-UOW01-21; FR-08, FR-10; NFR-04, NFR-05.

## Technology decision matrix

| Concern | Selected existing pattern | Explicitly rejected for CC-737 |
|---|---|---|
| Core runtime | TypeScript/Next.js/Node application | New Core service/runtime |
| Core validation/data | Zod, Sequelize/Postgres, PermissionService, existing registries | New schema/persistence/authorization framework |
| Service transport | Existing authenticated internal HTTP capability routes | New gateway, MCP expansion, direct storage/module transport |
| Source access | Existing bounded module-owned boundaries | Climate Advisor storage access or generic raw adapter |
| Climate Advisor runtime | Python 3.11–3.12, FastAPI/Uvicorn, httpx, Pydantic, Agents SDK | Second client/tool/runtime framework |
| Tests | Jest/API tests, pytest/asyncio, deterministic doubles, partial PBT | Happy-path-only or production-storage-dependent evidence |
| Operations | Existing flags, CI/CD, monitoring, rollback, incident process | New topology, DR, queue, cache, worker, or region |

## Technology decision guardrails

Any later implementation proposal must demonstrate that it:

1. preserves Core as authorization and catalog authority;
2. preserves module source ownership;
3. keeps selection/read behavior bounded and non-disclosing;
4. prevents credentials, tokens, signed URLs, raw storage access, and unrestricted payloads from reaching Climate Advisor;
5. uses existing timeouts, cleanup, feature flags, CI, deployment, rollback, and observability patterns; and
6. does not require unrelated refactoring or new infrastructure.

If a new technology or topology becomes necessary, work must pause for a separately documented and approved scope/NFR change.

## Deferred implementation details

NFR Design and Code Generation may still choose concrete schema names, route filenames, metric names, exact numeric bounds based on current defaults, adapter function/class organization, and fixture file placement. Those choices must remain within this technology decision set and the approved NFR requirements.
