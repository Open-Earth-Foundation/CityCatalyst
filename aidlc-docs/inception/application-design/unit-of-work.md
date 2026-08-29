# Unit of Work Definitions — CC-737

## Decomposition Basis

CC-737 is decomposed into three logical units inside the existing CityCatalyst monorepo. These are development and review groupings, not new deployable services, repositories, storage owners, or authorization domains.

The units follow the approved Core-first dependency sequence:

1. **UOW-01 — Core Catalog/Capability Boundary** establishes the authoritative contract and security boundary.
2. **UOW-02 — Climate Advisor Request-Time Integration** consumes that contract and adds selected-only request-time tools while preserving existing workflows.
3. **UOW-03 — Cross-Service Verification/Release Evidence** validates both services together and provides integrated release evidence.

Security, non-disclosure, boundedness, compatibility, telemetry, and resiliency evidence is embedded in UOW-01 and UOW-02 and integrated in UOW-03. No requirement is owned only by the verification unit.

## UOW-01 — Core Catalog/Capability Boundary

### Purpose

Extend CityCatalyst Core so Climate Advisor can discover and read only authorized, active, bounded NativeInputCatalog-backed capabilities.

### Ownership

- **Primary owner**: CityCatalyst Core and module maintainers.
- **Contract authority**: Core owns the discovery, selection-read, allowlist, scope, source-state, bounded-result, and stable-error contracts.
- **Reviewers**: Security/operations governance and affected GHGI/HIAP/CNB module owners.

### Scope

- Authorized NativeInputCatalog discovery with safe metadata only.
- Core-authoritative typed `(owningModule, kind, sourceType)` capability allowlist.
- Selection binding and per-read revalidation of user identity, every applicable scope dimension, catalog state, capability mapping, and source availability.
- Bounded GHGI/HIAP adapters where approved; conditional CNB adapter only when its existing boundary is ready.
- Stable HTTP `404` / `capability_unavailable` selection-resolution error with generic message and no source-state disclosure.
- Existing CA service authentication, feature-flag, bearer-session, and permission patterns.
- Bounded schemas/result shaping, explicit timeouts, safe telemetry, and Core contract/security tests.

### Out of scope

- Climate Advisor tool registration or agent prompt changes.
- New catalog lifecycle or storage ownership.
- Raw S3/object/database access crossing into Climate Advisor.
- New deployment topology or persistent schema migration unless separately designed and approved.

### Inputs and outputs

- **Inputs**: Authenticated CA service request, user-scoped bearer session, bounded request context, discovery filters or selection, NativeInputCatalog pointer, Core capability registry, PermissionService, and module boundaries.
- **Outputs**: Safe discovery entries, Core-issued capability IDs, bounded typed source results, or the generic non-disclosing error.

### Acceptance evidence

- Discovery excludes unauthorized, cross-scope, unavailable, withdrawn, superseded, missing, and deleted entries without metadata.
- Unknown mappings and uncertain authorization/source state fail closed.
- Every selected read revalidates current authorization and source state instead of trusting discovery.
- No response or telemetry contains credentials, tokens, signed URLs, raw storage paths/access, raw source content, or unnecessary sensitive scope data.
- Core example-based contract/security tests cover authorized and denied paths, stale/forged/invalid selections, state transitions, bounded fields, and forbidden data.
- Applicable partial property-based invariants have reproducible generators/seeds and shrinking.

### Review output

- Approved Core contract and implementation units for discovery, registry, validation, bounded adapters, errors, and tests.
- Deterministic contract fixtures consumable by UOW-02/UOW-03.
- Atomic commit(s) containing only the independently reviewable Core work.

## UOW-02 — Climate Advisor Request-Time Integration

### Purpose

Connect authorized Core discovery and selected reads to Climate Advisor's existing request-time agent/tool composition.

### Ownership

- **Primary owner**: Climate Advisor maintainers.
- **Contract consumer**: `CityCatalystClient` consumes the Core-owned contract and must not redefine authorization semantics.
- **Reviewers**: Core contract owner and security/operations governance.

### Scope

- `CityCatalystClient` discovery/read methods using existing service headers, bearer propagation, timeout, one-time refresh, safe error mapping, and cleanup.
- Request-scoped selection coordinator binding catalog ID, Core-issued capability ID, and active request context.
- Selected-only bounded tool factory/wrappers with typed inputs and safe outputs.
- `AgentService` integration after context resolution and before agent execution.
- Stable non-disclosing error handling and selected-tool failure isolation.
- Preservation of existing general chat, inventory, Stationary Energy, Concept Note, legacy datasource, and vector fallback behavior.
- Climate Advisor client/tool/registration/compatibility tests.

