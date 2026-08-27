# Requirements — CC-737 Connect NativeInputCatalog to Climate Advisor Capabilities

## Intent Analysis

- **User request**: Implement Linear issue CC-737 in the existing CityCatalyst monorepo using AI-DLC, beginning with Inception and preserving Core/Climate Advisor architectural boundaries.
- **Request type**: New cross-service capability integration and security-sensitive enhancement.
- **Project type**: Brownfield.
- **Scope estimate**: Multiple components across CityCatalyst Core and Climate Advisor, with contract/security tests in both services.
- **Complexity estimate**: Complex. The change combines catalog discovery, request-time orchestration, typed capability contracts, object-level authorization, source availability semantics, bounded data exposure, and cross-service testing.
- **Primary actors**:
  - City user using Climate Advisor within an authorized CityCatalyst workspace.
  - Climate Advisor service acting on behalf of that user through a service-authenticated internal API.
  - CityCatalyst Core and module-owned systems enforcing authorization and source ownership.
  - Operations/development teams reviewing, deploying, and supporting the integration through existing processes.

## Goal and Success Definition

Climate Advisor must be able to discover durable CityCatalyst-native inputs that the caller is authorized to use, select source-specific capabilities for the active request, and obtain bounded source data through CityCatalyst. The integration must preserve Core as the catalog, authorization, and storage boundary; preserve module systems of record; and keep storage credentials and raw storage access out of Climate Advisor.

The implementation is successful when:

1. Authorized callers receive only eligible catalog discovery metadata.
2. Selected catalog entries map through a typed allowlist to source-specific capabilities.
3. Core revalidates caller authorization and catalog/source availability for every selected read.
4. Cross-scope, unauthorized, unavailable, withdrawn, superseded, and deleted sources disclose no useful metadata or content.
5. Responses are bounded by explicit contracts and do not contain S3 credentials, signed URLs, raw storage access, or unrestricted source payloads.
6. Existing Climate Advisor modes and legacy behavior remain compatible.
7. Core and Climate Advisor contract/security tests cover both successful and denied paths.

## Scope

### In scope

- Active NativeInputCatalog discovery for source types whose owning modules already expose a bounded Climate Advisor capability contract, beginning with GHGI and HIAP and extending to CNB only where an existing read boundary is ready.
- Discovery filtering by authenticated user and explicit request/thread organization, project, city, and inventory context.
- Non-sensitive discovery metadata and eligible capability IDs.
- A typed allowlisted mapping from supported catalog identity dimensions to source-specific capability definitions and transports.
- Request-time loading of only capabilities selected from the authorized discovery result.
- Per-read catalog-state, underlying-source, and caller-permission validation in CityCatalyst Core.
- Bounded source-specific reads through Core capability routes and module-owned services.
- Stable non-disclosing errors and safe operational logging.
- Compatibility with existing general chat, Stationary Energy, Concept Note, inventory, and legacy datasource behavior.
- Core and Climate Advisor unit, contract, security, and request-time registration tests.
- Existing CI/CD, change management, rollback, deployment, topology, and incident processes.

### Out of scope

- New storage ownership or a new catalog database/service.
- Moving source content, module systems of record, or S3 access into Climate Advisor.
- Giving Climate Advisor S3 credentials, signed URLs, raw object access, or direct database access.
- Replacing the existing NativeInputCatalog producer lifecycle or module-specific source schemas.
- Making all catalog rows universally readable or treating catalog existence as an access grant.
- Replacing current Climate Advisor inventory/legacy tools immediately.
- New deployment topology, RTO/RPO targets, DR strategy, rollback mechanism, incident workflow, or CI/CD pipeline.
- Unrelated refactoring, broad capability-registry redesign, MCP transport expansion, or UI redesign.

## Functional Requirements

### FR-01 — Authorized catalog discovery

