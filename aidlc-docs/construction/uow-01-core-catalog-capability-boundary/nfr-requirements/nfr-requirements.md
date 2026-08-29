# UOW-01 NFR Requirements — Core Catalog/Capability Boundary

## Scope and status

This document records the approved non-functional requirements for UOW-01 of Linear CC-737, after the Functional Design approval. It covers the Core-owned discovery and selected-read boundary for `NativeInputCatalog`-backed Climate Advisor capabilities.

The requirements are intentionally compatible with the brown-field CityCatalyst architecture. They inherit existing platform and service objectives unless this document explicitly adds a CC-737 constraint. They do not introduce a new service, storage owner, catalog database, deployment topology, authorization domain, or UI.

The requirements are derived from the approved NFR plan, whose 14 answers selected the recommended options. They complement, and do not replace, the approved Functional Design business rules and entities.

## Fixed security and ownership constraints

The following requirements are release-blocking and cannot be traded for performance, availability, convenience, or compatibility:

1. Core is the final authority for the authenticated user, every applicable user/organization/project/city/inventory scope relationship, catalog lifecycle, capability allowlist, and source availability.
2. Climate Advisor is a service consumer/orchestrator. It cannot authorize a user, choose an arbitrary route, access catalog storage, access module storage, or use a catalog pointer as an access grant.
3. Discovery omits unauthorized, cross-scope, uncertain, unsupported, not-ready, withdrawn, superseded, missing, deleted, unavailable, and unreadable entries without metadata, omission reasons, counts, labels, source identity, or content disclosure.
4. A selected read revalidates current identity, scope, catalog state, exact capability mapping, and source readiness. Stale, forged, malformed, unknown, mismatched, unauthorized, and unavailable selections use the stable non-disclosing selection outcome: HTTP 404, code `capability_unavailable`, message `Requested capability is unavailable.`
5. Results are typed, field-allowlisted, source-redacted, and finite. Core shapes results before they cross the boundary.
6. Climate Advisor receives no S3 credentials, bearer tokens, signed URLs, raw storage objects, direct database data, storage paths as access mechanisms, or unrestricted source payloads.
7. Module systems of record remain authoritative for their source data. No generic adapter or raw-storage fallback is permitted.

## Requirement classification

- **Blocking**: Must pass before rollout. Security, authorization, non-disclosure, boundedness, credential isolation, contract integrity, and critical compatibility rules are blocking.
- **Baseline**: Inherited from current CityCatalyst/Core/Climate Advisor platform conventions and verified for regression.
- **Evidence-driven**: Measured or confirmed during verification using current production/staging behavior; no arbitrary target is created by this issue.

## Scalability and capacity

### NFR-UOW01-01 — Inherited workload baseline

Use current production/staging Core and Climate Advisor capability usage as the capacity baseline. Before rollout, measure discovery/read request rate, concurrency, burst behavior, catalog size, source-read distribution, and dependency response characteristics. CC-737 does not introduce a new fixed request-rate or concurrency target without platform evidence.

Classification: Evidence-driven, baseline.

Traceability: Approved NFR Q1; FR-01, FR-05, NFR-03, NFR-04; US-01, US-04, US-08.

### NFR-UOW01-02 — Bounded work and finite fan-out

Discovery and selected reads must use existing bounded request/response conventions and capability-specific finite limits. The active request may load only the selected capabilities. Neither Core nor Climate Advisor may perform unbounded catalog fan-out, source fan-out, result accumulation, or caller/model-selected parallelism.

Over-limit requests/results must be rejected or safely normalized before crossing the boundary. A limit failure cannot trigger a less-safe fallback.

Classification: Blocking.

Traceability: Approved NFR Q4; FR-04, FR-05, FR-10; NFR-01, NFR-03, NFR-07; US-02, US-04, US-06, US-08.

### NFR-UOW01-03 — Capacity and scaling observation

Use existing Core/module scaling and operational thresholds. Add CC-737-specific dashboards or alerts only for measurable regression, queueing, timeout, error-rate, latency, or bounded-resource exhaustion. No dedicated service, worker pool, or topology change is required.

Classification: Baseline, evidence-driven.

