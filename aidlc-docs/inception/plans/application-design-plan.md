# Application Design Plan — CC-737

## Purpose and Gate

This plan defines the Application Design work for Linear issue [CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities](https://linear.app/openearth/issue/CC-737/connect-nativeinputcatalog-to-climate-advisor-capabilities).

- **Project**: CityCatalyst brownfield monorepo.
- **Branch**: `cc-737-connect-nativeinputcatalog-to-climate-advisor-capabilities`.
- **Stage**: INCEPTION — Application Design.
- **Status**: Plan approved 2026-08-28; Application Design artifacts are being generated.
- **Application code**: Must remain unchanged during this stage.
- **Construction**: Not authorized.

Application Design will establish high-level component boundaries, interfaces, service orchestration, dependency direction, and cross-service contract ownership. Detailed business logic and implementation units remain deferred to Functional Design and Units Generation.

## Inputs and Guardrails

- Approved reverse-engineering artifacts under `aidlc-docs/inception/reverse-engineering/`.
- Approved Requirements Analysis under `aidlc-docs/inception/requirements/requirements.md`.
- Approved User Stories and personas under `aidlc-docs/inception/user-stories/`.
- Approved Workflow Planning under `aidlc-docs/inception/plans/execution-plan.md`.
- Core remains authoritative for NativeInputCatalog discovery, caller authorization, catalog/source state, and storage boundaries.
- Climate Advisor remains an orchestrator and bounded consumer; it receives no S3 credentials, signed URLs, raw storage access, or direct database access.
- Discovery omits unauthorized, unavailable, withdrawn, superseded, missing, and deleted entries without metadata disclosure.
- Reads using stale, forged, malformed, or invalid selections return a stable non-disclosing error. The exact status, code, envelope, and normalization contract must be decided here.
- Existing general chat, Stationary Energy, Concept Note, inventory, legacy datasource, service-authentication, token-refresh, timeout, and resource-cleanup patterns remain compatibility constraints.
- The first source slice must be limited to capabilities whose owning module already has an approved bounded read boundary; GHGI and HIAP are the starting candidates, with CNB only if its boundary is ready.

## Design Workplan

### 1. Context and boundary analysis

- [ ] Reconfirm the Core-to-Climate Advisor boundary from the approved architecture and current capability patterns.
- [ ] Identify the minimum new or extended components needed for discovery, allowlist evaluation, selected reads, request-time loading, error handling, and safe telemetry.
- [ ] Identify ownership of each contract and the dependency direction between Core, module systems of record, `CityCatalystClient`, tools, and `AgentService`.
- [ ] Confirm that no new storage owner, catalog service, authorization authority, or deployment topology is introduced.

### 2. Contract and method design

- [ ] Define high-level discovery, capability-eligibility, selection, and bounded-read interfaces.
- [ ] Define the scope context carried from the user request and the Core revalidation boundary.
- [ ] Define the typed allowlist ownership and the data needed to bind a catalog entry to an approved capability.
- [ ] Define the stable non-disclosing error contract for US-06, including status, code, envelope, and normalization rules.
- [ ] Define bounded input/output responsibilities, source-specific limits, timeout ownership, and resource cleanup boundaries.

### 3. Service orchestration design

- [ ] Define how discovery results are selected and passed into request-time Climate Advisor tool registration.
- [ ] Define how Core revalidates authorization, catalog state, capability mapping, and source availability immediately before every read.
- [ ] Define partial-failure behavior so invalid/unavailable selections do not widen access or expose unrelated sources.
- [ ] Define compatibility behavior for requests without catalog context and for existing workflow-specific tool packs.

### 4. Dependency and verification design

- [ ] Define Core-first contract ownership and the approved dependency direction.
- [ ] Define deterministic cross-service fixtures and contract-version coordination without creating a separately versioned shared package.
- [ ] Define Core and Climate Advisor unit/contract/security test responsibilities.
- [ ] Define safe audit/telemetry fields, redaction rules, and correlation behavior.
- [ ] Validate design consistency against all requirements, nine User Stories, four persona mappings, and Linear acceptance criteria.

## Mandatory Application Design Artifacts

- [ ] Generate `aidlc-docs/inception/application-design/components.md` with component names, purposes, responsibilities, and high-level interfaces.
- [ ] Generate `aidlc-docs/inception/application-design/component-methods.md` with method signatures, high-level purposes, and input/output types. Detailed business rules remain deferred to Functional Design.
- [ ] Generate `aidlc-docs/inception/application-design/services.md` with service responsibilities and orchestration patterns.
- [ ] Generate `aidlc-docs/inception/application-design/component-dependency.md` with dependency matrix, communication patterns, and data-flow diagrams.
- [ ] Generate `aidlc-docs/inception/application-design/application-design.md` consolidating the design artifacts.
- [ ] Validate design completeness, consistency, security boundaries, compatibility, and traceability.
- [ ] Obtain explicit approval of the completed Application Design artifacts.

## Design Questions — Complete Every `[Answer]:` Tag

Answer each question directly after its `[Answer]:` tag. Do not leave a tag blank. If an option is selected, preserve its identifier and explain any constraint or exception. These questions are intentionally limited to high-level design decisions; detailed per-unit behavior belongs in later stages.

### Question 1 — Component boundary

Which high-level component split should govern the design?

A) Recommended: Core owns catalog discovery, allowlist evaluation, per-read authorization/state validation, bounded source resolution, and safe error shaping; Climate Advisor owns selection state, client transport, bounded tool wrappers, and request-time registration.

