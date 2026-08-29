# Unit of Work Plan — CC-737

## Purpose and Gate

This plan decomposes the approved CC-737 Application Design into manageable, reviewable units of work. It does not authorize application-code changes, Functional Design, Code Generation, or Construction.

- **Issue**: [CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities](https://linear.app/openearth/issue/CC-737/connect-nativeinputcatalog-to-climate-advisor-capabilities)
- **Project**: CityCatalyst brownfield monorepo.
- **Branch**: `cc-737-connect-nativeinputcatalog-to-climate-advisor-capabilities`.
- **Stage**: INCEPTION — Units Generation, Part 1 Planning.
- **Status**: Unit-of-work artifacts generated, validated, and approved 2026-08-29; Inception is complete and Construction authorization is pending.
- **Approved design basis**: `aidlc-docs/inception/application-design/`.
- **Construction**: Not authorized.

## Decomposition Guardrails

- Core remains the sole authority for catalog discovery, object-level authorization, scope validation, capability allowlisting, source-state validation, bounded source resolution, and the stable non-disclosing selection error.
- Climate Advisor remains the request-time orchestrator and bounded consumer. It owns selection coordination, client transport, tool wrappers, and agent registration, but cannot grant access or access storage.
- Module systems of record remain authoritative for source content. No S3 credentials, signed URLs, raw storage access, direct database access, or new storage owner may cross into Climate Advisor.
- Discovery omission and selected-read non-disclosure remain separate outcomes: unauthorized/unavailable/removed entries are omitted; stale/forged/malformed/invalid selections use the approved generic `404 capability_unavailable` contract.
- Existing general chat, Stationary Energy, Concept Note, inventory, legacy datasource, authentication, token refresh, timeout, cleanup, deployment, rollback, and CI/CD patterns remain compatibility constraints.
- GHGI and HIAP are first-slice candidates only where an approved bounded read boundary exists; CNB remains conditional on readiness.
- Units are logical development groupings inside the existing services, not permission to create new deployable services or repositories.

## Planning Workplan

### 1. Story grouping and unit boundaries

- [ ] Group all nine User Stories into independently reviewable units without losing Core/Climate Advisor ownership.
- [ ] Decide whether security/non-disclosure, compatibility, telemetry, and test evidence are embedded in service units or represented as a dedicated verification unit.
- [ ] Decide the right granularity for source-specific capability work without creating one unit per catalog row or premature module abstractions.
- [ ] Keep each unit small enough for atomic commits and explicit review gates.

### 2. Dependencies and sequencing

- [ ] Map Core contract/authorization dependencies before Climate Advisor consumers.
- [ ] Identify safe parallel work after the approved Core contract and shared deterministic fixtures exist.
- [ ] Define cross-unit contract synchronization and integration checkpoints.
- [ ] Define rollback and partial-completion handling for a multi-service change.

### 3. Ownership and collaboration

- [ ] Map each unit to Core/module ownership, Climate Advisor ownership, and security/operations review responsibilities.
- [ ] Identify required handoffs at the Core contract, client/tool, and cross-service verification boundaries.
- [ ] Define review evidence required before a unit can be marked complete.

### 4. Technical and domain alignment

- [ ] Confirm units align with the existing Core authorization/capability bounded context and Climate Advisor orchestration bounded context.
- [ ] Confirm no unit requires a new deployment topology, shared package, storage owner, or persistent schema migration.
- [ ] Define test ownership and release gates for contract, security, boundedness, compatibility, resiliency, and partial property-based testing.

## Mandatory Unit Artifacts

- [x] Generate `aidlc-docs/inception/application-design/unit-of-work.md` with unit definitions, responsibilities, scope, ownership, and review outputs.
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work-dependency.md` with the dependency matrix and sequencing/parallelization rules.
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work-story-map.md` mapping all nine stories to units and verification responsibilities.
- [x] Validate unit boundaries, dependencies, ownership, security constraints, and completeness.
- [x] Ensure every story is assigned to at least one unit and every unit has explicit acceptance evidence.
- [x] Obtain explicit approval of the completed Units Generation artifacts before any Construction stage — 2026-08-29.

## Decomposition Questions — Complete Every `[Answer]:` Tag

Answer directly after each `[Answer]:` tag. Preserve the selected option and add constraints where relevant. These questions define unit boundaries and coordination only; detailed implementation remains deferred to later approved stages.

### Question 1 — Primary unit grouping

Which top-level unit grouping should govern this cross-service change?

A) Recommended: Core Catalog/Capability Boundary, Climate Advisor Request-Time Integration, and Cross-Service Verification/Release Evidence as three logical units, with security and compatibility evidence embedded in each and integrated checks owned by the third.

B) One unit for the entire monorepo change.

C) One unit per source/module (GHGI, HIAP, CNB) plus separate service units.

X) Other (describe after the tag).

[Answer]: A

### Question 2 — Core unit scope

What should belong to the Core Catalog/Capability Boundary unit?

A) Recommended: Authorized discovery, safe metadata shaping, typed allowlist, selected-read revalidation, stable error normalization, bounded module adapters, Core contract/security tests, and safe Core telemetry.

B) Only NativeInputCatalog query changes; leave authorization and response shaping to Climate Advisor.

C) Move source content and storage access into this unit's Climate Advisor-facing contract.

X) Other (describe after the tag).

[Answer]: A

### Question 3 — Climate Advisor unit scope

