# NFR Requirements Plan — UOW-02 Climate Advisor Request-Time Integration

## Purpose and gate

This plan defines the non-functional requirements assessment for Climate
Advisor's consumer side of Linear CC-737 after approval of the UOW-02
Functional Design artifacts. It covers request-time discovery, selected-only
tool loading, Core-mediated bounded reads, safe error/telemetry handling,
resource lifecycle, and compatibility with existing Climate Advisor workflows.

- **Issue**: [CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities](https://linear.app/openearth/issue/CC-737/connect-nativeinputcatalog-to-climate-advisor-capabilities)
- **Unit**: UOW-02 — Climate Advisor Request-Time Integration.
- **Stage**: CONSTRUCTION — NFR Requirements.
- **Assigned stories**: US-03, US-07, US-09.
- **Status**: Planning opened; answers and explicit plan approval pending.
- **Prerequisite**: UOW-02 Functional Design plan and artifacts approved
  2026-08-29; UOW-01 Core contract and evidence approved with its documented
  GHGI/PostgreSQL validation limitation.
- **Application code**: Climate Advisor code remains unchanged until this
  plan and its NFR Requirements artifacts are approved.

## Fixed constraints carried forward

These are approved functional and architectural constraints, not optional NFR
choices:

- Core remains the sole authority for authenticated identity, every applicable
  user/organization/project/city/inventory scope relationship, catalog state,
  allowlist mapping, source readiness, authorization, and bounded result
  shaping.
- Climate Advisor calls Core through the existing typed client/service boundary
  and never becomes a catalog owner, authorization authority, source owner, or
  storage client.
- Discovery is request-time and at most once per active request after identity
  and context resolution. It performs only lightweight non-content readiness
  evaluation; it does not load Climate Advisor capabilities or execute full
  reads for every candidate.
- Only the selected current discovery entry and its Core-issued capability may
  be loaded and executed. No global pre-registration, arbitrary route
  derivation, speculative fan-out, or generic raw-source tool is allowed.
- Every selected read remains subject to Core revalidation. The consumer cannot
  rely on discovery as a durable authorization grant.
- Discovery and selected-read results/errors disclose no unauthorized,
  unavailable, withdrawn, superseded, missing, deleted, stale, forged, or
  invalid source metadata or content.
- The approved selection-resolution contract remains HTTP `404`, code
  `capability_unavailable`, message `Requested capability is unavailable.`
  Climate Advisor must preserve it without upstream error/body disclosure.
- Results and tool inputs are typed, finite, field-allowlisted, and bounded.
  Climate Advisor receives no S3 credentials, bearer/service credentials,
  signed URLs, raw storage access, direct database access, storage paths as
  access mechanisms, or unrestricted source payloads.
- Existing general chat, inventory, Stationary Energy, Concept Note, legacy
  datasource, vector, feature-flag, service-auth, token-refresh, timeout,
  cancellation, cleanup, CI/CD, deployment, rollback, and operations patterns
  remain in force.
- No new storage owner, catalog database, persistence entity, deployment
  topology, transport, shared runtime, or unrelated refactoring is introduced.

## NFR assessment workplan

### 1. Scalability and capacity

- [ ] Establish workload and growth assumptions for request-time discovery,
  selected tool construction, and selected reads using existing Climate Advisor
  and Core usage evidence.
- [ ] Define bounded discovery/selection/read work, in-flight resources, and
  agent tool-surface limits without global catalog loading or unbounded fan-out.
- [ ] Define capacity measurement and regression signals using existing service
  and operations practices.

### 2. Performance and resource behavior

- [ ] Establish measurable baseline/regression expectations for discovery,
  selected tool construction, and selected reads relative to existing client
  and workflow defaults.
- [ ] Define timeout, response-size, finite-result, cancellation, refresh, and
  client/resource cleanup behavior.
- [ ] Explicitly distinguish discovery readiness cost from selected read cost;
  discovery must not be a full-read performance path.

### 3. Availability and reliability

- [ ] Confirm inherited platform availability, RTO/RPO, disaster-recovery,
  deployment, rollback, and incident objectives.
- [ ] Define fail-closed behavior for Core discovery/read, token, validation,
  permission, module, timeout, and malformed-response failures.
- [ ] Define failure isolation so one selected capability does not widen or
  disable unrelated existing authorized tools.

### 4. Security, privacy, and non-disclosure

- [ ] Cover threat scenarios for confused deputy, IDOR/cross-scope selection,
  stale/forged/malformed selection, route/capability injection, tool-surface
  overexposure, existence oracles, resource exhaustion, and secret leakage.
- [ ] Define consumer-side NFRs for typed input, selected-only registration,
  Core revalidation, safe error mapping, redaction, and telemetry.
- [ ] Confirm existing privacy, retention, and credential-handling policies;
  do not expand data collection or persist selection secrets.

### 5. Technology and integration constraints

- [ ] Confirm reuse of the existing Climate Advisor Python/FastAPI/httpx,
  Pydantic/schema, Agents SDK/tool factory, streaming, token, and test
  patterns, plus the existing Core internal HTTP contract.
- [ ] Define enforcement placement between client, request coordinator, tool
  wrapper, Core, and module boundaries without duplicating Core authority.
- [ ] Identify technology decisions that are genuinely required versus details
  deferred to NFR Design or Code Generation.

### 6. Maintainability, observability, and testability

- [ ] Define explicit contract, fixture, schema, bound, lifecycle, and
  ownership documentation expectations for the consumer boundary.
- [ ] Define safe low-cardinality logs/metrics/traces for discovery, selected
  registration, reads, errors, refresh, timeout, cleanup, and failure
  isolation.
- [ ] Define example-based, contract, security, compatibility, lifecycle,
  resiliency, and partial property-based evidence requirements.

### 7. Compatibility and rollout

- [ ] Confirm feature-gated/Core-first rollout and existing rollback behavior.
- [ ] Define regression evidence for general chat, inventory, Stationary
  Energy, Concept Note, legacy datasource, vector, authentication, token
  refresh, timeout, cancellation, and cleanup paths.
- [ ] Confirm no public API/UI contract, prompt contract, storage boundary, or
  unrelated workflow change is required.

### 8. NFR validation and traceability

- [ ] Validate answers against the approved UOW-02 Functional Design artifacts,
  UOW-01 Core contract, FR-01 through FR-11, NFR-01 through NFR-08, US-03,
  US-07, US-09, Application Design, Units Generation, and Linear acceptance
  criteria.
- [ ] Record and resolve any NFR ambiguity with follow-up questions before
  artifact generation.
- [ ] Generate NFR Requirements and Technology Stack Decisions artifacts only
  after this plan is answered and explicitly approved.

## NFR Requirements questions — complete every `[Answer]:` tag

Answer each question directly after its `[Answer]:` tag. Select one option and
state any constraint or rationale needed. These questions define measurable
non-functional behavior and technology constraints; they do not authorize
application-code changes.

### Question 1 — Request workload baseline

What workload baseline should UOW-02 use for request-time discovery and
selected reads?

A) **Recommended:** Inherit current Climate Advisor/Core internal workload
baselines; measure request rate, concurrency, burst, active-context mix,
discovery-entry counts, selected-read distribution, and existing tool latency
before setting thresholds. Add no new hard capacity target unless evidence
requires it.