### Out of scope

- Independent Climate Advisor authorization or catalog storage.
- Route construction from source type, source ID, labels, or model-generated values.
- Global pre-registration of catalog tools.
- S3 credentials, signed URLs, raw storage/database access, unrestricted payloads, or raw-datasource fallback.
- Replacing existing workflow-specific tools.

### Inputs and outputs

- **Inputs**: Core-approved discovery response and deterministic fixtures, active request context, user bearer token, token reference, and existing AgentService workflow conditions.
- **Outputs**: Selected request-scoped bounded tools, safe serialized tool results/errors, refreshed token reference when existing flow refreshes, and safe registration telemetry.

### Acceptance evidence

- Discovery is requested only for the active request after context resolution.
- Only selections returned by authorized discovery and their Core-issued capabilities become registered tools.
- Every tool read returns through Core and remains subject to Core per-read authorization.
- Stale, forged, malformed, and invalid selections preserve the generic `capability_unavailable` contract.
- One selected-tool failure is isolated; unrelated independently authorized tools continue only under the approved orchestration contract.
- Short-lived clients/resources close on success and failure; secrets and raw upstream error text are not exposed.
- Existing workflows remain covered by regression tests and are not widened to arbitrary storage access.
- Climate Advisor example-based contract/security/compatibility tests pass, with applicable partial property-based invariants.

### Review output

- Approved client, selection, tool, AgentService, and test implementation units.
- Evidence that the consumer matches the Core contract without duplicating authority.
- Atomic commit(s) containing only independently reviewable Climate Advisor work.

## UOW-03 — Cross-Service Verification and Release Evidence

### Purpose

Verify the Core/Climate Advisor contract and end-to-end security behavior without taking ownership from either service unit.

### Ownership

- **Primary coordination**: Joint Core and Climate Advisor maintainers.
- **Governance reviewers**: Security and operations reviewer.
- **Authority boundary**: UOW-03 verifies; UOW-01 remains authoritative for authorization and source-state decisions.

### Scope

- Deterministic contract fixtures and compatibility checks across both service suites.
- Integrated authorized discovery → selection → bounded read flow.
- Cross-scope, unauthorized, unavailable, withdrawn, superseded, missing, deleted, stale, forged, malformed, and invalid scenarios.
- Assertions for omission, generic non-disclosure, bounded fields/sizes, no storage credentials/access, safe telemetry, timeout, cleanup, and failure isolation.
- Existing workflow regression matrix and CI/build/release evidence.
- Ordered Core-before-consumer rollout verification using existing feature flags and rollback procedures.

### Out of scope

- Duplicating Core authorization logic.
- New infrastructure, deployment topology, shared runtime package, or catalog-data rollback.
- Replacing service-local unit/security tests.
- Production failover/DR ownership; resiliency execution remains in Operations under existing processes.

### Inputs and outputs

- **Inputs**: Approved UOW-01 contract/fixtures, UOW-02 consumer behavior, service-local test evidence, existing CI/build/deployment conventions, and approved Linear/requirements scenarios.
- **Outputs**: Integrated test results, compatibility/security evidence, release checklist, safe telemetry verification, and rollback-readiness evidence.

### Acceptance evidence

- All nine stories have positive and negative verification coverage.
- Core and Climate Advisor suites independently pass their required contract/security checks.
- Cross-service tests prove Core-first authorization, selected-only loading, bounded results, generic read errors, and no raw storage access.
- Existing workflows and token-refresh/timeout/cleanup behavior remain compatible.
- CI/build/release evidence is reproducible and contains no secrets or raw source content.
- Operations scenarios for Core unavailability and request timeout are documented for later execution.

### Review output

- Integrated verification report and release/rollback checklist.
- Joint security/operations review sign-off.
- Atomic commit(s) containing only independently reviewable verification/release evidence.

## Unit Completion Rules

- A unit is not complete on code review alone; it requires the unit-specific evidence above and an atomic commit.
- UOW-02 cannot consume an unapproved or changed Core contract.
- UOW-03 cannot replace service-local security evidence with only an end-to-end happy path.
- No unit may introduce new storage ownership, bypass Core authorization, expose source existence through errors/logs, or widen existing tool access.
- Construction authorization remains a separate gate after Units Generation artifact approval.