B) Put most catalog and selection logic in Climate Advisor, with Core providing a generic source lookup.

C) Create a new shared catalog/capability service between Core and Climate Advisor.

X) Other (describe after the tag).

[Answer]: A — Core remains responsible for authorization, the catalog, and read limits; Climate Advisor remains the orchestrator and bounded consumer.

### Question 2 — Discovery interface placement

Where should the new authorized discovery interface live within the existing Core capability boundary?

A) Recommended: Add a dedicated catalog-discovery capability following existing internal CA authentication, permission, schema, and route patterns.

B) Extend the existing workflow-specific `allowed-capabilities` response to include catalog entries.

C) Reuse an existing producer lifecycle endpoint for end-user discovery.

X) Other (describe after the tag).

[Answer]: A — Create a specific internal discovery capability, following Core's current standards for authentication, permissions, schemas, and routes.

### Question 3 — Capability allowlist ownership

Where should the typed `(owning_module, kind, source_type)` allowlist be authoritative?

A) Recommended: Define it in Core's capability registry/boundary and expose only capability IDs and safe contract metadata to Climate Advisor.

B) Define independent mappings in Core and Climate Advisor and reconcile them through tests.

C) Let Climate Advisor derive a route from catalog fields at request time.

X) Other (describe after the tag).

[Answer]: A — The allowlist will be authoritative in Core; Climate Advisor will receive only capability IDs and safe metadata.

### Question 4 — Scope propagation and authority

Which request context must be carried into Core and revalidated for every selected read?

A) Recommended: User-scoped bearer identity plus every applicable populated user, organization, project, city, and inventory scope; Core is the final authority and does not trust Climate Advisor's discovery result.

B) User identity plus one highest-level scope selected by Climate Advisor.

C) Service identity only, with discovery treated as the authorization decision.

X) Other (describe after the tag).

[Answer]: A — Carry the user-scoped bearer identity and every applicable populated user, organization, project, city, and inventory scope; Core remains the final authority and revalidates the selection on every read.

### Question 5 — Selection binding

What should a selected source reference contain at the design level?

A) Recommended: A catalog identity plus an approved capability identity and explicit request context, with Core re-resolving and revalidating all state before reading.

B) Only an opaque catalog ID, with Core inferring the capability from current catalog fields.

C) A source type and source ID supplied by the model or client.

X) Other (describe after the tag).

[Answer]: A — Bind the catalog identity, approved capability identity, and explicit request context; Core must re-resolve and revalidate all state before reading.

### Question 6 — Stale/forged/invalid read error contract

Which non-disclosing contract should Application Design standardize for US-06?

A) Recommended: One stable generic error envelope for stale, forged, malformed, unauthorized, unavailable, missing, withdrawn, superseded, and deleted selections, with no existence/state distinction; define the exact HTTP status, machine code, envelope fields, and normalization rules in the design artifact.

B) Use distinct forbidden, not-found, and unavailable responses so clients can present precise source status.

C) Return an empty success result for invalid selections.

X) Other (describe after the tag).

[Answer]: A — Use one stable generic non-disclosing error envelope for stale, forged, malformed, unauthorized, unavailable, missing, withdrawn, superseded, and deleted selections; define the exact HTTP status, machine code, envelope fields, and normalization rules in the design artifact.

### Question 7 — Bounded response shape

How should bounded source results be represented?

A) Recommended: Each capability has an explicit typed input/output schema and source-specific field/size limits behind a common safe response envelope.

B) One generic untyped JSON payload for all source kinds.

C) Return source documents or storage references and let Climate Advisor trim them.

X) Other (describe after the tag).

[Answer]: A — Give each capability an explicit typed input/output schema and source-specific field and size limits behind a common safe response envelope.

### Question 8 — Request-time orchestration point

When should Climate Advisor discover and register catalog-driven tools?

A) Recommended: For the active request, after context is resolved and before agent execution; register only capabilities selected from the authorized discovery result.

B) Pre-register all supported catalog tools when the service starts.

C) Register tools only after the model asks for an arbitrary source route.

X) Other (describe after the tag).

[Answer]: A — Discover and register tools for the active request after context resolution and before agent execution, registering only capabilities selected from the authorized discovery result.

### Question 9 — Unavailable and partial-failure behavior

How should the design handle unavailable or invalid selected sources relative to other eligible tools?

A) Recommended: Omit unavailable entries during discovery; reject an invalid selected read with the stable non-disclosing error; keep unrelated eligible tools independently governed and available when the approved request contract permits.

B) Fail the entire agent request whenever any discovered source is unavailable.

