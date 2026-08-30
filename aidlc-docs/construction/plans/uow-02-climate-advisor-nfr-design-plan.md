# NFR Design Plan — UOW-02 Climate Advisor Request-Time Integration

## Purpose and gate

This plan defines how the approved UOW-02 NFR Requirements become logical
design patterns and components for Climate Advisor's side of Linear CC-737.
It remains technology-aware only where the approved existing stack requires it;
concrete implementation details remain for Code Generation.

- **Issue**: [CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities](https://linear.app/openearth/issue/CC-737/connect-nativeinputcatalog-to-climate-advisor-capabilities)
- **Unit**: UOW-02 — Climate Advisor Request-Time Integration.
- **Stage**: CONSTRUCTION — NFR Design.
- **Assigned stories**: US-03, US-07, US-09.
- **Status**: NFR Design artifacts generated and validated; explicit artifact approval pending.
- **Prerequisite**: UOW-02 Functional Design and NFR Requirements artifacts
  approved 2026-08-29; approved UOW-01 Core contract and evidence.
- **Application code**: Climate Advisor code remains unchanged until this plan
  and its NFR Design artifacts are approved.

## Fixed design constraints

- Core remains the authority for identity, all applicable scope dimensions,
  catalog lifecycle, exact capability mapping, source readiness,
  authorization, and final bounded result shaping.
- Climate Advisor uses the existing client/request/agent/tool boundaries and
  cannot authorize, access storage, infer routes, or treat discovery as a grant.
- Discovery is request-time, at most once per active request, and only performs
  lightweight non-content readiness evaluation. It does not load Climate
  Advisor capabilities or execute full reads for all inputs.
- Only the selected current discovery entry and Core-issued capability may be
  loaded and executed. No global registration, speculative fan-out, arbitrary
  route derivation, or raw-source tool is allowed.
- Stale, forged, malformed, unknown, mismatched, unauthorized, withdrawn,
  superseded, missing, deleted, and unavailable selections remain non-disclosing
  and preserve the approved `404 capability_unavailable` safe contract.
- Inputs/results are typed, finite, field-allowlisted, and bounded. No S3
  credentials, bearer/service secrets, signed URLs, raw storage/database
  access, storage paths as access mechanisms, or unrestricted source payloads
  cross into Climate Advisor.
- Existing workflows, feature flags, service authentication, token refresh,
  timeouts, cancellation, cleanup, deployment, rollback, observability, and
  test patterns remain in force.
- No new service, queue, cache, circuit breaker, worker pool, topology,
  persistence entity, shared runtime, or unrelated refactoring is proposed.

## NFR Design workplan

### 1. Resilience patterns

- [x] Design finite timeout, refresh, cancellation, and cleanup behavior for
  discovery, selected reads, and tool execution.
- [x] Design fail-closed error mapping and failure isolation without stale
  authorization, raw-storage fallback, or capability widening.
- [x] Design feature-disable, health/degradation, rollback, and operational
  handoff using existing mechanisms.

### 2. Scalability and performance patterns

- [x] Place request, discovery, tool-surface, input/output, and resource bounds
  at the correct Climate Advisor/Core boundaries.
- [x] Keep readiness probing separate from selected bounded execution and
  prevent unbounded fan-out or global capability loading.
- [x] Define baseline/regression measurement points without a new hard target.

### 3. Security and privacy patterns

- [x] Map defense in depth across active context, Core client, selection binding,
  selected-only factory, typed tool, error mapper, and telemetry.
- [x] Design protections for confused deputy, IDOR/cross-scope selection,
  existence oracles, route injection, global tool exposure, secret leakage,
  raw storage access, and resource exhaustion.
- [x] Define redaction-before-serialization/logging hooks and safe telemetry.

### 4. Logical components and integration

- [x] Define logical responsibilities for active request context, Core client,
  discovery validator, selection binder, selected-only tool factory, bounded
  result/error mapper, token/resource lifecycle, and telemetry.
- [x] Confirm reused existing components and the narrowest necessary new seams
  without adding deployable infrastructure.
- [x] Define Core-to-Climate Advisor contracts and deterministic test doubles.

### 5. Compatibility and rollout

- [x] Design Core-first feature-gated rollout and rollback while preserving all
  existing Climate Advisor workflow/tool-pack rules.
- [x] Define safe behavior when context, discovery, feature flags, or Core are
  unavailable.
- [x] Define compatible contract evolution without replacing existing flows.

### 6. Verification and operations

- [x] Map patterns to client, registration, execution, error, security,
  compatibility, cleanup, timeout, and failure-isolation tests.
- [x] Define partial property-based invariants, deterministic generators,
  shrinking, and reproducible seeds for pure consumer logic.
- [x] Define safe dashboards/alerts/release evidence with no secret/raw-content
  leakage.

### 7. NFR Design validation

- [x] Validate the design against approved NFR Requirements, Functional Design,
  UOW-01 contract/evidence, requirements, stories, Application Design, Units
  Generation, and Linear acceptance criteria.
- [x] Identify and resolve pattern/component ambiguity with follow-up questions
  before artifact generation.
- [x] Generate `nfr-design-patterns.md` and `logical-components.md` only after
  this plan is answered and explicitly approved.

## NFR Design questions — complete every `[Answer]:` tag

Answer each question directly after its `[Answer]:` tag. Select one option and
state any constraint or rationale required. These questions define design
patterns and logical responsibilities; they do not authorize application-code
changes.

### Question 1 — Timeout, retry, cancellation, and cleanup

How should dependency and resource lifecycle behavior be designed?

A) **Recommended:** Reuse existing finite client/workflow timeout and one-time
refresh conventions; cancel and close resources on every terminal path; keep
selection failures fail-closed; and never retry into broader authorization or
raw storage.

