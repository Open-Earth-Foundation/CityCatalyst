# NFR Design Plan — UOW-01 Core Catalog/Capability Boundary

## Purpose and gate

This plan defines how the approved UOW-01 NFR Requirements will be incorporated into logical design patterns and components for Linear CC-737. It remains technology-agnostic where implementation detail belongs to Code Generation, while preserving the existing CityCatalyst/Core and Climate Advisor boundary patterns.

- **Issue**: [CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities](https://linear.app/openearth/issue/CC-737/connect-nativeinputcatalog-to-climate-advisor-capabilities)
- **Unit**: UOW-01 — Core Catalog/Capability Boundary.
- **Stage**: CONSTRUCTION — NFR Design.
- **Assigned stories**: US-01, US-02, US-04, US-05, US-06, US-08.
- **Status**: NFR Design artifacts approved; stage complete.
- **Prerequisite**: UOW-01 NFR Requirements and Technology Stack Decisions approved 2026-08-29.
- **Application code**: Must remain unchanged until the NFR Design plan and generated NFR Design artifacts are approved.

## Fixed design constraints

- Core remains the final authority for authenticated user identity, every applicable scope dimension, catalog state, capability allowlist, source availability, bounded result shaping, and safe selection errors.
- Discovery omits unauthorized, unavailable, withdrawn, superseded, missing, deleted, and unreadable entries without metadata or reason disclosure.
- Selected reads revalidate current state and return HTTP 404 `capability_unavailable` with `Requested capability is unavailable.` for selection-resolution failures.
- Climate Advisor remains a request-time consumer/orchestrator and receives no storage credentials, bearer tokens, signed URLs, raw storage access, direct database access, storage paths as access mechanisms, or unrestricted source payloads.
- Existing timeouts, cleanup, feature flags, deployment/rollback, observability, test runners, and module-owned bounded capability boundaries are reused.
- No new service, queue, cache, circuit breaker, worker pool, topology, persistence entity, catalog owner, or unrelated refactoring is proposed unless a separately approved need is demonstrated.

## NFR Design workplan

### 1. Resilience patterns

- [x] Design bounded timeout, retry, cancellation, and cleanup behavior for catalog, permission, registry, and module dependencies.
- [x] Design fail-closed selection handling and failure isolation without stale authorization, raw-storage fallback, or unrelated capability widening.
- [x] Design health, degradation, feature-disable, rollback, and operational handoff using existing service ownership.

### 2. Scalability patterns

- [x] Place finite catalog/result/request/concurrency bounds at the correct Core and boundary layers.
- [x] Prevent unbounded fan-out and ensure request-time selected-only capability work.
- [x] Define measurement points and scaling signals that reuse existing runtime/deployment mechanisms.

### 3. Performance patterns

- [x] Apply existing timeout/latency conventions and establish baseline/regression measurement points.
- [x] Design bounded response handling, streaming/aggregation behavior where applicable, and no stale-result caching for authorization.
- [x] Identify hot paths and avoid unnecessary catalog/source work without changing authorization semantics.

### 4. Security patterns

- [x] Map defense-in-depth controls across service authentication, user binding, scope checks, lifecycle, allowlist, source readiness, result shaping, redaction, error normalization, and telemetry.
- [x] Design protections against IDOR, cross-scope access, existence oracles, confused deputy, route injection, credential leakage, raw storage access, and resource exhaustion.
- [x] Define safe logging/tracing boundaries and verification hooks without exposing sensitive metadata.

### 5. Logical components and integration

- [x] Define the logical responsibilities and dependencies for authorization context, catalog filter, capability registry, source-readiness adapter, bounded result shaper, safe error mapper, and operational telemetry.
- [x] Confirm which existing components are reused and which new logical units are necessary, without creating new deployable infrastructure.
- [x] Define Core-to-module and Core-to-Climate Advisor integration seams, contract ownership, and deterministic test doubles.

### 6. Compatibility and rollout

- [x] Design Core-first feature-gated rollout and rollback while preserving existing Climate Advisor workflows.
- [x] Define compatibility behavior when context/feature flags are absent and when a dependency is unavailable.
- [x] Define contract/version and migration considerations without replacing existing workflow-specific contracts.

### 7. Verification and operations

- [x] Map each NFR pattern to example-based contract/security tests, negative cases, compatibility regression, cleanup, and timeout evidence.
- [x] Define partial property-based invariants, deterministic generators, shrinking, and reproducible seeds for pure logic.
- [x] Define safe dashboards/alerts/release evidence and ensure no secret/raw-content leakage in operational artifacts.

### 8. NFR Design validation

- [x] Validate design against approved NFR Requirements, Functional Design, requirements, stories, Application Design, Units Generation, and Linear acceptance criteria.
- [x] Identify and resolve any pattern/component ambiguity with follow-up questions before artifact generation.
- [x] Generate `nfr-design-patterns.md` and `logical-components.md` only after this plan is answered and explicitly approved.

## NFR Design questions — complete every `[Answer]:` tag

Answer each question directly after its `[Answer]:` tag. Select one option and state any constraint or rationale required. These questions define NFR design patterns and logical responsibilities; they do not authorize application-code changes.

### Question 1 — Retry and timeout pattern

How should dependency retries and timeouts be designed for discovery and selected reads?

A) Recommended: Reuse existing finite timeout/retry conventions only where already safe; keep selection authorization/read failures fail-closed, bound total work, cancel/cleanup on timeout, and never retry into raw storage or broader authorization.