B) Introduce a fixed CC-737-specific request-rate and concurrency target.

C) Treat request-time work as unbounded and rely only on autoscaling.

X) Other (describe after the tag).

[Answer]:

### Question 2 — Discovery cost and frequency

What NFR limit should govern catalog discovery?

A) **Recommended:** Run discovery once per eligible active request after context
resolution, keep it bounded by existing client/response conventions, perform
only lightweight non-content readiness, and prohibit capability loading or full
reads for all candidates.

B) Cache all catalog capabilities globally at service startup.

C) Rediscover and fully read every candidate whenever the agent is created.

X) Other (describe after the tag).

[Answer]:

### Question 3 — Selected-read and tool-surface bounds

How should NFRs limit selected capability work and registered tools?

A) **Recommended:** Register only the selected current Core-issued capability
needed by the active request; execute only its bounded read on invocation; use
finite input/output/tool limits and no speculative or unbounded fan-out.

B) Register every eligible capability returned by discovery for convenience.

C) Allow the model to select arbitrary capabilities and result sizes.

X) Other (describe after the tag).

[Answer]:

### Question 4 — Latency and timeout expectations

What performance requirement should apply to discovery and selected reads?

A) **Recommended:** Preserve existing client/workflow timeout conventions,
measure separate discovery/read baselines and regression budgets, and do not
introduce a release-blocking percentile target without platform evidence.

B) Set one strict end-to-end percentile target for all source types.

C) Do not measure latency because authorization correctness is sufficient.

X) Other (describe after the tag).

[Answer]:

### Question 5 — Response and resource bounds

How should response size, input size, and client resources be bounded?

A) **Recommended:** Reuse Core-declared typed finite bounds and existing
Climate Advisor request/response limits; reject or safely normalize over-limit
data before model exposure, and close clients/responses/streams on every
terminal path.

B) Let each tool choose its own unbounded payload and lifetime.

C) Load full source responses and trim them only in the prompt.

X) Other (describe after the tag).

[Answer]:

### Question 6 — Availability and continuity objectives

What availability and continuity objectives should UOW-02 adopt?

A) **Recommended:** Inherit existing CityCatalyst/Climate Advisor availability,
RTO/RPO, disaster-recovery, incident, deployment, and rollback objectives; add
no independent topology or DR target.

B) Define a new independent uptime and multi-region target for catalog tools.

C) Treat the integration as best effort with no operational objective.

X) Other (describe after the tag).

[Answer]:

