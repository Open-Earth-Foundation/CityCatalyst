# Functional Design Plan — UOW-02 Climate Advisor Request-Time Integration

## Purpose and gate

This plan defines the technology-agnostic functional behavior for the Climate
Advisor consumer of the approved UOW-01 Core NativeInputCatalog capability
contract. It does not authorize Climate Advisor code, prompt, tool, or test
changes until the plan is answered, explicitly approved, and its Functional
Design artifacts are separately approved.

- **Issue**: [CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities](https://linear.app/openearth/issue/CC-737/connect-nativeinputcatalog-to-climate-advisor-capabilities)
- **Unit**: UOW-02 — Climate Advisor Request-Time Integration.
- **Assigned stories**: US-03, US-07, US-09.
- **Stage**: CONSTRUCTION — Functional Design.
- **Status**: All planning answers validated; explicit plan approval pending.
- **Prerequisite**: Approved UOW-01 Core contract, implementation, and verification evidence.
- **Application code**: Climate Advisor code remains unchanged until this plan and its Functional Design artifacts are approved.

## Approved inputs

- `aidlc-docs/inception/requirements/requirements.md`
- `aidlc-docs/inception/user-stories/stories.md`
- `aidlc-docs/inception/user-stories/personas.md`
- `aidlc-docs/inception/application-design/application-design.md`
- `aidlc-docs/inception/application-design/unit-of-work.md`
- `aidlc-docs/inception/application-design/unit-of-work-dependency.md`
- `aidlc-docs/inception/application-design/unit-of-work-story-map.md`
- `aidlc-docs/construction/uow-01-core-catalog-capability-boundary/verification-evidence.md`
- Existing `climate-advisor/AGENTS.md`, architecture documentation, client,
  tool, AgentService, streaming, authentication, and test patterns.

## Functional Design responsibilities

- Request-time discovery through `CityCatalystClient` after active request
  context and user/session resolution.
- Deterministic selection binding from safe Core discovery entries to Core
  capability IDs; no route or capability inference from model/catalog data.
- Selected-only request-scoped tool construction and execution through Core.
- Preservation of existing general chat, inventory, Stationary Energy,
  Concept Note, legacy datasource, vector, token-refresh, timeout, and cleanup
  behavior.
- Stable handling of Core's HTTP 404 `capability_unavailable` contract without
  exposing source state, scope, storage details, or upstream error text.
- No Climate Advisor authorization authority, catalog storage, S3 credentials,
  signed URLs, raw storage/database access, or unrestricted source payloads.
- Climate Advisor contract, security, compatibility, cleanup, and failure
  isolation evidence for UOW-03 to consume.

## Brown-field areas to analyze

The Functional Design must preserve and connect the existing boundaries in:

- `climate-advisor/service/app/services/citycatalyst_client.py`
- `climate-advisor/service/app/services/agent_service.py`
- `climate-advisor/service/app/utils/streaming_handler.py`
- `climate-advisor/service/app/routes/messages.py`
- `climate-advisor/service/app/tools/inventory_context_tools.py`
- `climate-advisor/service/app/tools/cc_inventory_wrappers.py`
- `climate-advisor/service/tests/test_citycatalyst_client.py`
- `climate-advisor/service/tests/test_agent_service.py`
- Existing auth, token refresh, workflow, and compatibility tests.

The design must identify the narrowest existing extension points and must not
replace workflow-specific tools or create a second storage/client boundary.

## Functional Design workplan

- [ ] Model the request lifecycle from active user/session context through Core
  discovery, selection, request-scoped tool creation, selected read, and agent
  execution.
- [ ] Define domain fields and trust levels for discovery entries, selections,
  Core capability IDs, request context, tool instances, bounded results, safe
  errors, token references, and cleanup state.
- [ ] Define the exact selection and capability-binding rules for stale,
  forged, malformed, unknown, unauthorized, unavailable, withdrawn,
  superseded, missing, and deleted selections.
- [ ] Define coexistence rules for the existing tool packs and new
  catalog-backed tools across general chat, Stationary Energy, Concept Note,
  and other active workflow modes.
- [ ] Define token propagation, one-time refresh, timeout, cancellation, and
  short-lived client/resource cleanup behavior.
- [ ] Define safe tool-result and error transformations, including forbidden
  storage/credential/source fields and safe telemetry.
- [ ] Define selected-only loading and execution invariants, including the
  prohibition on pre-registering all catalog capabilities or reading every
  discovered source.
- [ ] Define compatibility, failure-isolation, and rollback behavior when Core
  discovery/read is disabled, unavailable, or returns no eligible entries.
- [ ] Define Climate Advisor example-based, security, compatibility, cleanup,
  and applicable partial property-based verification evidence.

## Functional Design questions — answer every `[Answer]:` tag

### Question 1 — Active request context

Which context is authoritative when Climate Advisor requests Core discovery?

A) **Recommended:** Use the authenticated user/session and the already
resolved active request context (organization, project, city, and inventory
when present); never let the model invent or broaden context.

