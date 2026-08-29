# UOW-01 NFR Design — Patterns

## Design intent

This document translates the approved UOW-01 NFR Requirements into implementation-oriented patterns without selecting concrete filenames or writing application code. The patterns preserve the existing CityCatalyst/Core and Climate Advisor architecture for Linear CC-737.

Core remains the authorization, catalog, capability-contract, source-readiness, result-shaping, and safe-error authority. Module systems remain source authorities. Climate Advisor remains a request-time consumer. No pattern here creates a new deployable service, storage owner, authorization domain, queue, cache, circuit breaker, worker pool, or topology.

## Pattern summary

| Concern | Selected pattern | Primary enforcement point |
|---|---|---|
| Identity | Existing service authentication plus user-scoped session binding | Core boundary |
| Authorization | Conjunctive evaluation of every populated user/org/project/city/inventory dimension | Core permission/context component |
| Discovery | Filter-and-project using a lightweight non-content readiness check; omit every ineligible row without reason | Core catalog filter + readiness probe |
| Capability selection | Closed exact tuple allowlist; Core-issued IDs only | Core capability registry |
| Read consistency | Per-read state/scope/mapping/source revalidation before the selected bounded execution | Core selection validator |
| Resilience | Finite timeout/retry, cancellation, cleanup, fail-closed degradation | Core/client/module boundaries |
| Scalability | Bounded request/result/concurrency work; selected-only execution | Core boundary and existing runtime controls |
| Performance | Baseline first, early filtering, existing indexes/conventions, no unsafe cache | Core data/authorization path |
| Data safety | Typed input/output, field allowlist, redaction, finite bounds | Core result shaper and selected module boundary |
| Error safety | One stable selection-resolution error; no state/reason disclosure | Core safe-error mapper |
| Observability | Structured, coarse, redacted outcomes before emission | Core telemetry boundary |
| Rollout | Existing feature gate; Core-first verification; consumer enablement second | Existing deployment controls |
| Verification | Layered Core tests, deterministic doubles, cross-service contract tests, partial PBT | Existing CI/test suites |

## Resilience patterns

### RP-01 — Finite timeout and bounded retry

Every external operation—session/permission evaluation, catalog access, capability resolution, module readiness, and bounded source execution—uses the existing finite timeout conventions. Existing retry behavior may be reused only when it is finite, safe, and does not change authorization or source selection.

The total operation budget is bounded across nested calls. A timeout or exhausted retry budget produces a safe failure; it never produces a stale result, broadens scope, substitutes another source, or falls back to raw storage. Selection-resolution failures normalize to the approved safe error. Transport/authentication failures retain existing safe behavior.

### RP-02 — Cancellation and cleanup on every path

Cancellation propagates from the request boundary through permission/catalog/module calls where the existing runtime supports it. Each operation releases database, HTTP, stream, and module resources on success, validation failure, timeout, dependency failure, cancellation, and result-shaping failure.

Cleanup is part of the operation contract and is verified with deterministic doubles. A cleanup failure must not cause sensitive intermediate data to be serialized or logged.

### RP-03 — Fail-closed degradation

When a dependency cannot prove authorization, current state, allowlist eligibility, source readiness, or bounded result validity, the capability is unavailable. Discovery omits the candidate. A selected read returns the generic HTTP 404 `capability_unavailable` error.

No cached authorization, previously discovered result, raw-storage fallback, alternate route, or automatic superseded-source substitution is permitted.

### RP-04 — Failure isolation without new infrastructure

The logical boundary isolates failure to the affected discovery candidate or selected capability. Core does not make unrelated capabilities available because one fails. Climate Advisor may preserve independently authorized tools under its existing orchestration behavior, but that consumer behavior cannot weaken Core checks.

This is a responsibility and test pattern, not authorization to add a new circuit breaker, queue, worker pool, or shared state store.

### RP-05 — Health, feature disable, and rollback through existing operations