B) Add indefinite retries to maximize eventual availability.

C) Retry with a less-authorized or direct-storage path when Core/module calls fail.

X) Other (describe after the tag).

[Answer]: A

### Question 2 — Circuit breaking and degradation

How should the design handle repeated dependency failures?

A) Recommended: Use existing health/feature-gate/deployment mechanisms and safe dependency outcome telemetry; do not add a new circuit-breaker component for this issue unless existing architecture already provides one, and disable/omit affected capabilities fail-closed.

B) Introduce a new cross-service circuit breaker and shared state store.

C) Continue serving cached authorization and previously read source data indefinitely.

X) Other (describe after the tag).

[Answer]: A

### Question 3 — Bounded concurrency

Where should finite work and concurrency bounds be applied?

A) Recommended: Enforce request/input/result bounds at Core validation and result-shaping boundaries, limit catalog evaluation and source execution to the active request and selected capabilities, and rely on existing service/runtime concurrency controls without unbounded fan-out.

B) Let Climate Advisor/model output choose parallelism and result size.

C) Load all eligible sources concurrently to reduce latency.

X) Other (describe after the tag).

[Answer]: A

### Question 4 — Performance optimization

What optimization pattern should be used for the discovery/read hot path?

A) Recommended: Measure current behavior first, remove unnecessary work within existing boundaries, use indexed/filtered existing access patterns where already available, and preserve per-read authorization; no cache may bypass current scope/state/source checks.

B) Add an authorization/result cache as the primary optimization.

C) Optimize by moving reads and authorization into Climate Advisor.

X) Other (describe after the tag).

[Answer]: A

### Question 5 — Security control placement

How should security controls be layered across logical components?

A) Recommended: Core authenticates and authorizes every request/read, evaluates all applicable scope and state, resolves the exact allowlist, checks source readiness, shapes/redacts results, normalizes safe errors, and emits safe telemetry; modules retain source ownership; Climate Advisor validates consumption and selected-only loading.

B) Perform authorization once during discovery and trust the selection afterward.

C) Make Climate Advisor the primary authorization layer.

X) Other (describe after the tag).

[Answer]: A

### Question 6 — Non-disclosure design

How should logical components prevent source-existence disclosure?

A) Recommended: Use omission-only discovery filtering, a single stable selection-resolution error, reason-free response shaping, redaction before logging/serialization, and coarse telemetry categories that cannot distinguish unauthorized, missing, deleted, or unavailable sources.

B) Return distinct errors so Climate Advisor can explain source state.

C) Return hidden-source placeholders with enough metadata for troubleshooting.

X) Other (describe after the tag).

[Answer]: A

### Question 7 — Logical component boundaries

Which component decomposition should NFR Design use?

A) Recommended: Reuse/define logical responsibilities for request/auth context, catalog candidate filtering, exact capability registry, source-readiness/module adapter, bounded result shaping, safe error mapping, and safe telemetry; keep them inside existing deployable services and preserve Core authority.

B) Create a new shared capability gateway that owns all authorization and storage access.

C) Put catalog filtering, authorization, and source reads entirely in Climate Advisor.

X) Other (describe after the tag).

[Answer]: A

### Question 8 — Caching and consistency

What caching/consistency pattern is acceptable?

A) Recommended: Do not introduce a new authorization or source-result cache; if existing infrastructure caches transport data, it must not bypass per-read authorization/state/readiness checks, serve stale results, or reveal hidden-source state.

B) Cache discovery and authorization decisions for the request lifetime and skip read-time revalidation.

C) Cache raw source objects in Climate Advisor for resilience.

X) Other (describe after the tag).

[Answer]: A