CityCatalyst Core shall expose a Climate Advisor-facing discovery capability that returns only active catalog entries whose stored scope and underlying source are authorized for the authenticated caller and requested context.

- Discovery must require the existing Climate Advisor service authentication pattern.
- Discovery must use the authenticated user identity from the user-scoped bearer token; service identity alone is insufficient.
- Explicit request/thread scope may include organization, project, city, and inventory identifiers, but Core remains the final authority.
- A populated catalog scope field outside the caller's access must not be bypassed by a broader or unrelated scope match.
- Discovery must not return withdrawn or superseded entries as eligible active entries.
- Missing, deleted, unavailable, or unreadable sources must not appear as usable entries.

### FR-02 — Safe discovery metadata

Discovery shall return only non-sensitive metadata needed for capability selection, such as catalog identity, kind, owning module, source type, safe labels/readiness, scope-match context, and eligible capability IDs.

- Do not expose unnecessary raw scope identifiers, storage locations, credentials, signed URLs, or source content.
- Metadata filtering must happen in Core before the response crosses into Climate Advisor.
- The contract must make clear that a catalog entry is a pointer and not an authorization grant.

### FR-03 — Typed capability allowlist

Core and Climate Advisor shall use a typed, explicit allowlist mapping supported `(owning_module, kind, source_type)` combinations to one or more bounded capability IDs and transport routes.

- Unknown or unsupported combinations are unavailable.
- Routes must not be derived from untrusted `source_type`, `source_id`, labels, or model-generated strings.
- Capability definitions must include input/output schemas, operation type, required resource scope, and bounded result shape.
- The allowlist must follow the existing module-owned capability registry pattern.

### FR-04 — Request-time source selection

Climate Advisor shall load source-specific tools only for catalog entries selected for the active request.

- A selection must reference a catalog ID returned by the authorized discovery result.
- Climate Advisor must not pre-register tools for every catalog entry or every supported source.
- Core must revalidate the selected catalog ID, caller scope, availability, mapping, and underlying source immediately before each read.
- A stale or forged selection must fail closed without disclosing source existence or metadata.
- Existing workflow-specific request-time registration patterns remain the governing integration pattern.

### FR-05 — Bounded source reads

Every source-specific capability shall define and enforce an explicit input schema, output schema, maximum result size/field set, and source-specific bounds.

- Reads must resolve through Core capability routes and module-owned services.
- Responses must not contain raw storage objects, S3 credentials, signed URLs, unrestricted source payloads, or direct storage paths as access mechanisms.
- The capability must return the minimum source data needed by the active Climate Advisor request.
- External calls must use explicit existing timeouts and bounded response handling.

### FR-06 — Per-read authorization and source validation

CityCatalyst Core shall perform authorization and catalog/source-state validation on every selected source read.

- Validate the authenticated user/resource relationship for every populated applicable scope dimension.
- Validate that the catalog entry is active and maps to the requested capability.
- Validate that the underlying source exists, is available, and is readable through its module boundary.
- Do not rely solely on Climate Advisor's discovery-time decision.
- Fail closed on token, session, permission, catalog, source, validation, or dependency errors.

### FR-07 — Non-disclosure for denied or unavailable sources

Unauthorized, cross-user, cross-organization, cross-project, cross-city, cross-inventory, withdrawn, superseded, unavailable, missing, and deleted source outcomes shall disclose no useful catalog metadata or source content.

- Normalize indistinguishable not-found/forbidden/unavailable outcomes where practical.
- User-facing/tool-facing error envelopes must be stable and generic.
- Logs may contain safe operational outcome categories and correlation references but must not contain credentials, raw source content, or sensitive scope data.

### FR-08 — Compatibility and feature gating

The integration shall preserve current Climate Advisor behavior for general chat, Stationary Energy, Concept Note, inventory capability, and temporary legacy datasource paths.