Repeated dependency failures are observed through existing health, metrics, alerts, feature flags, deployment, and rollback mechanisms. If the new path is disabled, catalog-driven tools are omitted safely and legacy behavior remains governed by its current rules. Rollback never activates raw storage access.

## Scalability patterns

### SP-01 — Bounded request and result envelope

Validate request context, filters, selections, capability input, and response shape at the boundary. Apply existing finite byte, field, item, and equivalent limits. Reject or normalize over-limit inputs/upstream data before it crosses the Core–Climate Advisor boundary.

Exact numeric values are selected later from existing service defaults and capability-specific contracts; the absence of a new CC-737 target does not permit unbounded work.

### SP-02 — Selected-only work and bounded fan-out

Discovery evaluates candidates within Core's bounded query/access pattern and may perform only a lightweight, non-content readiness check for each candidate. Discovery does not load Climate Advisor tools, initialize executable source capabilities, invoke full capability operations, or read source content for all catalog entries.

After discovery, Climate Advisor loads a request-scoped tool only for the user-selected entry. Core then revalidates that one selection and loads/executes only its exact mapped bounded capability. The selected read does not expand into all eligible sources or capabilities. Any existing concurrency mechanism remains bounded by current runtime controls.

The model or caller cannot choose arbitrary parallelism, source fan-out, route count, or result size.

### SP-02A — Two-phase readiness and execution boundary

The lifecycle has two deliberately separate phases:

| Phase | Allowed behavior | Prohibited behavior |
|---|---|---|
| Discovery-time readiness | For each candidate, perform only a bounded non-content check that the exact mapped module boundary is configured/ready and that the source can be considered available/readable. Filter and project safe metadata, or omit the candidate. | Loading Climate Advisor tools, initializing executable source capabilities for the request, invoking the full source capability, fetching source content, or executing full reads for every catalog entry. |
| Selected-read execution | After Climate Advisor selects one returned catalog entry, revalidate user/scope/state/mapping/readiness, load the one Core-approved capability, execute its bounded operation, shape/redact its result, and return it. | Loading or executing capabilities for unselected entries, substituting another source, trusting discovery without revalidation, or falling back to raw storage. |

The discovery readiness check is an eligibility probe, not a data read and not an authorization grant. If a module boundary cannot expose a safe lightweight readiness signal, Core omits the candidate and the selected-read path fails closed. The selected-read path is the only path that may execute source content retrieval, and it may execute only the capability selected from the authorized discovery result.

### SP-03 — Early rejection and narrow execution

Perform cheap, non-content checks before any module content read: request shape, user binding, catalog state, exact mapping, and scope. During discovery, the source-readiness check is limited to a bounded availability/readability probe or equivalent metadata check exposed by the module boundary; it must not load a Climate Advisor capability, execute its full operation, or fetch source content. During a selected read, repeat readiness validation and only then load/execute the one selected bounded capability. Shape and redact the result before serialization. This reduces unnecessary work while preserving the fixed validation order and per-read authorization.

If a module cannot provide a safe lightweight readiness check, the candidate is not eligible for discovery and the selected-read path fails closed. No full-read fallback is allowed.

### SP-04 — Existing runtime scaling signals

Use current Core/Climate Advisor service metrics and deployment scaling mechanisms. Observe request rate, concurrency, queueing, timeouts, dependency latency, result-bound rejections, and error categories. Add only issue-specific dashboards/alerts needed to detect regressions or exhaustion; do not create a new scaling plane.

## Performance patterns

### PP-01 — Baseline and regression budget

Measure discovery and selected-read behavior before and after the change using existing service/client metrics. Compare request rate, latency, dependency time, error rate, timeout rate, result size, and resource cleanup behavior. A new percentile target is not invented without platform evidence.

### PP-02 — Preserve authorization on the hot path

Performance optimization may remove duplicate non-authorizing work, use existing filtered/indexed access patterns, and avoid source reads for ineligible candidates. It may not remove per-read scope/state/source checks or replace them with a cache.

### PP-03 — No stale authorization/result cache