### Question 7 — Dependency failure and graceful degradation

What reliability behavior should apply when Core, token, or source dependencies
fail?

A) **Recommended:** Fail closed for catalog discovery/selected reads, use
existing bounded timeouts and one-time refresh, preserve unrelated existing
tools under their current rules, return the stable safe selection error where
applicable, and never fall back to raw storage or cached authorization.

B) Retry indefinitely until Core or the source recovers.

C) Use cached catalog authorization or direct source/storage access.

X) Other (describe after the tag).

[Answer]:

### Question 8 — Security threat priority

Which threats must be release-blocking NFR concerns?

A) **Recommended:** Confused deputy/IDOR across all populated scope dimensions,
existence oracles, stale/forged/malformed selection, route/capability
injection, global tool overexposure, unbounded fan-out, credentials/storage
exposure, unsafe logs, and upstream error disclosure.

B) Focus on service authentication and defer scope/selection threats.

C) Treat these as post-release hardening.

X) Other (describe after the tag).

[Answer]:

### Question 9 — Privacy, retention, and telemetry

What privacy policy should apply to consumer discovery/read telemetry?

A) **Recommended:** Use existing privacy/retention policy and record only safe
correlation/caller references, approved IDs where permitted, coarse outcomes,
bounded durations, and dependency/timeout categories; never record tokens,
credentials, raw content, storage details, signed URLs, raw scope data, or
upstream bodies.

B) Retain full requests/responses and source identifiers for troubleshooting.

C) Disable all telemetry for denied or unavailable operations.

X) Other (describe after the tag).

[Answer]:

### Question 10 — Technology reuse

Which technology constraint should govern implementation choices?

A) **Recommended:** Reuse the existing Climate Advisor Python/FastAPI/httpx,
Pydantic/schema, Agents SDK/tool, streaming, token, and pytest patterns and
the existing Core internal HTTP contract; introduce no new framework, runtime,
transport, service, or storage layer.

B) Introduce a shared cross-language capability framework for this issue.

C) Move authorization and source reads into Climate Advisor.

X) Other (describe after the tag).

[Answer]:

### Question 11 — Enforcement placement

Where should NFR controls be enforced?

A) **Recommended:** Core enforces identity, scope, lifecycle, allowlist,
readiness, bounds, redaction, and safe errors; module boundaries own source
access; Climate Advisor enforces request-time discovery, selected-only loading,
typed consumer validation, safe mapping, and lifecycle without duplicating Core
authorization.

B) Enforce all controls in Climate Advisor after Core returns data.

C) Let Core pass through data and rely on each tool to enforce security.

X) Other (describe after the tag).

[Answer]:

### Question 12 — Contract/version compatibility

What compatibility policy should govern the consumer contract?

A) **Recommended:** Use explicit typed contracts within existing internal API
conventions, keep Core-issued IDs opaque, preserve the stable selection error,
and require synchronized Core/Climate Advisor contract and regression evidence
before enabling the feature.

B) Prefer an untyped flexible payload and client-side inference.

C) Replace existing workflow-specific contracts with the catalog contract.

X) Other (describe after the tag).

[Answer]:

### Question 13 — Rollout and rollback

How should the NFR rollout strategy handle partial deployment or rollback?

A) **Recommended:** Use existing feature flags and Core-first sequencing; keep
Climate Advisor catalog consumption disabled until the Core contract is
verified, preserve existing behavior when context/discovery is absent, and
disable only the additive path during rollback.

B) Deploy both services simultaneously and make catalog tools unconditional.

C) Fall back to raw storage when Core is not ready.

X) Other (describe after the tag).

[Answer]:

### Question 14 — Verification and release gates

What NFR evidence should be release-blocking for UOW-02?

A) **Recommended:** Client contract tests; discovery-readiness separation;
selected-only registration/execution; Core revalidation consumption; stable
error/non-disclosure; bounded inputs/outputs; token refresh/timeouts/
cancellation/cleanup; failure isolation; existing workflow compatibility; safe
telemetry; and reproducible partial property-based invariants, all passing in
existing CI gates.

B) A successful selected-read test and manual review are sufficient.

C) Defer negative/security/compatibility evidence to UOW-03 or production.

X) Other (describe after the tag).

[Answer]:

## Frontend and topology applicability

- Frontend usability/accessibility design is not applicable; CC-737 does not
  authorize a UI change.
- No new service, storage, database, deployment topology, region, queue, cache,
  worker, or shared runtime is proposed. Availability, recovery, scaling, and
  incident behavior inherit existing platform practices.

## Completion and approval gate

After all answers are supplied, they will be checked for completeness,
ambiguity, consistency with the approved UOW-02 Functional Design and UOW-01
Core contract, and preservation of the fixed security/storage constraints. Any
unresolved decision will receive a follow-up question with a new `[Answer]:`
tag. NFR Requirements artifacts will be generated only after this plan is
answered and explicitly approved.
