# Functional Design Plan — UOW-01 Core Catalog/Capability Boundary

## Purpose and Gate

This plan defines the detailed business logic for UOW-01 from the approved CC-737 unit decomposition. It is technology-agnostic at the business-rule level; implementation details, code units, and test-file placement remain deferred to later approved stages.

- **Issue**: [CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities](https://linear.app/openearth/issue/CC-737/connect-nativeinputcatalog-to-climate-advisor-capabilities)
- **Unit**: UOW-01 — Core Catalog/Capability Boundary.
- **Assigned stories**: US-01, US-02, US-04, US-05, US-06, US-08.
- **Stage**: CONSTRUCTION — Functional Design.
- **Status**: Functional Design artifacts approved; stage complete.
- **Construction authorization**: Granted 2026-08-29.
- **Application code**: Must remain unchanged until this plan and the generated Functional Design artifacts are approved.

## Unit Responsibilities

- Authorized NativeInputCatalog discovery and safe metadata shaping.
- Core-authoritative capability allowlist and capability eligibility.
- Per-read caller, scope, catalog-state, mapping, and source-availability validation.
- Bounded module source adapters for approved GHGI/HIAP capabilities and conditional CNB readiness.
- Stable HTTP 404 `capability_unavailable` non-disclosing selection error.
- Safe telemetry, redaction, timeout, cleanup, and Core-side contract/security evidence.

## Functional Design Workplan

### 1. Business logic modeling

- [x] Model the discovery flow from request context through candidate filtering, capability eligibility, and safe response shaping.
- [x] Model the selected-read flow from selection validation through bounded source execution and result shaping.
- [x] Model active, withdrawn, superseded, unavailable, missing, and deleted source states and their caller-visible outcomes.
- [x] Model the relationship between a catalog pointer, capability definition, authorization scope, and module source of truth.

### 2. Domain model and entities

- [x] Define the functional fields and relationships for request context, catalog identity, safe discovery entry, capability definition, authorized execution context, bounded result, and safe error.
- [x] Define which fields are internal-only, safe-to-return, safe-to-log, or forbidden across the Climate Advisor boundary.
- [x] Confirm no new persistence entity or catalog ownership is required.

### 3. Business rules and validation

- [x] Define least-privilege scope evaluation across all populated applicable user, organization, project, city, and inventory dimensions.
- [x] Define active-entry and underlying-source readiness rules for discovery.
- [x] Define closed allowlist rules for `(owningModule, kind, sourceType)` and unsupported mapping behavior.
- [x] Define per-read revalidation and fail-closed behavior for stale, forged, malformed, invalid, unauthorized, unavailable, missing, withdrawn, superseded, and deleted selections.
- [x] Define typed input/output bounds, source-specific field limits, finite results, timeout behavior, and resource cleanup.

### 4. Data flow and integration behavior

- [x] Define Core interactions with NativeInputCatalog, PermissionService/session, capability registry, and module-owned source adapters.
- [x] Define discovery and selected-read request/response transformations without exposing raw catalog or storage data.
- [x] Define module-specific readiness and bounded adapter participation for GHGI, HIAP, and conditional CNB.
- [x] Define safe outcome telemetry and correlation data at each boundary.

### 5. Error and edge-case behavior

- [x] Confirm the stable caller-visible HTTP 404 `capability_unavailable` contract for selection-resolution failures.
- [x] Define separation between service authentication/transport validation errors and source-selection non-disclosure errors.
- [x] Define behavior for partial source failure without exposing source state or widening unrelated access.
- [x] Define concurrency/state-transition behavior when catalog rows are withdrawn or superseded between discovery and read.

### 6. Verification preparation

- [x] Define Core example-based acceptance scenarios for positive, negative, non-disclosure, boundedness, and forbidden-data behavior.
- [x] Define applicable partial property-based invariants, generators, shrinking, and reproducible seeds.
- [x] Define deterministic module/service doubles and cross-service contract evidence consumed by UOW-02/UOW-03.
- [x] Validate functional design against assigned stories, all approved requirements, the Application Design package, and Linear acceptance criteria.

## Mandatory Functional Design Artifacts

- [x] Generate `aidlc-docs/construction/uow-01-core-catalog-capability-boundary/functional-design/business-logic-model.md`.
- [x] Generate `aidlc-docs/construction/uow-01-core-catalog-capability-boundary/functional-design/business-rules.md`.
- [x] Generate `aidlc-docs/construction/uow-01-core-catalog-capability-boundary/functional-design/domain-entities.md`.
- [x] Validate functional design completeness, consistency, authorization boundaries, non-disclosure, bounded reads, and traceability.
- [x] Obtain explicit approval of the completed Functional Design artifacts before proceeding to the next Construction stage.

## Functional Design Questions — Complete Every `[Answer]:` Tag

Answer each question directly after its `[Answer]:` tag. Preserve the selected option and explain any constraint. These questions define business behavior, not code structure.

### Question 1 — Scope matching semantics

How should Core evaluate catalog scope when multiple scope dimensions are populated on an entry?

A) Recommended: Require authorization for every populated applicable dimension; all populated dimensions must match the authenticated user's permitted relationship, and a missing/uncertain relationship fails closed.