No new cache is introduced for authorization or source results. If an existing transport cache applies, the design must ensure it cannot bypass current user/scope, catalog state, capability mapping, source readiness, boundedness, or non-disclosure. Stale data must not be returned as a newly authorized result.

## Security and privacy patterns

### SP-SEC-01 — Defense-in-depth authorization chain

The Core request path is layered:

```text
service authentication
  -> user/session binding
  -> bounded request validation
  -> catalog state
  -> every populated scope dimension
  -> exact capability allowlist
  -> lightweight readiness check during discovery / full current readiness recheck for selected read
  -> selected capability load and bounded module operation only
  -> typed field/redaction/size shaping
  -> safe telemetry and response
```

No later layer compensates for a skipped earlier layer. Climate Advisor's discovery result is not a substitute for read-time Core authorization.

### SP-SEC-02 — Closed mapping and route safety

Capability resolution uses the exact allowlisted `(owningModule, kind, sourceType)` tuple and Core-issued capability IDs. Route and adapter selection never uses arbitrary labels, source IDs, source types supplied by the model, or consumer-provided route strings. Unknown or not-ready combinations are unavailable.

### SP-SEC-03 — Non-disclosure by construction

Discovery uses omission-only filtering with no reason-bearing placeholders or counts. Selected-read resolution failures use one stable generic error. Internal state values—unauthorized, missing, deleted, withdrawn, superseded, unavailable, unreadable, or unknown—are collapsed at the caller boundary.

Telemetry may distinguish coarse operational categories only where doing so cannot become an existence oracle. Raw state/reason data stays internal.

### SP-SEC-04 — Boundary redaction and forbidden-data filter

Result shaping is an explicit allowlist/redaction stage before response serialization and before telemetry emission. It excludes S3 credentials, bearer/service tokens, signed URLs, raw storage paths/access mechanisms, direct database data, raw storage objects, raw source payloads, unnecessary scope IDs, and upstream error text.

Unexpected sensitive upstream fields cause safe rejection or normalization. They are never delegated to Climate Advisor for filtering.

### SP-SEC-05 — Resource-exhaustion protection

Bounded input, lightweight discovery probes, selected-only capability loading/execution, finite output, finite timeout/retry, and existing runtime concurrency controls limit resource exhaustion. The caller/model cannot force unrestricted source enumeration, full reads for all candidates, parallelism, response size, or retry duration.

## Observability patterns

### OP-01 — Redact before emission

Every structured event is shaped through a safe telemetry projection before it reaches a logger, metric, trace, or external sink. Allowed values are correlation reference, safe caller reference, approved identity where permitted, coarse outcome, bounded duration, and dependency/timeout category.

Forbidden values include bearer/service credentials, tokens, raw request/response payloads, source content, raw scope identifiers, storage locations, signed URLs, and raw upstream error text.

### OP-02 — Coarse outcomes and safe correlation

Outcome categories support operational diagnosis—authorized, omitted, unavailable, validation, timeout, dependency, boundedness, or equivalent—without encoding whether a hidden source exists. Catalog/capability identity is included only when already safe and permitted for the operation.

### OP-03 — Operational evidence without new telemetry infrastructure

Reuse existing structured logging, metrics, tracing, dashboards, alerting, retention, and incident processes. Add issue-specific fields or views only where needed to verify latency, timeout, dependency, boundedness, safe-error, cleanup, or rollout behavior.

## Compatibility and rollout patterns

### CP-01 — Core-first enablement

The rollout sequence is:

1. deploy the Core contract and tests behind existing controls;
2. verify Core authorization, non-disclosure, bounds, safe errors, and module boundaries;
3. enable Climate Advisor consumption for the approved request/context path;
4. observe compatibility, latency, timeout, and failure evidence; and
5. use existing rollback controls to disable the new path if evidence is unsafe.

When feature/context prerequisites are absent, existing general chat, inventory, Stationary Energy, Concept Note, legacy datasource, auth, and token-refresh behavior remains unchanged.

### CP-02 — Explicit typed contract evolution