What should belong to the Climate Advisor Request-Time Integration unit?

A) Recommended: Core-client discovery/read methods, selection binding, selected-only tool factory/wrappers, AgentService registration, stable error handling, token/resource lifecycle, compatibility behavior, and Climate Advisor tests.

B) Add a new independent authorization and catalog store inside Climate Advisor.

C) Modify only existing inventory tools and defer request-time catalog selection.

X) Other (describe after the tag).

[Answer]: A

### Question 4 — Verification unit scope

What should the Cross-Service Verification/Release Evidence unit own?

A) Recommended: Deterministic Core/Climate Advisor contract fixtures, integrated positive/negative security scenarios, compatibility regression matrix, boundedness/forbidden-field assertions, timeout/failure evidence, and CI/release evidence; it must not duplicate authorization ownership.

B) Only happy-path end-to-end tests.

C) Replace service-local unit/security tests with one centralized suite.

X) Other (describe after the tag).

[Answer]: A

### Question 5 — Dependency sequence

What dependency sequence should units follow?

A) Recommended: Define and verify the Core-owned contract and units first; then implement Climate Advisor consumers; then run integrated cross-service verification. Test scaffolding may proceed in parallel only after shared contract fixtures are approved.

B) Implement Climate Advisor first and let Core adapt to the client.

C) Implement all units in parallel without a contract checkpoint.

X) Other (describe after the tag).

[Answer]: A

### Question 6 — Team/ownership alignment

How should unit ownership and review responsibilities be assigned?

A) Recommended: Core unit to CityCatalyst Core/module maintainers; Climate Advisor unit to Climate Advisor maintainers; verification unit jointly coordinated with security/operations review; Core retains contract authority.

B) Assign all units to one service team regardless of ownership.

C) Assign ownership by source module only, regardless of service boundary.

X) Other (describe after the tag).

[Answer]: A

### Question 7 — Source capability granularity

How should GHGI, HIAP, and conditional CNB work be grouped?

A) Recommended: Keep source-specific adapters as subunits within the Core boundary unit, each activated only when its bounded contract is ready; do not create one unit per catalog row.

B) Create a separately deployable unit for every source type immediately.

C) Treat all sources as one untyped generic read unit.

X) Other (describe after the tag).

[Answer]: A

### Question 8 — Cross-cutting security and compatibility

How should security, non-disclosure, compatibility, telemetry, and resiliency requirements be represented?

A) Recommended: Embed enforceable controls and service-local tests in Core/Climate Advisor units, with cross-service assertions and release evidence in the verification unit; no requirement may be left only as a shared checklist.

B) Put all security and compatibility work in the final verification unit.

C) Defer security/non-disclosure evidence until Operations.

X) Other (describe after the tag).

[Answer]: A

### Question 9 — Contract fixture ownership

Where should deterministic cross-service fixtures and contract-version coordination live?

A) Recommended: Keep authoritative schemas/fixtures adjacent to Core capability contracts, expose a stable test-consumption shape to Climate Advisor, and verify compatibility in both service suites and CI without a new shared runtime package.

B) Maintain independent uncoordinated fixtures in each service.

C) Create a new shared runtime library before units are generated.

X) Other (describe after the tag).

[Answer]: A

### Question 10 — Deployment and rollback coordination

What deployment/rollback model should the units assume?

A) Recommended: Preserve independent existing service deployments but coordinate contract rollout through additive/feature-gated compatibility, ordered Core-before-consumer release, existing rollback procedures, and no catalog-data rollback.

B) Introduce a new combined deployment for both services.

C) Require a new infrastructure/topology design as part of unit generation.

X) Other (describe after the tag).

[Answer]: A

### Question 11 — Unit completion evidence

What evidence is required before a unit is considered complete?

A) Recommended: Unit-local tests plus required contract/security/compatibility evidence, redacted telemetry checks, explicit acceptance of boundaries, and an atomic commit; the verification unit additionally requires integrated positive/negative scenarios and build/CI evidence.

B) Code review only.

C) Happy-path tests only, with security evidence deferred.

X) Other (describe after the tag).

[Answer]: A

## Brownfield Code Organization

The greenfield-only code-organization question category is not applicable. Existing package ownership and directories remain authoritative: Core under `app`, Climate Advisor under `climate-advisor/service`, and tests in their existing service-local suites. Units Generation must map work onto those boundaries rather than inventing a new repository layout.

## Completion and Approval Gate

After all answers are supplied, they will be checked for ambiguity, contradictions, missing ownership, and incomplete story coverage. Any necessary follow-up questions will be added here with new `[Answer]:` tags. The three mandatory unit artifacts will be generated only after this plan is answered and explicitly approved.

## Answer Validation Result

- [x] All 11 decomposition questions have non-empty `[Answer]:` responses.
- [x] Answers select three logical units: Core Catalog/Capability Boundary, Climate Advisor Request-Time Integration, and Cross-Service Verification/Release Evidence.
- [x] Core remains contract and authorization owner; Climate Advisor remains a bounded consumer; verification does not duplicate authorization ownership.
- [x] Core-first sequencing, deterministic fixture coordination, existing deployment/rollback patterns, and atomic reviewable commits are explicit.
- [x] All nine User Stories can be assigned across the selected units without creating per-catalog-row units or new deployable services.
- [x] No additional follow-up questions are required before the plan approval gate.
- [x] Explicit approval of this Unit of Work plan — 2026-08-29.
