# NFR Requirements Plan — UOW-01 Core Catalog/Capability Boundary

## Purpose and gate

This plan defines the non-functional requirements assessment for UOW-01 after approval of its Functional Design artifacts. It covers the Core discovery and bounded selected-read boundary for Linear CC-737.

- **Issue**: [CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities](https://linear.app/openearth/issue/CC-737/connect-nativeinputcatalog-to-climate-advisor-capabilities)
- **Unit**: UOW-01 — Core Catalog/Capability Boundary.
- **Stage**: CONSTRUCTION — NFR Requirements.
- **Assigned stories**: US-01, US-02, US-04, US-05, US-06, US-08.
- **Status**: NFR Requirements artifacts approved; stage complete.
- **Prerequisite**: UOW-01 Functional Design plan and artifacts approved 2026-08-29.
- **Application code**: Must remain unchanged until the NFR Requirements plan and generated NFR artifacts are approved.

## Constraints carried forward

These are fixed inputs, not optional NFR choices:

- Core remains the final authority for user identity, every applicable scope dimension, catalog state, capability allowlisting, and source availability.
- Discovery omits unauthorized, unavailable, withdrawn, superseded, missing, deleted, or unreadable entries without metadata or reason disclosure.
- Stale, forged, malformed, unknown, mismatched, unauthorized, or unavailable selections use the stable non-disclosing selection outcome defined by Functional Design: HTTP 404, code `capability_unavailable`, message `Requested capability is unavailable.`
- Reads are bounded, typed, field-allowlisted, finite, source-redacted, and executed through existing Core/module boundaries.
- Climate Advisor receives no S3 credentials, bearer tokens, signed URLs, raw storage access, direct database access, storage paths as access mechanisms, or unrestricted source payloads.
- NativeInputCatalog and module systems of record remain existing owners; no new storage owner, persistence entity, authorization domain, deployment topology, or unrelated refactoring is introduced.
- Existing authentication, feature flags, timeouts, token refresh, cleanup, CI/CD, deployment, rollback, and operations conventions are preserved unless a separately approved requirement says otherwise.

## NFR assessment workplan

### 1. Scalability and capacity

- [x] Establish expected discovery/read request volume, concurrency, burst behavior, and growth assumptions from existing Core/Climate Advisor usage.
- [x] Define bounded catalog query, result, source-read, and in-flight work limits without widening access or introducing unbounded fan-out.
- [x] Define capacity measurement and scaling triggers using existing service/runtime practices.

### 2. Performance and resource behavior

- [x] Establish measurable discovery/read latency and throughput expectations relative to existing internal capability defaults.
- [x] Define timeout budgets, response-size limits, pagination/finite-result behavior, and resource cleanup requirements.
- [x] Define performance evidence that detects regressions without inventing a release-blocking target not justified by CC-737.

### 3. Availability and reliability

- [x] Confirm inherited availability, RTO/RPO, disaster-recovery, deployment, rollback, and incident objectives.
- [x] Define fail-closed behavior, dependency timeout handling, partial failure isolation, and preservation of unrelated authorized capabilities.
- [x] Define health, alert, and operational evidence using existing ownership and support paths.

### 4. Security, privacy, and non-disclosure

- [x] Verify threat-model coverage for IDOR, cross-scope access, existence oracles, forged/stale selections, confused-deputy behavior, route injection, credential exposure, and unbounded data exfiltration.
- [x] Define authentication/session, authorization, redaction, safe-error, safe-telemetry, and secret-handling NFRs.
- [x] Confirm applicable privacy/compliance and data-retention constraints without expanding data collection.

### 5. Technology and integration constraints

- [x] Confirm reuse of the existing TypeScript/Next.js/Core, Sequelize/model, capability registry, permission, HTTP, Python/Climate Advisor client, and schema-validation patterns.
- [x] Define where NFR enforcement belongs across Core, module adapters, and the Climate Advisor consumer without duplicating Core authority.
- [x] Identify any technology choice that is genuinely required versus an implementation detail deferred to NFR Design or Code Generation.

### 6. Maintainability, observability, and testability

- [x] Define documentation, contract-versioning, deterministic-double, and ownership expectations for the capability boundary.
- [x] Define safe metrics/logging/tracing fields, redaction, correlation, retention, and alerting expectations.
- [x] Define example-based, contract, security, compatibility, resiliency, and partial property-based quality gates.

### 7. Compatibility and rollout

- [x] Confirm feature-gated rollout and Core-first/Climate Advisor-consumer sequencing using existing deployment and rollback processes.
- [x] Define backward-compatibility and regression evidence for general chat, inventory, Stationary Energy, Concept Note, legacy datasource, authentication, and token refresh behavior.
- [x] Confirm no public API/UI contract or unrelated workflow changes are required.

### 8. NFR validation and traceability

- [x] Validate answers against the approved Functional Design artifacts, requirements FR-01 through FR-11, NFR-01 through NFR-08, assigned stories, Application Design, Units Generation, and Linear acceptance criteria.
- [x] Identify and resolve any NFR ambiguity with follow-up questions before artifact generation.
- [x] Prepare the NFR Requirements and Technology Stack Decisions artifacts only after this plan is answered and explicitly approved.

## NFR Requirements questions — complete every `[Answer]:` tag

Answer each question directly after its `[Answer]:` tag. Select one option and state any constraint or rationale needed. These questions define measurable non-functional behavior and technology constraints; they do not authorize application-code changes.

### Question 1 — Workload baseline

What workload baseline should UOW-01 use for discovery and selected reads?

A) Recommended: Inherit the current production/staging internal Core and Climate Advisor capability workload baseline; measure current request rate, concurrency, burst, catalog size, and source-read distribution before setting thresholds, with no new hard capacity target introduced by CC-737.