Keep capability IDs, input/output schemas, bounds, and safe errors explicit and stable within existing internal API conventions. Introduce a contract version only for an incompatible change. Any such change requires Core/consumer contract, security, and compatibility evidence.

The catalog contract does not replace workflow-specific contracts.

## Verification patterns

### VP-01 — Layered evidence

Use Core unit/contract/security tests for scope, discovery omission, lightweight readiness behavior, state transitions, allowlist, result shaping, safe errors, telemetry, timeout, and cleanup. Use deterministic module/client doubles for dependency behavior. Use cross-service tests to prove discovery performs no full reads/tool loading, Climate Advisor registers only selected tools, and Core executes only the selected capability.

### VP-02 — Example-based security matrix

Critical examples cover every scope dimension, authentication/user binding, active and all removed/unavailable states, stale/forged/malformed/unknown/mismatched selections, allowlist rejection, bounded/forbidden fields, source failure, timeout, cleanup, safe telemetry, and no raw storage/credential access.

### VP-03 — Partial property-based invariants

Apply domain generators, shrinking, and reproducible seeds to pure scope evaluation, exact allowlist resolution, safe projections, selection validation, serialization, bounds, and safe-error normalization. Property-based tests supplement, not replace, critical examples.

### VP-04 — Contract fixture ownership

Core owns the authoritative fixtures for discovery entries, capability definitions, state outcomes, safe errors, and bounded results. UOW-02 and UOW-03 consume those fixtures and verify compatibility; they do not copy Core authorization logic.

## Pattern-to-requirement traceability

| Pattern group | Approved NFRs | Functional design/business rules |
|---|---|---|
| Resilience | NFR-UOW01-04 through NFR-UOW01-09 | BR-17, BR-18, BR-21, BR-22, BR-23 |
| Scalability/performance | NFR-UOW01-01 through NFR-UOW01-06 | BR-03, BR-15, BR-19, BR-23 |
| Security/privacy | NFR-UOW01-10 through NFR-UOW01-14 | BR-01 through BR-20, BR-24 |
| Technology/boundaries | NFR-UOW01-15, NFR-UOW01-16 | BR-14, BR-20, BR-26, BR-29 |
| Maintainability/observability | NFR-UOW01-17, NFR-UOW01-18 | BR-24, BR-26, BR-29 |
| Compatibility/rollout | NFR-UOW01-19 through NFR-UOW01-21 | BR-18, BR-25, BR-26 |
| Verification | NFR-UOW01-22, NFR-UOW01-23 | BR-27 through BR-29 |

## Discovery readiness versus selected execution

The boundary must preserve this two-phase distinction in implementation and tests:

1. **Discovery phase**: Core evaluates each candidate using authorization, lifecycle, exact mapping metadata, and a lightweight non-content readiness probe. This probe may establish that the mapped module boundary is configured and that the source can be considered available/readable, but it does not load a Climate Advisor tool, initialize an executable capability for the request, invoke the capability operation, fetch source content, or perform a full read. Candidates that cannot pass the safe probe are omitted without disclosure.
2. **Selected-read phase**: Climate Advisor may request a tool only for a selection returned by authorized discovery. Core revalidates that one selection, then loads and executes only its exact bounded capability through the module boundary. The result is shaped/redacted before return. Unselected entries and capabilities are neither loaded nor executed.

This distinction is a security and resource boundary, not merely an optimization. A readiness-positive discovery result is not an authorization grant or permission to execute a source read, and a selected-read execution cannot rely on the discovery-time probe without current revalidation.

## Explicitly rejected patterns

- authorization or result caching that skips read-time checks;
- indefinite retries or stale-result serving;
- full capability loading or source reads for every catalog candidate during discovery;
- a new circuit breaker, queue, cache, worker pool, gateway, or shared state store;
- unbounded discovery/source fan-out;
- raw module/storage pass-through;
- Climate Advisor-owned authorization or storage access;
- distinct source-state errors or hidden-source placeholders;
- logging full requests/responses, source content, scope IDs, or credentials; and
- unconditional rollout or raw-storage fallback during partial deployment.
