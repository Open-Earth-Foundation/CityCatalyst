# UOW-01 Functional Design — Business Rules

These rules define the functional contract for the CityCatalyst Core side of CC-737. They are technology-agnostic and must be implemented within existing Core, permission, capability-registry, module-boundary, timeout, logging, and cleanup patterns. No rule grants Climate Advisor independent authority.

## Identity, request, and scope rules

### BR-01 — Service authentication is necessary but insufficient

Every discovery and selected-read operation requires the existing Climate Advisor service authentication pattern and a valid user-scoped bearer session. The service identity alone never authorizes a catalog entry or source read.

Traceability: FR-01, FR-06, NFR-01; US-01, US-06, US-08.

### BR-02 — Core binds the effective user

The effective user is taken from the authenticated user session and must match any user identity represented in the request. Climate Advisor cannot substitute an arbitrary user identifier. Existing authentication/identity failures remain distinct from source-selection non-disclosure, but must not contain catalog/source metadata.

Traceability: FR-01, FR-06, FR-10; NFR-01.

### BR-03 — Request context is bounded and explicit

The request may contain only the supported user, organization, project, city, inventory, correlation, filter, selection, and capability-input fields. Unknown, oversized, or unbounded context must be rejected using existing request-validation behavior without reading or exposing source content.

Traceability: FR-01, FR-04, FR-05, FR-10; NFR-03.

### BR-04 — Scope matching is conjunctive

For each catalog scope dimension that is populated—user, organization, project, city, or inventory—Core must resolve and authorize that relationship for the authenticated caller and active request. Every populated dimension must match. A broader authorized dimension cannot override a narrower mismatch.

Traceability: FR-01, FR-06, FR-07; NFR-01; US-01, US-03, US-05, US-06.

### BR-05 — Unknown scope fails closed

If a populated catalog scope field, request context, or permission relationship is missing, inconsistent, or cannot be resolved, the candidate is not eligible. Core must not guess, broaden, or ask Climate Advisor to decide which scope applies.

Traceability: FR-01, FR-06, FR-07; NFR-01, NFR-04.

### BR-06 — Scope data stays inside Core

Raw scope identifiers and permission-denial reasons are internal authorization data. They must not be returned as discovery metadata, selected-read errors, Climate Advisor tool arguments, or unnecessary telemetry.

Traceability: FR-02, FR-07, FR-09; NFR-01, NFR-06.

## Discovery and catalog-state rules

### BR-07 — Discovery exposes only eligible active entries

An entry is discoverable only when all of the following hold: it is active; all populated applicable scope relationships are authorized; its exact capability mapping is allowlisted and ready; and its underlying module source is present, available, and readable through the approved bounded boundary.

Traceability: FR-01, FR-03, FR-06, FR-07; US-01, US-02, US-05.

### BR-08 — Discovery omission is reason-neutral

Unauthorized, cross-scope, uncertain, unsupported, unknown, not-ready, withdrawn, superseded, missing, deleted, unavailable, and unreadable entries are omitted from the discovery result. The result must not include omission reasons, placeholders, counts that reveal hidden entries, labels, source identity, or state-specific metadata.

Traceability: FR-01, FR-02, FR-07; NFR-01, NFR-06; US-05.

### BR-09 — A catalog row is a pointer, not an access grant

Returning a safe discovery entry means only that Core found the entry eligible for the evaluated request at that time. Climate Advisor must not treat catalog identity, source type, labels, or a prior response as authorization for a later read.

Traceability: FR-02, FR-04, FR-06; NFR-01, NFR-02; US-01, US-06.

### BR-10 — Safe discovery projection is minimal

An eligible discovery entry may contain only the stable catalog identity needed for selection, safe kind/module/source labels, Core-issued capability IDs, safe selection/readiness indicators, and the minimum non-sensitive context needed by the active request. It must exclude raw source IDs, raw scope identifiers, storage locations, credentials, signed URLs, raw catalog fields, and source content.

Traceability: FR-02, FR-07; NFR-01, NFR-02, NFR-06; US-01, US-05.