Traceability: Approved NFR Q2; NFR-03, NFR-04, NFR-06; US-08.

## Performance and resource behavior

### NFR-UOW01-04 — Existing latency and timeout conventions

Discovery, capability resolution, permission checks, module reads, and Climate Advisor client calls must preserve existing internal timeout and latency conventions. Establish a pre-change baseline and a regression budget during verification. Do not create a new release-blocking percentile target unless existing platform evidence justifies it.

Timeouts must be finite and applied to each external operation. Timeout behavior must fail closed and must not return stale or raw data.

Classification: Blocking for timeout safety; evidence-driven for regression budget.

Traceability: Approved NFR Q3; FR-05, FR-10, FR-11; NFR-03, NFR-04, NFR-08; US-04, US-06, US-08.

### NFR-UOW01-05 — Resource cleanup

Database transactions, HTTP clients, response bodies, streams, and module-boundary resources must be released on success, validation failure, timeout, dependency failure, and result-shaping failure. Cleanup must not alter authorization state or expose a partial result.

Classification: Blocking.

Traceability: FR-10, FR-11; NFR-04, NFR-08; US-04, US-08.

### NFR-UOW01-06 — No stale-result or cache authorization

Cached data, prior discovery responses, or previously valid selections must not substitute for current Core authorization, current catalog state, or current source readiness. Any caching used by existing infrastructure must not become an authorization cache or a source-existence disclosure channel.

Classification: Blocking.

Traceability: FR-04, FR-06, FR-07, FR-10; NFR-01, NFR-04; US-05, US-06.

## Availability and reliability

### NFR-UOW01-07 — Inherited availability and recovery objectives

Inherit CityCatalyst Core/module availability, RTO/RPO, disaster-recovery, incident-response, deployment, and rollback objectives. CC-737 adds no independent uptime target, multi-region topology, or DR strategy.

The capability must be observable and operable through existing ownership/support paths.

Classification: Baseline.

Traceability: Approved NFR Q5; NFR-04, NFR-05, NFR-06; US-08.

### NFR-UOW01-08 — Fail-closed dependency behavior

Catalog, permission, authentication, validation, capability-registry, module, database, and transport failures must not produce an authorized source result. A selected-read resolution failure uses the stable non-disclosing error. Discovery omits entries whose eligibility cannot be verified.

Do not retry indefinitely, use cached authorization, widen scope, substitute a different source, or fall back to raw storage. Retry behavior, if already present in a lower-level client, must remain bounded and within existing conventions.

Classification: Blocking.

Traceability: Approved NFR Q6; FR-06, FR-07, FR-10; NFR-01, NFR-04; US-05, US-06, US-08.

### NFR-UOW01-09 — Failure isolation

Failure of one selected capability must not authorize, expose, or change the availability of an unrelated capability. Climate Advisor may continue with independently authorized tools only under its existing orchestration contract; Core does not broaden that contract.

Classification: Blocking.

Traceability: FR-04, FR-10; NFR-04; US-06, US-08.

## Security and privacy

### NFR-UOW01-10 — Release-blocking threat model

Verification and review must cover:

- IDOR and cross-scope access across user, organization, project, city, and inventory dimensions;
- service/user confused-deputy behavior;
- discovery and read existence oracles;
- stale, forged, malformed, unknown, and mismatched selections;
- allowlist, route, module, source, and model-input injection;
- credentials, tokens, signed URLs, storage paths, and raw-object exposure;
- unrestricted response/payload exfiltration;
- unsafe logs/telemetry; and
- unbounded fan-out or resource-exhaustion attempts.

Classification: Blocking.

Traceability: Approved NFR Q7; FR-01 through FR-07, FR-09 through FR-11; NFR-01, NFR-02, NFR-06, NFR-08; US-01, US-02, US-04, US-05, US-06, US-08.

### NFR-UOW01-11 — Defense-in-depth enforcement

Core enforces service authentication, user binding, all applicable scope checks, lifecycle checks, exact allowlisting, source readiness, typed input/output, result bounds, redaction, safe errors, and safe telemetry. Module boundaries enforce source ownership and module-level access. Climate Advisor validates contract consumption and selected-only loading but does not duplicate or replace Core authorization.