B) Introduce a new fixed request-rate and concurrency target specifically for CC-737.

C) Treat workload as unbounded and rely only on infrastructure autoscaling.

X) Other (describe after the tag).

[Answer]: A

### Question 2 — Growth and scaling triggers

How should capacity growth and scaling triggers be handled?

A) Recommended: Use existing Core/module scaling and operational thresholds; add CC-737-specific dashboards or alerts only for measurable regression, queueing, timeout, error-rate, or bounded-resource exhaustion, without changing topology.

B) Add a new dedicated service or worker pool for the catalog capability.

C) Scale only after user-visible failures occur.

X) Other (describe after the tag).

[Answer]: A

### Question 3 — Latency expectations

What performance requirement should apply to discovery and selected reads?

A) Recommended: Preserve existing internal API/client timeout and latency conventions; establish a baseline and regression budget during verification, but do not create a new release-blocking percentile target unless existing platform evidence supports it.

B) Set a new strict end-to-end percentile target for every catalog/source type.

C) Do not measure latency because correctness is the only concern.

X) Other (describe after the tag).

[Answer]: A

### Question 4 — Bounds and fan-out

How should NFR-level limits control catalog and source work?

A) Recommended: Reuse existing bounded request/response conventions and capability-specific finite limits; limit discovery work and selected reads to the active request, prohibit unbounded fan-out, and reject or normalize over-limit data before it crosses the boundary.

B) Allow the caller/model to choose result size and parallelism.

C) Load all eligible catalog entries and all mapped sources at request start.

X) Other (describe after the tag).

[Answer]: A

### Question 5 — Availability objectives

What availability and continuity objectives should UOW-01 adopt?

A) Recommended: Inherit CityCatalyst Core/module availability, RTO/RPO, disaster-recovery, incident, deployment, and rollback objectives; CC-737 adds no new topology or independent DR target.

B) Define an independent uptime, RTO/RPO, and multi-region deployment target for this capability.

C) Treat the capability as best effort with no operational objective.

X) Other (describe after the tag).

[Answer]: A

### Question 6 — Dependency failure and graceful degradation

What reliability behavior should apply when catalog, permission, or module dependencies fail?

A) Recommended: Fail closed for the affected discovery/read, use existing explicit timeouts, return the stable non-disclosing selection error where selection resolution applies, isolate unrelated authorized tools, and avoid retries/fallbacks that widen access or expose storage.

B) Retry indefinitely until the dependency recovers.

C) Fall back to cached authorization or direct/raw storage access.

X) Other (describe after the tag).

[Answer]: A

### Question 7 — Threat model priority

Which security threats must be treated as release-blocking NFR concerns?

A) Recommended: IDOR and cross-scope access across user/organization/project/city/inventory, service/user confused deputy, existence oracles, stale/forged/malformed selection abuse, allowlist/route injection, credential/storage exposure, unrestricted payloads, unsafe logs, and resource-exhaustion attacks.

B) Focus only on authentication and leave object-level authorization to existing tests.

C) Treat security threats as post-release hardening.

X) Other (describe after the tag).

[Answer]: A

### Question 8 — Privacy, retention, and telemetry

What privacy and observability policy should apply to discovery/read telemetry?

A) Recommended: Use existing privacy and log-retention policy; record only safe correlation/caller references, approved identities where permitted, coarse outcomes, bounded duration, and dependency/timeout categories; never record tokens, credentials, raw content, storage details, signed URLs, or unnecessary scope identifiers.

B) Retain full requests/responses and raw source identifiers for troubleshooting.

C) Disable all telemetry for denied or unavailable operations.

X) Other (describe after the tag).

[Answer]: A

### Question 9 — Technology reuse

Which technology constraint should govern implementation choices?

A) Recommended: Reuse the existing CityCatalyst TypeScript/Next.js/Sequelize/permission/capability-registry patterns and existing Climate Advisor Python/client/schema/tool patterns; introduce no new framework, service, storage, or transport unless separately justified and approved.

B) Introduce a shared cross-language capability framework for this issue.

C) Move authorization and source reads into Climate Advisor to minimize Core changes.

X) Other (describe after the tag).

[Answer]: A

### Question 10 — Enforcement placement

Where should NFR controls be enforced?