- Catalog-driven behavior must use existing Climate Advisor integration/feature-flag and service-auth boundaries.
- Existing legacy raw datasource access must not be widened or silently promoted as the new source-specific contract.
- Requests that do not satisfy the new scope/context contract must retain existing behavior or omit catalog-driven tools safely.
- No unrelated public API or UI behavior changes are required.

### FR-09 — Audit and observability

Discovery and selected reads shall emit safe per-request operational events or equivalent structured telemetry containing:

- request/thread correlation reference;
- caller identity reference that does not expose sensitive token data;
- selected catalog ID when applicable;
- capability ID when applicable;
- outcome category; and
- latency or duration.

Credentials, bearer tokens, raw source content, storage keys, signed URLs, and unnecessary sensitive scope identifiers must never be logged.

### FR-10 — Error handling and resource cleanup

Core and Climate Advisor shall handle external HTTP, database, validation, and source-resolution failures explicitly.

- Errors must fail closed.
- Client/session/connection resources must be released on success and failure.
- Climate Advisor must preserve existing token refresh behavior without logging credentials.
- One unavailable selected source must not expose it or force unrelated eligible tools to become available; behavior for preserving the rest of the request must follow the approved contract.

### FR-11 — Contract and security tests

The implementation shall add or update tests in both services for:

- authorized discovery;
- authorized selected source read;
- cross-user and cross-scope denial;
- unauthorized catalog entry filtering;
- withdrawn, superseded, unavailable, missing, and deleted source non-disclosure;
- invalid/forged/stale catalog selection;
- service-auth and bearer-token failures;
- bounded input/output contracts;
- absence of S3 credentials, signed URLs, raw storage paths, and unrestricted payloads;
- request-time registration of only selected source-specific tools;
- preservation of existing Climate Advisor tool packs and modes;
- timeout, dependency failure, error normalization, and resource cleanup behavior.

Example-based tests remain mandatory for critical scenarios. Partial Property-Based Testing applies to pure functions and serialization round-trips, with domain-specific generators and reproducible seeds.

## Non-Functional Requirements

### NFR-01 — Security and least privilege

The design and implementation must enforce defense in depth: schema validation, service authentication, user-token validation, object-level permission checks, catalog-state checks, source capability authorization, bounded response shaping, safe errors, and credential redaction.

### NFR-02 — Data ownership and boundary preservation

NativeInputCatalog remains Core-owned. GHGI, HIAP, CNB, and other modules remain authoritative for their source data. Climate Advisor remains an orchestrator and consumer, not a storage owner or authorization authority.

### NFR-03 — Bounded performance

Discovery, selection, and source reads must use existing internal API/client timeout conventions, bounded request/response sizes, and finite result sets. Only selected source tools may be loaded. No new release-blocking latency target is introduced by this issue; regressions must be measured against existing service defaults.

### NFR-04 — Reliability and graceful degradation

Core and Climate Advisor must fail closed on dependency or authorization errors, use explicit timeouts, and preserve unrelated eligible request capabilities where the contract permits. Resiliency tests for Core unavailability and request timeouts are documented for later Operations execution.

### NFR-05 — Compatibility

Existing API routes, capability contracts, workflow-specific tool packs, token refresh, and service authentication behavior must remain backward compatible unless a separately approved contract change is recorded.

### NFR-06 — Auditability and privacy

Security-relevant discovery/read outcomes must be traceable through safe correlation data. Logs and telemetry must exclude secrets, tokens, raw source content, storage credentials, signed URLs, and unnecessary PII/scope data.

### NFR-07 — Maintainability and contract clarity

Capability mappings, schemas, source bounds, required scopes, and transport exposure must be explicit and colocated with the existing registry/client/tool patterns. Unknown mappings must fail closed rather than requiring ad hoc route logic.

### NFR-08 — Testability

Core and Climate Advisor contracts must be independently testable with deterministic doubles. Cross-service contract tests must cover both positive and negative security paths without requiring production storage access.

## User Scenarios and Acceptance Criteria