### BR-11 — Lifecycle transitions invalidate prior eligibility

Withdrawn and superseded entries are not usable discovery entries. If an entry or its source changes state after discovery, a later read must revalidate current state and cannot return the prior result. A superseded entry is not silently replaced by its successor during a read.

Traceability: FR-01, FR-04, FR-06, FR-07, FR-10; NFR-04; US-04, US-06.

## Capability allowlist and source-boundary rules

### BR-12 — Mapping uses an exact closed tuple

Core resolves capabilities only from an explicit allowlist keyed by the exact `(owningModule, kind, sourceType)` tuple. Unknown, unsupported, conflicting, or not-ready tuples are unavailable. The mapping is not inferred from source type alone.

Traceability: FR-03, FR-04; NFR-07; US-02.

### BR-13 — Capability IDs are Core-issued

Climate Advisor and model output may select only capability IDs returned by the authorized discovery result. Core rejects or treats as unavailable any arbitrary, forged, stale, or model-generated capability identifier, route, module, source type, label, or storage pointer.

Traceability: FR-03, FR-04, FR-06, FR-07; NFR-01, NFR-07; US-02, US-06.

### BR-14 — Module boundaries remain authoritative

A mapped capability invokes only an existing approved bounded boundary owned by the relevant module. GHGI and HIAP may participate where their approved boundaries are ready. CNB is conditional on demonstrated readiness and separate acceptance. No generic adapter, raw storage fallback, or direct Climate Advisor-to-module-storage path is allowed.

Traceability: FR-03, FR-05, NFR-02, NFR-07; US-04, US-08.

### BR-15 — Capability definitions declare bounds

Each eligible capability definition must declare its operation type, validated input shape, typed output shape, required resource scope, permitted fields, source-specific redaction, and finite result/size bounds. A capability without a complete bounded definition is unavailable.

Traceability: FR-03, FR-05, FR-11; NFR-03, NFR-07, NFR-08; US-02, US-04, US-08.

## Selected-read and error rules

### BR-16 — Read validation order is fixed

Before a selected source read, Core performs, in order: service/user authentication; request shape/context validation; catalog identity resolution; active/current state validation; exact allowlist mapping and capability match; every applicable scope check; source existence/availability/readability verification; then bounded execution and result shaping. No source content is read before the authorization and selection checks complete.

Traceability: FR-04, FR-05, FR-06, FR-07; NFR-01; US-04, US-06, US-08.

### BR-17 — Selection failures are non-disclosing and stable

Stale, forged, malformed, invalid, unknown, capability-mismatched, unauthorized, withdrawn, superseded, missing, deleted, unavailable, and unreadable selections produce the same caller-visible selection-resolution outcome: HTTP 404 with code `capability_unavailable` and message `Requested capability is unavailable.` No source/catalog identity, state, labels, scope, storage detail, credentials, or content may appear in the envelope.

The exact route, serialization, and framework error plumbing are implementation details for later approved stages. Authentication failures and transport-level invalid JSON may retain existing service/request-validation contracts provided they do not disclose source metadata.

Traceability: FR-04, FR-06, FR-07, FR-10; NFR-01, NFR-04; US-06.

### BR-18 — No automatic substitution or fallback

Core must not substitute a different catalog entry, widen the user's scope, retry with an unapproved route, use a legacy raw datasource path, or expose storage access when a selection is invalid or a dependency is unavailable.

Traceability: FR-04, FR-05, FR-08, FR-10; NFR-01, NFR-02, NFR-04; US-06, US-07.

### BR-19 — Bounded result shaping precedes serialization

Only after successful authorization and module execution may Core shape the result. It applies the declared schema, permitted fields, source-specific redaction, and finite result/size bounds. Invalid, oversized, or forbidden upstream fields are rejected or normalized and never passed through as raw data.

Traceability: FR-05, FR-09, FR-11; NFR-01, NFR-03, NFR-08; US-04, US-08.

### BR-20 — Forbidden data never crosses the boundary

Climate Advisor must never receive S3 credentials, bearer tokens, signed URLs, raw object content, direct database data, storage keys/paths as access mechanisms, or unrestricted module payloads. Core and module adapters must preserve this rule even when an upstream service returns such data unexpectedly.