A) Recommended: Defense in depth: Core enforces authentication, scope, state, allowlist, source readiness, bounds, redaction, safe errors, and safe telemetry; module boundaries enforce source ownership; Climate Advisor validates consumption and selected-only loading without duplicating authorization.

B) Enforce all controls only in Climate Advisor after Core returns data.

C) Enforce controls only in each module and let Core pass through results.

X) Other (describe after the tag).

[Answer]: A

### Question 11 — Contract and compatibility policy

What compatibility policy should apply to the new Core capability boundary?

A) Recommended: Add versioned/explicit typed contracts within existing internal API conventions, preserve existing service-auth/token-refresh/feature-gate behavior, and require positive/negative contract and regression evidence before rollout.

B) Prefer an untyped flexible payload so modules can evolve independently.

C) Replace existing workflow-specific capability contracts with the new catalog contract.

X) Other (describe after the tag).

[Answer]: A

### Question 12 — Verification and release gates

What NFR evidence should be release-blocking for UOW-01?

A) Recommended: Core and cross-service contract/security tests; scope/non-disclosure/state-transition tests; boundedness/forbidden-data tests; auth, timeout, dependency, cleanup, and failure-isolation tests; compatibility regression; safe telemetry checks; and reproducible partial property-based invariants, all passing in existing CI gates.

B) Happy-path tests plus a manual review are sufficient.

C) Defer negative/security/performance evidence to production monitoring.

X) Other (describe after the tag).

[Answer]: A

### Question 13 — Rollout and rollback

How should the NFR rollout strategy handle partial deployment or rollback?

A) Recommended: Use existing feature flags and Core-first rollout sequencing; keep Climate Advisor consumption disabled until the Core contract is deployed and verified, preserve legacy behavior when catalog context is absent, and use existing rollback procedures without widening storage access.

B) Deploy both services simultaneously and make the new path unconditional.

C) Let Climate Advisor fall back to raw storage if Core is not ready.

X) Other (describe after the tag).

[Answer]: A

### Question 14 — Maintainability and ownership

What maintainability standard should apply to the boundary?

A) Recommended: Keep mappings, schemas, bounds, redaction, ownership, and safe-error behavior explicit and documented near existing patterns; assign Core as contract authority, module owners as source authorities, and preserve deterministic doubles for downstream consumers.

B) Optimize for the smallest code change even if rules remain implicit.

C) Centralize all source-specific rules in Climate Advisor.

X) Other (describe after the tag).

[Answer]: A

## Frontend and topology applicability

- Frontend usability/accessibility design is not applicable to UOW-01; no UI change is authorized by CC-737.
- No new deployment topology, service, storage, region, or persistence layer is proposed. Availability, recovery, and scaling decisions must inherit existing CityCatalyst platform practices unless a separately approved need is identified.

## Completion and approval gate

After all answers are supplied, they will be checked for completeness, ambiguity, consistency with the approved Functional Design, and preservation of the fixed security/storage constraints. Any unresolved decision will receive a follow-up question with a new `[Answer]:` tag. The NFR Requirements artifacts will be generated only after this plan is answered and explicitly approved.

## Answer validation result

- All 14 planning questions have non-empty `[Answer]:` tags.
- The answers consistently inherit existing platform/runtime baselines and preserve the approved Core authorization, bounded-read, non-disclosure, storage-ownership, and no-storage-credentials constraints.
- Security threats and negative evidence are release-blocking; no security concern is deferred to production monitoring.
- No contradiction or unresolved ambiguity requires a follow-up question.
- NFR Requirements and Technology Stack Decisions artifacts were generated and validated without changing application code.
- **Gate**: NFR artifact approval was required before proceeding.

## Plan approval

- **Approved by**: David
- **Approval input**: `approved`
- **Approval date**: 2026-08-29
- **Approval scope**: Generate the UOW-01 NFR Requirements and Technology Stack Decisions artifacts while preserving all fixed security, ownership, scope, and bounded-read constraints.

## Artifact generation and validation result

- Generated `nfr-requirements.md` and `tech-stack-decisions.md` under the UOW-01 NFR Requirements directory.
- Validated coverage of all approved NFR categories: scalability/capacity, performance, availability/reliability, security/privacy, technology reuse, observability, maintainability, compatibility/rollout, and release evidence.
- Validated explicit release-blocking treatment for Core authorization, every applicable scope dimension, non-disclosure, bounded reads/results, cleanup, failure isolation, and absence of storage credentials/raw storage access in Climate Advisor.
- Validated that technology decisions reuse the existing Core and Climate Advisor runtimes, clients, validation, capability, deployment, and test patterns without adding topology or storage ownership.
- No application code or tests were modified.
- **Gate**: NFR artifact approval recorded; NFR Design may begin.

## Artifact approval

- **Approved by**: David
- **Approval input**: `approved`
- **Approval date**: 2026-08-29
- **Approval scope**: Both UOW-01 NFR Requirements artifacts; proceed to NFR Design while preserving all stated constraints.