### US-01 — Discover authorized native inputs

As a city user, I want Climate Advisor to list only the native inputs I can use in my current workspace so that the assistant does not expose another user's or project's data.

**Acceptance criteria**:

- Authorized active entries are returned with safe metadata.
- Entries outside the caller's applicable scope are absent.
- The response does not disclose unauthorized entry existence, raw scope data, or source content.

### US-02 — Load a selected source capability

As Climate Advisor, I want to load a capability for a selected authorized catalog entry at request time so that the agent receives only tools relevant to the active request.

**Acceptance criteria**:

- Selection accepts only an entry from the authorized discovery result.
- Only the selected entry's allowlisted capability is registered.
- Core revalidates the entry and caller on the read.
- The returned result is bounded and typed.

### US-03 — Deny cross-scope access safely

As a security owner, I want cross-user, cross-organization, cross-project, cross-city, and cross-inventory reads to fail without disclosure so that catalog pointers cannot become an IDOR path.

**Acceptance criteria**:

- Cross-scope discovery omits the entry or returns a non-disclosing result.
- A forged or stale selected catalog ID cannot read the source.
- No useful metadata or content reveals whether the source exists.

### US-04 — Handle unavailable or deleted sources

As a Climate Advisor user, I want unavailable or deleted source inputs to fail predictably without exposing internal storage details so that the assistant can continue with valid context.

**Acceptance criteria**:

- Withdrawn, superseded, unavailable, missing, and deleted sources are not exposed as usable entries.
- Attempted stale reads return a stable non-disclosing error.
- Other eligible tools remain governed by the approved request-time registration contract.

### US-05 — Preserve existing workflows

As a CityCatalyst maintainer, I want existing Climate Advisor workflows to keep their current behavior while catalog-driven capabilities are introduced so that the change can be rolled out safely.

**Acceptance criteria**:

- General chat, Stationary Energy, Concept Note, existing inventory capability tools, and legacy datasource behavior remain covered by regression tests.
- Existing service authentication, feature flags, and token refresh behavior remain intact.
- No new storage owner or parallel catalog service is introduced.

## Traceability to Linear Acceptance Criteria

| Linear acceptance criterion | Requirements |
|---|---|
| Only authorized catalog entries are discoverable | FR-01, FR-02, FR-06, US-01 |
| Source read is limited to the exact authorized entry/underlying source | FR-03, FR-04, FR-05, FR-06, US-02 |
| Unauthorized/cross-scope/unavailable/deleted sources disclose no metadata/content | FR-06, FR-07, US-03, US-04 |
| Bounded contract and no raw storage access | FR-05, NFR-01, NFR-02, NFR-07 |
| Tests for authorized discovery/read, denied cross-scope, unavailable source, and request-time loading | FR-11, NFR-08, US-01 through US-05 |

## Decisions Captured from Clarification Answers

### Primary answer set

| Question | Decision |
|---|---|
| Q1 | First slice covers active entries with existing bounded contracts, beginning with GHGI/HIAP and CNB only where ready. |
| Q2 | Discovery returns non-sensitive selection metadata and eligible capability IDs. |
| Q3 | User bearer identity plus explicit request/thread scope is authoritative; Core is final authority. |
| Q4 | Least-privilege filtering requires all applicable scope relationships to be authorized. |
| Q5 | Selection uses IDs from discovery; Core revalidates before each read. |
| Q6 | Typed allowlisted registry; unknown mappings are unavailable. |
| Q7 | Non-disclosing behavior for denied, cross-scope, unavailable, withdrawn, superseded, and deleted sources. |
| Q8 | Explicit schemas, field/result limits, and no raw storage/credential exposure. |
| Q9 | Core authorizes and validates catalog/source state on every read. |
| Q10 | Unavailable tools are not registered/exposed; attempted stale reads receive stable non-disclosing errors while unrelated eligible tools remain governed independently. |
| Q11 | Existing Climate Advisor behavior is preserved behind current feature/auth boundaries. |
| Q12 | Safe correlation, identity reference, catalog/capability IDs, outcome, and latency are recorded without secrets/content/sensitive scope data. |
| Q13 | Both services receive comprehensive positive, negative, contract, security, and request-time registration coverage. |
| Q14 | Existing timeout/boundedness conventions apply; no new hard latency target is introduced. |
| Q15 | Compatible contracts/tests first; existing feature flags and service auth govern rollout. |
| Q16 | User Stories execute. |
| Q17 | Application Design executes. |
| Q18 | Units Generation executes. |
| Q19 | Security Baseline enabled as blocking constraints. |
| Q20 | Resiliency Baseline enabled as directional design-time guidance. |
| Q21 | Property-Based Testing enabled in Partial mode. |