B) Add indefinite retries and retain clients for the conversation lifetime.

C) Use a direct-storage fallback when Core is slow or unavailable.

X) Other (describe after the tag).

[Answer]: A

### Question 2 — Discovery readiness separation

How should the design prevent discovery from becoming a full-read path?

A) **Recommended:** Keep request-time discovery and Core's lightweight,
non-content readiness semantics separate from selected-read execution; discovery
must not load Climate Advisor capabilities, execute full reads, or retrieve all
candidate contents.

B) Preload every discovered capability to reduce later latency.

C) Execute one full read for every candidate during discovery.

X) Other (describe after the tag).

[Answer]: A

### Question 3 — Selected-only loading and concurrency

How should the design bound tools and source execution?

A) **Recommended:** Bind current discovery entries to opaque Core-issued
capabilities, register only the selected tool, execute only that selected
bounded read, and rely on existing runtime controls without speculative or
unbounded fan-out.

B) Register all eligible tools and allow the model to choose parallelism.

C) Execute all eligible capabilities concurrently for faster responses.

X) Other (describe after the tag).

[Answer]: A

### Question 4 — Performance optimization

What optimization pattern should be applied to the hot path?

A) **Recommended:** Measure discovery/readiness, selection/tool construction,
and selected execution separately; remove unnecessary work within existing
boundaries; and do not cache authorization or source results in a way that
bypasses Core revalidation.

B) Add a new authorization/result cache as the primary optimization.

C) Optimize by moving authorization and source reads into Climate Advisor.

X) Other (describe after the tag).

[Answer]: A

### Question 5 — Security control placement

How should controls be layered across the logical components?

A) **Recommended:** Core authenticates/authorizes, checks lifecycle/readiness/
allowlist, bounds/redacts results, and emits safe outcomes; modules retain
source ownership; Climate Advisor validates active context, current selection,
selected-only registration, typed consumption, safe errors, and cleanup without
duplicating Core authority.

B) Authorize during discovery and trust the selection at read time.

C) Make Climate Advisor the primary authorization layer.

X) Other (describe after the tag).

[Answer]: A

### Question 6 — Non-disclosure design

How should logical components prevent source-existence disclosure?

A) **Recommended:** Use Core omission-only discovery, current-response
selection binding, one stable selection error, redaction before serialization
and telemetry, and coarse failure categories that cannot distinguish hidden,
deleted, or unavailable sources.

B) Return distinct errors so the model can explain source state.

C) Return hidden-source placeholders for troubleshooting.

X) Other (describe after the tag).

[Answer]: A

### Question 7 — Logical component decomposition

Which component decomposition should guide NFR Design?

A) **Recommended:** Reuse/define logical responsibilities for active request
context, typed Core client, discovery validator, selection binder, selected-only
tool factory, bounded result/error mapper, token/resource lifecycle, and safe
telemetry, all inside existing deployable services.

B) Create a shared gateway that owns authorization and storage access.

C) Put catalog filtering and source reads entirely in Climate Advisor.