B) Let the model choose context from all discoverable catalog entries.

C) Reuse a previously persisted thread context even when the active request
context changed.

X) Other (describe after the tag).

[Answer]: A

### Question 2 — Discovery timing

When should Climate Advisor call Core discovery?

A) **Recommended:** Once per active request after identity/context resolution
and before request-scoped catalog-backed tool construction; do not discover or
read sources during global startup or for every possible workflow.

B) At service startup and cache all catalog capabilities globally.

C) Only after the model requests an arbitrary capability name.

X) Other (describe after the tag).

[Answer]: A

### Question 3 — Selection authority

How should Climate Advisor select an entry and capability?

A) **Recommended:** Select only from the current Core discovery response and
carry the exact `catalog_id` plus Core-issued `capability_id`; Core remains the
authority and revalidates the selection on read.

B) Derive a route/capability from source type, labels, or model output.

C) Accept any capability ID returned by a model or persisted conversation.

X) Other (describe after the tag).

[Answer]: A

### Question 4 — Tool registration scope

Which catalog-backed tools may be registered for an active request?

A) **Recommended:** Register only tools for the selected eligible entries and
Core-issued capabilities needed by that request; never register every
discovered or supported catalog capability.

B) Register all capabilities returned by the Core registry.

C) Register a generic raw-source tool and let the model choose its arguments.

X) Other (describe after the tag).

[Answer]: A

### Question 5 — Core contract transport

How should the Climate Advisor client call the new Core boundary?

A) **Recommended:** Add narrow typed client methods for Core discovery and one
selected read using existing service headers, bearer propagation, timeout, and
one-time refresh conventions; keep endpoint details inside the client.

B) Call Core with a generic HTTP helper from each tool.

C) Call source-specific storage or module endpoints directly from tools.

X) Other (describe after the tag).

[Answer]: A

### Question 6 — Capability input context

How should selected tool inputs relate to the active request context?

A) **Recommended:** Tool wrappers accept only the selected capability's typed
bounded fields, derive or bind required context from the active request, and
reject mismatched or missing context before calling Core.

B) Allow the model to supply arbitrary scope IDs on every tool call.

C) Omit context and trust the catalog selection alone.

X) Other (describe after the tag).

[Answer]: A

### Question 7 — Stable unavailable errors

How should Climate Advisor expose Core selection-resolution failures?

A) **Recommended:** Preserve HTTP 404 `capability_unavailable` and the generic
message at the tool boundary, map it to the existing safe tool-error shape,
and omit source existence/state, scope, IDs, storage details, and upstream
text.

B) Explain whether the source was unauthorized, deleted, or unavailable.

C) Retry indefinitely or fall back to raw storage.

X) Other (describe after the tag).

[Answer]: A

### Question 8 — Token refresh and client lifetime