### Resiliency follow-up decisions

| Question | Decision and requirement impact |
|---|---|
| R1 RTO/RPO/DR | CC-737 introduces no new targets or DR strategy; inherit CityCatalyst platform objectives and procedures. |
| R2 Change management | Use existing Linear/GitHub Pull Request process with review, passing CI, and approval before deployment. |
| R3 CI/CD | Use existing Climate Advisor, web/Core, and CC–CA contract workflows; add tests to appropriate pipelines. |
| R4 Rollback | Use existing CityCatalyst rollback procedure, including previous version-pinned artifact redeploy when applicable. |
| R5 Deployment style | Inherit each affected service's existing deployment strategy. |
| R6 Regional topology | Inherit current CityCatalyst infrastructure; no multi-region change. |
| R7 Resiliency testing | Defer failover/DR test execution to Operations; document Core unavailability and timeout scenarios now. |
| R8 Incident response | Use the existing CityCatalyst operational incident process; create no new incident workflow. |

## Stage Selection Decisions

- **User Stories: EXECUTE.** CC-737 is a customer-facing cross-service capability with multiple personas/roles, security scenarios, user-visible availability behavior, and explicit acceptance criteria.
- **Application Design: EXECUTE.** New or materially extended Core discovery/capability components, Climate Advisor client/tool registration interfaces, and cross-service dependencies require explicit design artifacts.
- **Units Generation: EXECUTE.** The change spans Core and Climate Advisor, adds API contracts, and benefits from independently reviewable units with atomic commits and cross-service test checkpoints.
- **Workflow Planning: EXECUTE.** AI-DLC requires a workflow plan and explicit approval gates for this complex brown-field change.
- **Construction: NOT AUTHORIZED YET.** Construction remains blocked until the inception artifacts and execution plan are explicitly approved as required by the user.

## Extension Compliance at Requirements Stage

### Security Baseline

| Rule | Status | Requirements-stage treatment |
|---|---|---|
| SECURITY-01 | N/A for this change | No new persistence or storage resource is introduced; existing platform encryption remains a downstream verification constraint. |
| SECURITY-02 | N/A for this change | No network intermediary is added or reconfigured. |
| SECURITY-03 | Compliant at requirements level | Safe structured per-request discovery/read telemetry is required; secrets/content are excluded. |
| SECURITY-04 | N/A for this change | No HTML-serving endpoint is added or changed. |
| SECURITY-05 | Compliant at requirements level | Typed schemas, size bounds, allowlists, and parameterized existing data access are required. |
| SECURITY-06 | Compliant at requirements level | Least-privilege scope and explicit capability allowlists are mandatory. |
| SECURITY-07 | N/A for this change | No network topology or firewall resource change is in scope. |
| SECURITY-08 | Compliant at requirements level | Service auth plus user-token/object-level authorization is required on discovery and every read. |
| SECURITY-09 | Compliant at requirements level | Generic errors, no storage exposure, and fail-closed behavior are required. |
| SECURITY-10 | N/A for this change | No dependency or production image change is planned; existing lockfiles/CI remain governing constraints. |
| SECURITY-11 | Compliant at requirements level | Dedicated authorization/capability boundaries, defense in depth, and misuse scenarios are specified. |
| SECURITY-12 | N/A for this change | No authentication mechanism or credential store is changed; existing token handling is preserved. |
| SECURITY-13 | Compliant at requirements level | Validated serialization, allowlisted mappings, and safe audit references are required. |
| SECURITY-14 | Compliant at requirements level | Safe outcome and latency telemetry is required; platform alert routing remains existing operational scope. |
| SECURITY-15 | Compliant at requirements level | Explicit error handling, fail-closed defaults, generic errors, and resource cleanup are required. |