X) Other (describe after the tag).

[Answer]: A

### Question 8 — Caching and consistency

What caching/consistency pattern is acceptable?

A) **Recommended:** Do not introduce a new authorization or source-result
cache; if existing transport caching exists, it cannot bypass per-read Core
authorization/state/readiness checks or serve stale content/selection state.

B) Cache discovery authorization for the request and skip Core revalidation.

C) Cache raw source objects in Climate Advisor for resilience.

X) Other (describe after the tag).

[Answer]: A

### Question 9 — Observability and redaction

How should observability be designed?

A) **Recommended:** Reuse existing structured logs/metrics/traces with safe
correlation/caller references, permitted IDs, coarse outcomes, bounded
duration, and dependency/timeout categories; redact before emission and never
record tokens, credentials, raw content, storage details, or unnecessary scope.

B) Capture full requests/responses and raw source identifiers.

C) Disable telemetry for denied/unavailable operations.

X) Other (describe after the tag).

[Answer]: A

### Question 10 — Workflow compatibility and rollout

How should NFR patterns integrate with existing workflows and rollback?

A) **Recommended:** Add the catalog path only through existing feature/auth
boundaries and active-mode rules; verify Core first; preserve general,
inventory, Stationary Energy, Concept Note, legacy, and vector behavior; and
disable only the additive path on rollback.

B) Make catalog tools unconditional across all modes.

C) Replace existing workflow packs and use raw storage during rollback.

X) Other (describe after the tag).

[Answer]: A

### Question 11 — Contract evolution

How should design handle contract changes?

A) **Recommended:** Keep explicit typed discovery/selection/input/output/error
contracts and opaque Core IDs stable within existing internal conventions;
introduce a version only for an incompatible change and require synchronized
consumer/Core contract and security regression evidence.

B) Use untyped pass-through payloads to avoid compatibility decisions.

C) Replace existing workflow-specific contracts with a generic catalog payload.

X) Other (describe after the tag).

[Answer]: A

### Question 12 — Verification architecture

How should the design map to verification?

A) **Recommended:** Use Climate Advisor client/selection/tool/error/cleanup
tests with deterministic Core doubles; verify readiness versus selected
execution, selected-only registration, compatibility, security, safe
telemetry, and partial property-based pure invariants with reproducible seeds.

B) Rely on one end-to-end happy-path suite.

C) Defer consumer security and compatibility evidence to production.

X) Other (describe after the tag).

[Answer]: A

## Frontend and infrastructure applicability

- Frontend NFR Design is not applicable; CC-737 authorizes no UI change.
- No new queue, cache, circuit breaker, worker pool, service, storage,
  persistence layer, shared runtime, region, or deployment topology is
  proposed. Existing logical/runtime components and operations remain the
  baseline.

## Generated NFR Design artifacts

The following artifacts were generated from the approved plan and validated
against the approved UOW-02 NFR Requirements, Functional Design, UOW-01 Core
contract, and existing Climate Advisor architecture:

- `uow-02-climate-advisor-request-time-integration/nfr-design/nfr-design-patterns.md`
- `uow-02-climate-advisor-request-time-integration/nfr-design/logical-components.md`

The artifacts explicitly separate lightweight discovery readiness from selected
bounded execution and preserve Core authorization, non-disclosure, bounded
reads, and storage isolation. They do not authorize Code Generation until
separately approved.

## Answer validation result

- All 12 planning questions have non-empty `[Answer]:` tags.
- Every answer selects the recommended behavior and is consistent with the
  approved UOW-02 NFR Requirements, Functional Design, and UOW-01 Core
  contract.
- The answers preserve finite timeout/cleanup behavior, lightweight discovery
  readiness without full reads or Climate Advisor capability loading,
  selected-only execution, Core defense-in-depth, non-disclosure, no stale
  authorization cache, safe observability, existing workflow compatibility,
  and no new infrastructure.
- No contradiction or unresolved ambiguity requires a follow-up question.
- **Gate**: Explicit UOW-02 NFR Design plan approval is required before NFR
  Design artifacts are generated.

## Completion and approval gate

After all answers are supplied, they will be reviewed for ambiguity,
contradictions, and consistency with the approved UOW-02 NFR Requirements,
Functional Design, and UOW-01 Core contract. Any unresolved decision will
receive a follow-up question with a new `[Answer]:` tag. NFR Design artifacts
will be generated only after this plan is answered and explicitly approved.