C) Silently retry or fall back to raw datasource/storage access.

X) Other (describe after the tag).

[Answer]: A — Omit unavailable entries during discovery, reject invalid reads with the stable non-disclosing error, and keep unrelated eligible tools independently governed when the approved contract permits.

### Question 10 — Existing client and auth patterns

Which existing integration patterns should the design reuse?

A) Recommended: Extend `CityCatalystClient` for service headers, user bearer propagation, timeout, one-time token refresh, safe error mapping, and cleanup; retain Core's existing CA service-auth and feature-flag checks.

B) Create a separate Climate Advisor HTTP client with independent auth and retry semantics.

C) Let each tool call Core directly and manage credentials independently.

X) Other (describe after the tag).

[Answer]: A — Extend `CityCatalystClient` for service headers, user bearer propagation, timeouts, one-time token refresh, safe error mapping, and cleanup; retain Core's existing CA service-authentication and feature-flag checks.

### Question 11 — Compatibility boundary

How should catalog-driven tools coexist with existing Climate Advisor workflows?

A) Recommended: Keep current general chat, Stationary Energy, Concept Note, inventory, and legacy tool packs unchanged; add catalog-driven loading as a gated additive path and omit it safely when required context is absent.

B) Replace existing workflow-specific tools with catalog-driven tools in this issue.

C) Make catalog-driven tools globally available and allow the model to choose between raw and bounded paths.

X) Other (describe after the tag).

[Answer]: A — Keep current general chat, Stationary Energy, Concept Note, inventory, and legacy tool packs unchanged; add catalog-driven loading as a gated additive path and omit it safely when required context is absent.

### Question 12 — Safe telemetry

What should discovery/read telemetry contain?

A) Recommended: Correlation reference, safe caller reference, capability/catalog identity when approved, outcome category, and duration; exclude tokens, credentials, raw content, signed URLs, and unnecessary sensitive scope data.

B) Log full request and source payloads to simplify debugging.

C) Emit no telemetry for denied or unavailable outcomes.

X) Other (describe after the tag).

[Answer]: A — Record only a correlation reference, safe caller reference, approved capability/catalog identity, outcome category, and duration; exclude tokens, credentials, raw content, signed URLs, and unnecessary sensitive scope data.

### Question 13 — Contract test coordination

How should Core and Climate Advisor coordinate contract tests in this monorepo?

A) Recommended: Keep authoritative schemas and contract fixtures close to Core's capability boundary, consume deterministic fixtures from Climate Advisor tests, and run positive/negative cross-service verification in both service suites/CI.

B) Test only the Climate Advisor client with mocked Core behavior.

C) Test only Core routes and defer Climate Advisor registration verification.

X) Other (describe after the tag).

[Answer]: A — Keep authoritative schemas and fixtures close to Core, consume deterministic fixtures from Climate Advisor tests, and run positive and negative cross-service verification in both service suites and CI.

### Question 14 — First-slice source eligibility

How should Application Design treat candidate modules whose bounded read boundary is incomplete?

A) Recommended: Include only GHGI and HIAP capabilities that meet the approved boundary; include CNB only if its bounded Core/module contract is demonstrably ready, otherwise record it as a later extension.

B) Include every NativeInputCatalog row and resolve readiness during implementation.

C) Include CNB and other sources through direct Climate Advisor storage access until Core contracts exist.

X) Other (describe after the tag).

[Answer]: A — Include only GHGI and HIAP capabilities with an approved bounded read boundary; include CNB only if its bounded Core/module contract is demonstrably ready, otherwise record it as a later extension.

### Question 15 — Partial-failure continuation rule

Question 9 says unrelated eligible tools may remain available “when the approved contract permits.” What high-level continuation rule should the design use after one selected source read fails?

A) Recommended: Isolate the failed selected tool, return its stable non-disclosing error, and allow the active request to continue with unrelated tools that were independently authorized and registered, unless the existing Climate Advisor orchestration contract treats the failure as request-fatal.

B) Treat every selected-source failure as request-fatal and disable all tools for the active request.

C) Retry indefinitely or fall back to an alternate raw datasource/storage path.

X) Other (describe after the tag).

[Answer]: A

## Completion and Approval Gate

After all answers are supplied, the answers will be analyzed for ambiguity, contradiction, or missing design criteria. Any follow-up questions will be added here with new `[Answer]:` tags and must be completed before artifact generation.

The Application Design artifacts will be generated only after this plan is answered and explicitly approved. After artifact generation, the completed design package will be presented for a separate explicit approval. Units Generation and Construction remain blocked until their respective gates and the explicit Construction authorization.

## Answer Validation Result

- [x] All 14 original design questions have non-empty `[Answer]:` responses.
- [x] Follow-up Question 15 has a non-empty `[Answer]:` response.
- [x] Answers are internally consistent and preserve Core authorization, storage ownership, bounded reads, request-time loading, non-disclosure, compatibility, and cross-service verification.
- [x] No additional follow-up questions are required before the plan approval gate.
- [x] Explicit approval of this Application Design plan — 2026-08-28.