Classification: Blocking.

Traceability: Approved NFR Q10; FR-01, FR-03 through FR-07, FR-09; NFR-01, NFR-02, NFR-07; US-01, US-02, US-04, US-05, US-06, US-08.

### NFR-UOW01-12 — Non-disclosure consistency

Discovery omission and selected-read failure must remain indistinguishable with respect to unauthorized, unavailable, removed, and unknown source state. Discovery must not expose omission reasons. Selected-read errors must remain the stable generic error and must not echo source/catalog identity, lifecycle state, permission details, source metadata, storage details, or content.

Authentication and transport errors may retain existing contracts only when they contain no catalog/source disclosure.

Classification: Blocking.

Traceability: FR-01, FR-02, FR-04, FR-06, FR-07, FR-10; NFR-01, NFR-06; US-05, US-06, US-08.

### NFR-UOW01-13 — Secret and storage isolation

The Core-to-Climate Advisor contract and all logs/telemetry must exclude S3 credentials, bearer tokens, service keys, signed URLs, raw storage paths/access mechanisms, direct database data, raw storage objects, and unrestricted source payloads. Unexpected upstream sensitive fields must be filtered or cause safe rejection before serialization.

Classification: Blocking.

Traceability: FR-05, FR-07, FR-09, FR-11; NFR-01, NFR-02, NFR-06; US-04, US-08.

### NFR-UOW01-14 — Privacy and retention

Use existing privacy and log-retention policy. Do not expand data collection for CC-737. Retain only safe correlation/caller references, approved identities where permitted, coarse outcome categories, bounded durations, and dependency/timeout categories. Raw requests/responses, source content, raw scope identifiers, and credentials are not retained for troubleshooting.

Classification: Blocking for secret/privacy handling; baseline for retention duration.

Traceability: Approved NFR Q8; FR-09, FR-10; NFR-06; US-05, US-06, US-08.

## Technology and integration constraints

### NFR-UOW01-15 — Reuse existing implementation patterns

Implementation must reuse the current CityCatalyst TypeScript/Next.js/Node, Sequelize/Postgres model, Zod/request-validation, permission, service-authentication, capability-registry, HTTP, structured logging, and Jest patterns. Climate Advisor must reuse its current Python 3.11–3.12, FastAPI/Uvicorn, `httpx`, Pydantic, Agents SDK/tool, pytest/pytest-asyncio, and existing token-refresh/client patterns.

No new framework, service, storage system, cross-language shared runtime, or transport is required by this issue.

Classification: Baseline, blocking for unauthorized technology expansion.

Traceability: Approved NFR Q9; FR-08, FR-10, FR-11; NFR-05, NFR-07, NFR-08; US-07, US-08.

### NFR-UOW01-16 — Boundary-local enforcement

Place each control at the boundary that owns the relevant authority. Core owns catalog, authorization, allowlist, source-state, result-shaping, and safe-error enforcement. Modules own source behavior. Climate Advisor owns request-time orchestration and consumer validation. No consumer-side check may be treated as a substitute for Core enforcement.

Classification: Blocking.

Traceability: Approved NFR Q10; NFR-01, NFR-02, NFR-07; US-02, US-04, US-06, US-08.

## Maintainability and observability

### NFR-UOW01-17 — Explicit contract maintainability

Capability mappings, schemas, required scope, bounds, redaction, source ownership, safe-error behavior, and compatibility assumptions must be explicit and documented near existing patterns. Core is contract authority, module owners are source authorities, and UOW-02/UOW-03 consume deterministic fixtures rather than redefining authority.

Classification: Blocking for contract clarity.

Traceability: Approved NFR Q14; FR-03, FR-05, FR-11; NFR-07, NFR-08; US-02, US-04, US-08.

### NFR-UOW01-18 — Safe observability

Operational evidence must support correlation, coarse outcomes, latency/timeout analysis, dependency failure analysis, bounded-resource monitoring, and rollout verification without creating an existence oracle. Allowed fields follow the Functional Design `OperationalOutcome` entity. Redaction applies before emission, not only in a downstream sink.

Classification: Blocking.

Traceability: FR-07, FR-09, FR-10; NFR-04, NFR-06; US-05, US-06, US-08.