B) Authorize against the broadest available dimension and ignore narrower populated dimensions.

C) Let Climate Advisor choose which scope dimensions apply.

X) Other (describe after the tag).

[Answer]: A

### Question 2 — Unscoped or partially scoped catalog rows

How should discovery treat catalog rows with missing scope dimensions or scope fields that cannot be resolved?

A) Recommended: A row is eligible only when its populated scope is authorized and its source/readiness can be verified; missing or uncertain required context makes the row unavailable and omits it.

B) Treat any row with one authorized scope field as discoverable.

C) Return the row with a warning so Climate Advisor can decide.

X) Other (describe after the tag).

[Answer]: A

### Question 3 — Discovery eligibility states

Which catalog/source states should be eligible for discovery?

A) Recommended: Only active catalog entries whose underlying source exists, is available/readable through its module boundary, and has an approved capability mapping; withdrawn, superseded, missing, deleted, unavailable, and unknown states are omitted.

B) Include withdrawn/superseded entries for historical context.

C) Include any catalog row and defer source-state validation to the read.

X) Other (describe after the tag).

[Answer]: A

### Question 4 — Safe discovery metadata

What metadata may cross from Core to Climate Advisor for an eligible entry?

A) Recommended: Stable catalog identity needed for selection, safe kind/module/source labels, approved capability IDs, safe readiness/selection labels, and only the minimum non-sensitive context needed by the active request; exclude raw scope identifiers, storage details, credentials, and content.

B) Return all NativeInputCatalog fields so the agent can reason about sources.

C) Return source IDs and storage locations but not credentials.

X) Other (describe after the tag).

[Answer]: A

### Question 5 — Capability mapping and readiness

How should Core decide that a catalog entry can advertise a capability?

A) Recommended: Resolve an exact allowlisted `(owningModule, kind, sourceType)` mapping, verify the mapped module boundary is ready, and advertise only the Core-issued capability IDs; unknown or not-ready mappings are unavailable.

B) Match by source type alone and infer the owning module at runtime.

C) Accept a capability ID supplied by Climate Advisor or the model.

X) Other (describe after the tag).

[Answer]: A

### Question 6 — Selected-read validation order

What functional order should Core use before executing a selected source read?

A) Recommended: Authenticate service and user, validate request shape/context, resolve catalog identity, verify active/current state, resolve the Core allowlist mapping, recheck every applicable scope, verify source availability/readability, then execute and shape the bounded result.

B) Resolve the source first, then check permission after reading.

C) Trust the discovery result and validate only the user ID at read time.

X) Other (describe after the tag).

[Answer]: A

### Question 7 — Non-disclosing selection failures

Which selection failures must produce the same caller-visible outcome?

A) Recommended: Stale, forged, malformed selection values, unknown IDs, capability mismatch, unauthorized scope, withdrawn, superseded, unavailable, missing, and deleted sources all produce HTTP 404 with code `capability_unavailable` and the generic message `Requested capability is unavailable.`

B) Distinguish forbidden, not-found, withdrawn, and unavailable so clients can explain the source state.

C) Return an empty successful result for invalid selections.

X) Other (describe after the tag).

[Answer]: A

### Question 8 — Bounded result behavior

How should Core shape a successful source result?

A) Recommended: Apply the capability's typed output schema, field allowlist, finite size/result limits, and source-specific redaction before returning a common safe envelope; reject/normalize invalid upstream data without exposing it.

B) Return the module's raw response and let Climate Advisor trim it.

C) Return a generic untyped payload with no per-capability limits.