### Question 9 — Observability pattern

How should operational observability be designed?

A) Recommended: Reuse existing structured logging/metrics/tracing and add only safe correlation, caller reference, approved identity where allowed, coarse outcome, bounded duration, and dependency/timeout fields; redact before emission and never record tokens, credentials, raw content, storage details, or unnecessary scope IDs.

B) Capture full request/response payloads and raw source IDs for diagnostics.

C) Disable denied/unavailable telemetry to avoid any disclosure risk.

X) Other (describe after the tag).

[Answer]: A

### Question 10 — Rollout and failure containment

How should NFR patterns integrate with rollout and rollback?

A) Recommended: Enable the Core contract behind existing feature controls, verify Core evidence first, then enable Climate Advisor consumption; preserve legacy behavior when context/flags are absent and disable the new path on rollback without widening storage access.

B) Make the new path unconditional once code is deployed.

C) Let the consumer activate raw-storage fallback during partial deployment.

X) Other (describe after the tag).

[Answer]: A

### Question 11 — Contract versioning and compatibility

How should contract evolution be designed?

A) Recommended: Keep explicit typed contracts and Core-owned capability IDs stable within existing internal API conventions; introduce a version only when an incompatible change requires it, and require consumer/contract/security regression evidence for changes.

B) Use untyped pass-through payloads to avoid versioning decisions.

C) Replace all existing workflow-specific contracts with one generic catalog payload.

X) Other (describe after the tag).

[Answer]: A

### Question 12 — Verification architecture

How should NFR design map to verification components?

A) Recommended: Use Core unit/contract/security tests for authorization, omission, safe errors, allowlist, bounds, redaction, and cleanup; deterministic module/client doubles for dependency behavior; cross-service contract tests for consumer compatibility; and partial PBT for pure invariants with reproducible seeds.

B) Rely on one end-to-end happy-path suite.

C) Test only Climate Advisor because it is the user-facing consumer.

X) Other (describe after the tag).

[Answer]: A

## Frontend and infrastructure applicability

- Frontend NFR design is not applicable to UOW-01; no UI change is authorized by CC-737.
- No new queue, cache, circuit breaker, worker pool, service, storage, region, persistence layer, or deployment topology is proposed. Existing logical/runtime components and operational mechanisms remain the design baseline.

## Completion and approval gate

After all answers are supplied, they will be reviewed for ambiguity, contradictions, and consistency with the approved NFR Requirements and Functional Design. Any unresolved decision will receive a follow-up question with a new `[Answer]:` tag. NFR Design artifacts will be generated only after this plan is answered and explicitly approved.

## Answer validation result

- All 12 planning questions have non-empty `[Answer]:` tags.
- The answers consistently select bounded existing timeout/retry and operational patterns, Core defense-in-depth, omission/non-disclosure, selected-only work, no stale authorization cache, and no new infrastructure.
- The logical component approach preserves Core authorization and module source ownership while keeping Climate Advisor as a request-time consumer.
- No contradiction or unresolved ambiguity requires a follow-up question.
- NFR Design artifacts were generated and validated without changing application code.
- **Gate**: NFR Design artifact approval was required before proceeding and has been recorded below.

## Plan approval

- **Approved by**: David
- **Approval input**: `approved`
- **Approval date**: 2026-08-29
- **Approval scope**: Generate the UOW-01 NFR Design Patterns and Logical Components artifacts while preserving all fixed security, ownership, scope, bounded-read, and no-storage-credentials constraints.

## Artifact generation and validation result

- Generated `nfr-design-patterns.md` and `logical-components.md` under the UOW-01 NFR Design directory.
- Validated resilience, scalability, performance, security, non-disclosure, observability, compatibility, rollout, and verification pattern coverage.
- Validated logical ownership: Core controls authorization and boundary shaping, modules retain source ownership, Climate Advisor consumes Core truth, and UOW-03 verifies without duplicating authority.
- Validated no new service, queue, cache, circuit breaker, worker pool, topology, persistence layer, raw storage path, or credential flow is introduced.
- No application code or tests were modified.
- **Gate**: Explicit approval of both NFR Design artifacts is recorded below; Code Generation planning may begin.

## Artifact approval

- **Approved by**: David
- **Approval input**: `approved`
- **Approval date**: 2026-08-29
- **Approval scope**: Both revised UOW-01 NFR Design artifacts, including the explicit separation between lightweight discovery readiness probing and selected-only bounded capability loading/execution. Core authorization, non-disclosure, bounded reads, module source ownership, and the no-storage-credentials constraint remain mandatory.