## Compatibility and rollout

### NFR-UOW01-19 — Explicit typed compatibility contract

The capability boundary must use explicit typed input/output and error contracts within existing internal API conventions. Contract changes require Core/Climate Advisor consumer tests and review. Untyped pass-through, arbitrary route derivation, and replacement of existing workflow-specific contracts are prohibited.

Classification: Blocking.

Traceability: Approved NFR Q11; FR-03 through FR-05, FR-08, FR-11; NFR-05, NFR-07, NFR-08; US-02, US-04, US-07, US-08.

### NFR-UOW01-20 — Core-first feature-gated rollout

Use existing feature flags and deployment/rollback processes. Deploy and verify the Core contract before enabling Climate Advisor consumption. When catalog context or the feature boundary is absent, preserve existing behavior and omit catalog-driven tools safely. Rollback must not widen access or activate raw storage fallback.

Classification: Blocking for rollout safety; baseline for deployment mechanism.

Traceability: Approved NFR Q13; FR-08, FR-10; NFR-04, NFR-05; US-06, US-07.

### NFR-UOW01-21 — Existing workflow compatibility

Regression evidence must cover general chat, inventory, Stationary Energy, Concept Note, legacy datasource behavior, service authentication, bearer/session binding, token refresh, timeout handling, cleanup, and feature-gate behavior. CC-737 must not silently promote or widen legacy raw datasource access.

Classification: Blocking.

Traceability: FR-08, FR-10, FR-11; NFR-04, NFR-05, NFR-08; US-07, US-08.

## Verification and release gates

### NFR-UOW01-22 — Release-blocking evidence

Existing CI gates must include passing Core and cross-service contract/security evidence for:

- authorized discovery and exact-source read;
- every user/organization/project/city/inventory scope denial;
- service authentication and user-binding failures;
- stale, forged, malformed, unknown, and mismatched selections;
- active, withdrawn, superseded, missing, deleted, unavailable, and unreadable states;
- omission and stable generic error non-disclosure;
- bounded fields, finite result sizes, redaction, and forbidden-data absence;
- timeouts, dependency failure, failure isolation, and cleanup;
- safe telemetry and redaction; and
- compatibility and request-time selected-only behavior consumed by downstream units.

Classification: Blocking.

Traceability: Approved NFR Q12; FR-11; NFR-01, NFR-04, NFR-08; US-08.

### NFR-UOW01-23 — Partial property-based evidence

Where practical, pure scope, allowlist, selection, safe-projection, bounded-result, serialization, and safe-error logic must use domain generators, shrinking, and reproducible seeds. Property-based tests supplement, and do not replace, example-based critical authorization and security tests.

Classification: Blocking for selected pure invariants; evidence-driven for applicable coverage.

Traceability: FR-11; NFR-08; US-08.

## Deferred numeric and implementation decisions

The following are intentionally deferred to NFR Design and Code Generation after existing values are inspected: exact request/response byte limits, maximum result counts, concurrency limits, latency regression thresholds, metric names, alert thresholds, retention durations where not already governed, contract version syntax, and concrete schema/transport implementation. Deferral does not permit unbounded behavior; existing safe defaults remain the minimum baseline.

## Traceability summary

| NFR area | Derived requirements | Primary source stories |
|---|---|---|
| Capacity/performance | NFR-UOW01-01 through NFR-UOW01-06 | US-01, US-02, US-04, US-06, US-08 |
| Availability/reliability | NFR-UOW01-07 through NFR-UOW01-09 | US-04, US-06, US-08 |
| Security/privacy | NFR-UOW01-10 through NFR-UOW01-14 | US-01, US-02, US-04, US-05, US-06, US-08 |
| Technology/boundaries | NFR-UOW01-15 through NFR-UOW01-16 | US-02, US-04, US-06, US-07, US-08 |
| Maintainability/observability | NFR-UOW01-17 through NFR-UOW01-18 | US-05, US-06, US-08 |
| Compatibility/rollout | NFR-UOW01-19 through NFR-UOW01-21 | US-06, US-07, US-08 |
| Verification/release | NFR-UOW01-22 through NFR-UOW01-23 | US-08 |