X) Other (describe after the tag).

[Answer]: A

### Question 9 — Module adapter participation

How should GHGI, HIAP, and CNB source adapters participate in this unit?

A) Recommended: Implement/enable only adapters with an existing approved bounded module/Core boundary; GHGI and HIAP are first candidates, while CNB is excluded from this slice unless readiness is demonstrated and separately accepted.

B) Add generic adapters for all source types even if their boundaries are incomplete.

C) Let Climate Advisor access module storage directly until adapters are ready.

X) Other (describe after the tag).

[Answer]: A

### Question 10 — Partial failure and concurrency

How should Core behave when a source becomes unavailable or changes state between discovery and read?

A) Recommended: The read revalidates current state and returns the stable non-disclosing error for that selection; it must not widen access or affect authorization of unrelated tools, and no stale result is returned.

B) Return the previously discovered data if the source was once eligible.

C) Retry until the source becomes available or fall back to raw storage access.

X) Other (describe after the tag).

[Answer]: A

### Question 11 — Safe operational outcomes

Which functional outcome categories may Core record for discovery/read telemetry?

A) Recommended: Correlation reference, safe caller reference, approved catalog/capability identity where allowed, coarse outcome category, bounded duration, and dependency/timeout category; exclude tokens, credentials, raw content, storage details, and unnecessary scope data.

B) Full request, response, and source identifiers for troubleshooting.

C) No telemetry for denied or unavailable operations.

X) Other (describe after the tag).

[Answer]: A

### Question 12 — Core verification scope

Which evidence must be mandatory in UOW-01's Core verification?

A) Recommended: Authorized discovery/read, every scope denial class, all source-state transitions, forged/stale/malformed selections, allowlist rejection, bounded result/forbidden-field assertions, auth failures, timeout/dependency failure, cleanup, redaction, and reproducible partial property-based invariants.

B) Authorized happy-path discovery/read only.

C) Defer all negative/security evidence to UOW-03.

X) Other (describe after the tag).

[Answer]: A

## Frontend Applicability

Frontend component design is not applicable to UOW-01. This unit is a Core service/capability boundary; user-facing presentation is outside its ownership and no UI change is authorized by CC-737.

## Answer Validation Result

- All 12 planning questions have non-empty `[Answer]:` tags.
- The answers consistently select Core-authoritative, fail-closed behavior and preserve the approved non-disclosure, bounded-read, storage-ownership, and authorization boundaries.
- No contradiction or unresolved ambiguity requires a follow-up question.
- The stable selection-failure outcome is intentionally recorded as a functional requirement; its exact implementation contract remains subject to the later approved design and cross-service contract work.
- Functional Design artifacts were generated and validated without changing application code or tests.
- **Gate**: Functional Design artifact approval was required before proceeding.

## Completion and Approval Gate

After all answers are supplied, they will be analyzed for ambiguity, contradictions, missing business rules, and incomplete edge-case coverage. Any required follow-up questions will be added with new `[Answer]:` tags. Functional Design artifacts will be generated only after this plan is answered and explicitly approved.

## Plan Approval

- **Approved by**: David
- **Approval input**: `approved`
- **Approval date**: 2026-08-29
- **Approval scope**: Generate the UOW-01 Functional Design artifacts only; application code and tests remain deferred.

## Artifact Generation and Validation Result

- Generated the business logic model, business rules, and domain entities artifacts under the UOW-01 Functional Design directory.
- Validated traceability to CC-737, FR-01 through FR-11, relevant NFRs, and US-01, US-02, US-04, US-05, US-06, and US-08.
- Validated explicit separation between discovery omission and selected-read `capability_unavailable` failure behavior.
- Validated Core authorization, bounded module-owned reads, no-storage-credentials/raw-storage constraints, lifecycle handling, safe telemetry, cleanup, compatibility, and required verification evidence.
- No application code or tests were modified.
- **Gate**: Functional Design artifact approval recorded; the next Construction stage may begin.

## Artifact Approval

- **Approved by**: David
- **Approval input**: `Approved, proceed to the next stage while maintaining the constraints regarding scope, Core authorization, bounded reads, non-disclosure, and the absence of storage credentials in Climate Advisor`
- **Approval date**: 2026-08-29
- **Approval scope**: All three UOW-01 Functional Design artifacts; proceed to NFR Requirements with the stated constraints preserved.