Traceability: FR-05, FR-07, FR-09, FR-11; NFR-01, NFR-02, NFR-06; US-04, US-08.

## Resiliency, telemetry, and compatibility rules

### BR-21 — Dependency failure fails closed

HTTP, database, permission, validation, source-resolution, timeout, and module failures must not produce an authorized result. Selection-resolution failures use BR-17 when applicable. Authentication and transport failures use existing safe service behavior.

Traceability: FR-06, FR-07, FR-10; NFR-01, NFR-04; US-06, US-08.

### BR-22 — One failed selection does not widen unrelated access

The failure of one selected source must not expose it, authorize another source, or modify the authorization state of unrelated capabilities. Climate Advisor may preserve independently authorized tools only under the existing orchestration contract.

Traceability: FR-04, FR-10; NFR-04; US-06.

### BR-23 — Timeouts and cleanup are mandatory

All external calls use existing explicit timeout and bounded-response conventions. HTTP clients, database transactions, streams, and module-boundary resources are released on both success and failure. A timeout never triggers raw-storage fallback.

Traceability: FR-05, FR-10, FR-11; NFR-03, NFR-04, NFR-08; US-04, US-08.

### BR-24 — Telemetry is safe and coarse

Discovery and reads may record a correlation reference, safe caller reference, approved catalog/capability identity where allowed, coarse outcome, bounded duration, and dependency/timeout category. Logs and telemetry must exclude tokens, credentials, raw source content, storage details, signed URLs, and unnecessary scope identifiers. Denied and unavailable outcomes may be counted by coarse category without becoming an existence oracle.

Traceability: FR-07, FR-09, FR-10; NFR-06; US-04, US-05, US-06, US-08.

### BR-25 — Existing workflows remain governed by existing rules

The new catalog-driven behavior does not replace or widen general chat, Stationary Energy, Concept Note, inventory, or legacy datasource behavior. Existing feature gates, service authentication, bearer/token-refresh, timeout, deployment, rollback, and CI conventions remain in force.

Traceability: FR-08, FR-10; NFR-04, NFR-05; US-07.

### BR-26 — No new ownership or persistence contract

The implementation must use the existing NativeInputCatalog lifecycle and module systems of record. It must not create a new storage owner, catalog database, parallel authorization domain, or unrelated persistence entity for this issue.

Traceability: FR-08; NFR-02, NFR-05, NFR-07; US-07.

## Verification rules

### BR-27 — Critical security paths require example-based evidence

Core verification must include authorized discovery/read, every populated scope denial, service-auth and user-binding failures, unknown mappings, all lifecycle states, stale/forged/malformed/invalid selections, safe error assertions, bounded result assertions, forbidden-data absence, timeout/dependency failures, cleanup, and safe telemetry.

Traceability: FR-11; NFR-01, NFR-08; US-08.

### BR-28 — Partial property-based invariants are reproducible

Pure scope, allowlist, selection, safe-projection, bounded-result, serialization, and safe-error logic should have domain generators, shrinking, and reproducible seeds where practical. Property-based evidence supplements and does not replace critical example-based authorization/security tests.

Traceability: FR-11; NFR-08; US-08.

### BR-29 — Cross-service evidence consumes Core truth

Core fixtures and contracts supplied to UOW-02/UOW-03 must represent Core's authoritative outcomes. Climate Advisor tests may verify consumption and safe handling, but may not duplicate or replace Core authorization logic.

Traceability: FR-03, FR-04, FR-06, FR-11; NFR-07, NFR-08; US-02, US-06, US-08.

## Rule precedence

When rules appear to compete, apply this order:

1. User/session authentication and Core authorization.
2. Non-disclosure and fail-closed behavior.
3. Catalog lifecycle and exact capability allowlist.
4. Source ownership and bounded result shaping.
5. Compatibility and graceful continuation for independently authorized tools.

No compatibility behavior may override authentication, scope, non-disclosure, storage-ownership, or bounded-read rules.