### Resiliency Baseline

| Rule | Status | Requirements-stage treatment |
|---|---|---|
| RESILIENCY-01 | Compliant at requirements level | Core and Climate Advisor are identified as the affected workloads with dependencies and user impact. |
| RESILIENCY-02 | N/A for this change | No new RTO/RPO target is defined; existing CityCatalyst platform objectives are inherited by explicit user decision. |
| RESILIENCY-03 | Compliant at requirements level | Existing Linear/GitHub Pull Request change process is required. |
| RESILIENCY-04 | Compliant at requirements level | Existing CI/CD, rollback, and deployment conventions are required; no new mechanism is introduced. |
| RESILIENCY-05 | Compliant at requirements level | Safe request outcome/latency observability is required; broader platform dashboards remain existing operations scope. |
| RESILIENCY-06 | N/A for this change | No service health-check or routing behavior is changed. |
| RESILIENCY-07 | N/A for this change | No scaling or resiliency monitoring infrastructure is changed. |
| RESILIENCY-08 | N/A for this change | Regional topology is explicitly inherited and unchanged. |
| RESILIENCY-09 | N/A for this change | No autoscaling or quota configuration is changed. |
| RESILIENCY-10 | Compliant at requirements level | Existing explicit timeouts, fail-closed behavior, and graceful preservation of unrelated tools are required. |
| RESILIENCY-11 | N/A for this change | Existing CityCatalyst DR strategy is inherited; no new persistent state is introduced. |
| RESILIENCY-12 | N/A for this change | No persistent data store or backup policy is added or changed. |
| RESILIENCY-13 | N/A for this change | Failover/failback procedures remain existing Operations scope. |
| RESILIENCY-14 | Compliant at requirements level | Core-unavailability and timeout scenarios are documented for later Operations testing. |
| RESILIENCY-15 | Compliant at requirements level | Existing CityCatalyst incident-response process is explicitly inherited. |

### Partial Property-Based Testing

Partial mode enforces PBT-02, PBT-03, PBT-07, PBT-08, and PBT-09. Requirements include:

- round-trip properties for applicable contract serialization/deserialization;
- invariants for scope filtering, allowlist mapping, bounded result shaping, and non-disclosure envelopes;
- domain-specific generators for catalog entries, scope combinations, capability selections, and contract payloads;
- shrinking and reproducible seed logging in CI;
- framework selection in downstream NFR/design work, with Hypothesis for Python and fast-check for TypeScript as the default candidates subject to dependency review.

## Open Implementation Decisions for Downstream Design

The requirements are complete. The following are design-level decisions to resolve in the approved Application Design/Units Generation stages without weakening these requirements:

- exact discovery and selected-read route names and versioning;
- the initial concrete GHGI/HIAP/CNB source-kind-to-capability mapping entries;
- exact safe metadata fields and response size limits per source type;
- the request/thread context object used to carry authorized scope;
- the stable non-disclosing error envelope and telemetry event names;
- the compatibility/feature-flag placement within current request-time registration;
- the per-unit atomic commit and cross-service contract-test sequence.

## Approval Status

**Requirements Analysis**: Complete; awaiting explicit user approval.

**Construction authorization**: Not granted.