How should catalog-backed tools use tokens and HTTP clients?

A) **Recommended:** Reuse the existing user-scoped bearer/token-reference and
one-time refresh flow; use short-lived request/tool clients and close them on
success, failure, cancellation, and refresh errors.

B) Store a durable service credential or S3 credential on each tool.

C) Disable refresh and expose upstream authentication errors to the model.

X) Other (describe after the tag).

[Answer]: A

### Question 9 — Existing workflow coexistence

How should catalog-backed tools coexist with current Climate Advisor tools?

A) **Recommended:** Add the new request-time pack only where the active mode
allows it; preserve existing general chat, inventory, Stationary Energy,
Concept Note, legacy datasource, and vector tool rules unchanged.

B) Replace all existing inventory and workflow-specific tools.

C) Make catalog-backed tools globally available in every mode.

X) Other (describe after the tag).

[Answer]: A

### Question 10 — Empty/disabled Core behavior

What should happen when discovery is disabled, unavailable, or returns no
eligible entries?

A) **Recommended:** Keep existing workflows available under their current
rules, register no catalog-backed tools, and return a safe bounded result to
the orchestration layer without source-state disclosure.

B) Block all Climate Advisor chat until catalog discovery succeeds.

C) Fall back to raw storage or legacy unrestricted source reads.

X) Other (describe after the tag).

[Answer]: A

### Question 11 — Failure isolation and concurrency

How should one catalog-backed capability failure affect other tools?

A) **Recommended:** Isolate the failed selected tool, close its resources, and
preserve unrelated authorized tool behavior; do not execute multiple selected
reads concurrently unless the existing orchestration contract requires it and
the bounds remain explicit.

B) Retry or execute every discovered capability together.

C) Disable all tools after one source failure.

X) Other (describe after the tag).

[Answer]: A

### Question 12 — Climate Advisor evidence

What evidence is mandatory before UOW-02 completion?

A) **Recommended:** Client contract tests, selected-only tool-registration and
execution tests, stable error/non-disclosure tests, token refresh/timeout/
cleanup tests, compatibility tests for existing workflows, and applicable
reproducible partial property-based invariants.

B) Only a successful selected-read test.

C) Defer all consumer security and compatibility evidence to UOW-03.

X) Other (describe after the tag).

[Answer]: A

## Mandatory Functional Design artifacts

After all answers and any follow-up answers are validated, generate:

- `aidlc-docs/construction/uow-02-climate-advisor-request-time-integration/functional-design/business-logic-model.md`
- `aidlc-docs/construction/uow-02-climate-advisor-request-time-integration/functional-design/business-rules.md`
- `aidlc-docs/construction/uow-02-climate-advisor-request-time-integration/functional-design/domain-entities.md`

The artifacts must trace to CC-737, US-03, US-07, US-09, the approved Core
contract, and all applicable FR/NFR constraints. They must preserve Core as
the sole authorization authority and the no-storage-credentials/raw-access
boundary.

## Answer validation result

- All 12 planning questions have non-empty `[Answer]:` tags.
- Every answer selects the recommended option and is consistent with the
  approved UOW-01 Core contract and the existing Climate Advisor architecture.
- The answers establish authenticated active-request context, request-time
  discovery, current Core-issued selection binding, selected-only tool
  registration, typed bounded inputs, Core-owned authorization/revalidation,
  stable non-disclosing errors, existing token refresh/cleanup, workflow
  compatibility, isolated failure behavior, and consumer contract/security
  evidence.
- No contradiction or unresolved ambiguity requires a follow-up question.
- **Gate**: UOW-02 Functional Design plan approval is required before the
  Functional Design artifacts are generated.

## Approval gate

Complete every `[Answer]:` tag, resolve follow-up questions, and explicitly
approve this plan before Functional Design artifacts are generated. After the
artifacts are generated and validated, a separate explicit approval is
required before UOW-02 NFR Requirements or application-code changes.
