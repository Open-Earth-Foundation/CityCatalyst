# Code Generation Plan — UOW-02 Climate Advisor Request-Time Integration

## Plan purpose and approval gate

This is the AI-DLC Code Generation Part 1 plan for UOW-02 of Linear CC-737.
It translates the approved UOW-02 Functional Design, NFR Requirements, and
NFR Design into independently reviewable brown-field Climate Advisor units.
It does not authorize tests or application-code changes until this plan is
answered and explicitly approved.

- **Issue**: [CC-737 — Connect NativeInputCatalog to Climate Advisor capabilities](https://linear.app/openearth/issue/CC-737/connect-nativeinputcatalog-to-climate-advisor-capabilities)
- **Project**: CityCatalyst brown-field monorepo.
- **Branch**: `cc-737-connect-nativeinputcatalog-to-climate-advisor-capabilities`.
- **Unit**: UOW-02 — Climate Advisor Request-Time Integration.
- **Stage**: CONSTRUCTION — Code Generation planning.
- **Status**: Plan approved; Units 1–3 completion approved; Unit 4 atomic commit created; Unit 4 completion approval pending.
- **Prerequisite**: UOW-02 Functional Design and NFR Design artifacts approved
  2026-08-29; UOW-01 Core implementation/contract/evidence approved with its
  documented GHGI/PostgreSQL validation limitation.
- **Application code at plan approval**: Unchanged. The approved Unit 1
  implementation is now limited to the files listed for that unit.
- **Owner**: Climate Advisor maintainers; UOW-01 Core remains the authority.

## Approved inputs and non-negotiable constraints

The implementation must conform to:

- approved inception requirements, stories, application design, and unit map;
- approved UOW-01 Core Functional Design, NFR Requirements, NFR Design, and
  implementation/verification evidence;
- approved UOW-02 Functional Design, NFR Requirements, and NFR Design artifacts;
- existing `climate-advisor/AGENTS.md`, service architecture, client,
  streaming, token, workflow, tool, and test patterns; and
- the existing Core internal discovery/read contract.

The generated implementation must preserve all of the following:

1. Request-time discovery occurs only after authenticated identity and active
   request context resolution and no more than once for the request.
2. Discovery uses Core's lightweight, non-content readiness behavior only. It
   must not load Climate Advisor capabilities, execute full reads for every
   candidate, retrieve source content, or perform candidate-wide tool calls.
3. Only the selected current discovery entry and its opaque Core-issued
   capability ID may become a request-scoped tool. Unselected entries remain
   unloaded and unread.
4. Every read passes through the existing typed `CityCatalystClient` boundary
   and Core revalidates caller, every applicable scope, catalog state, exact
   capability mapping, source readiness, and result bounds.
5. Climate Advisor cannot authorize, derive routes, access catalog/source
   storage, or use raw storage/S3 credentials, signed URLs, direct database
   access, or unrestricted source payloads.
6. Stale, forged, malformed, unknown, mismatched, unauthorized, withdrawn,
   superseded, missing, deleted, and unavailable selections preserve HTTP 404,
   code `capability_unavailable`, message `Requested capability is
   unavailable.` without source-state or upstream-error disclosure.
7. Existing general chat, inventory, Stationary Energy, Concept Note, legacy
   datasource, vector, feature/auth, token-refresh, timeout, cancellation,
   cleanup, and persistence behavior remains compatible.
8. No new service, storage owner, catalog database, authorization path,
   shared runtime, transport, topology, migration, prompt redesign, or
   unrelated refactoring is part of UOW-02.

## Brown-field implementation decisions

| Concern | Existing pattern reused | Planned consumer location |
|---|---|---|
| Active request lifecycle | Existing message route, `StreamingHandler`, workflow context, and `AgentService` construction | Narrow request-time orchestration seam before agent creation |
| Core transport | `CityCatalystClient`, internal headers, bearer propagation, timeout, one-time refresh, close | Existing client with typed discovery/read methods |
| Contract validation | Existing Pydantic/schema and client error patterns | New narrow consumer models/helpers near client/tool boundary |
| Tool composition | `AgentService.create_agent` and existing builder functions | Selected-only catalog tool factory plus additive composer integration |
| Token sharing | Existing mutable token reference and `TokenHandler` persistence | Reuse, no new credential store |
| Workflow coexistence | Existing mode checks and tool-pack builders | Preserve conditions; catalog pack is additive and mode-aware |
| Testing | Existing pytest/asyncio tests and deterministic client/tool doubles | New focused client/selection/tool tests plus compatibility extensions |

The narrowest new consumer seams are expected to be a typed discovery/read
client contract, a request-scoped selection binder/factory, and selected-only
tool wrappers. Exact module/file names may be finalized in the approved unit
implementation steps, but no seam may become a second authorization boundary.

## Planned files and ownership

### Existing production files to modify only as required

- `climate-advisor/service/app/services/citycatalyst_client.py`
  - Add narrow typed Core discovery and selected-read operations, safe response
    parsing, fixed error classification, existing auth/timeout/refresh, and
    cleanup behavior.
- `climate-advisor/service/app/services/agent_service.py`
  - Compose the request-time selected-only catalog pack without changing
    existing workflow/tool-pack conditions.
- `climate-advisor/service/app/utils/streaming_handler.py`
  - Modify only if the existing request-context lifecycle requires a narrow
    handoff for active catalog context or refreshed token state.

### New production files, if the existing hierarchy has no suitable seam

- `climate-advisor/service/app/services/native_input_catalog_service.py`
  - Request-scoped discovery response validation, current selection binding,
    and selected-only descriptor/factory coordination. No Core authorization.
- `climate-advisor/service/app/tools/native_input_catalog_tools.py`
  - Typed selected-capability wrappers, bounded input/result/error mapping, and
    Core-only execution. No storage or direct module access.

The implementation must prefer existing helpers and builders where they fit;
new files are not a reason to duplicate client, token, workflow, or tool logic.

### New/extended tests

- `climate-advisor/service/tests/test_citycatalyst_client.py`
  - Typed discovery/read requests, headers, timeout, one-time refresh, safe
    fixed error mapping, bounded response handling, and client closure.
- `climate-advisor/service/tests/test_native_input_catalog_service.py`
  - Current-response selection binding, request-time discovery, readiness
    separation, malformed/empty/disabled behavior, and selected-only loading.
- `climate-advisor/service/tests/test_native_input_catalog_tools.py`
  - Typed input/result contracts, exactly selected execution, stable errors,
    forbidden-field absence, failure isolation, and cleanup.
- `climate-advisor/service/tests/test_agent_service.py`
  - Existing workflow/tool-pack compatibility and selected-only composition.
- `climate-advisor/service/tests/test_streaming_handler.py`
  - Extend only if request-time context, cancellation, or refreshed-token
    handoff requires coverage.

Existing auth, inventory, Stationary Energy, Concept Note, legacy, vector, and
token tests are extended only where the new additive pack touches their shared
composition seam.

## Dependency and sequence plan

Each unit follows test-driven development: add the smallest failing test, run it
to confirm the intended failure, implement the minimum behavior, run focused
tests green, simplify/refactor within the unit, and verify security assertions.
After any code change under `climate-advisor/`, apply the mandatory project
`simplify-after-change` and `docs-after-change` skills before the unit is
closed.

### Unit 1 — Typed Core client contract

Files:

- Modify: `climate-advisor/service/app/services/citycatalyst_client.py`
- Extend: `climate-advisor/service/tests/test_citycatalyst_client.py`

Steps:

1. [x] Add failing tests for typed discovery/read request payloads, existing
   service/bearer headers, timeout forwarding, and bounded response parsing.
2. [x] Add failing tests for one-time 401 refresh, refreshed token-reference
   propagation, client/response closure, transport failure, and the exact
   fixed `capability_unavailable` classification without upstream body text.
3. [x] Run the focused client tests to confirm failure before implementation.
4. [x] Implement only narrow typed Core discovery/read methods using existing
   client/auth/timeout/refresh conventions; keep endpoint details in the client.
5. [x] Ensure discovery and selected read are distinct operations; discovery
   never invokes a full read or loads a CA tool.
6. [x] Run focused tests, lint/format checks, and the required
   `simplify-after-change` and `docs-after-change` skills.
7. [x] Commit only this unit with:
   `feat(cc-737): add Climate Advisor catalog client contract`.

**TDD red checkpoint**: At the red checkpoint, added the five Unit 1 client
tests and ran the focused selection. Four catalog discovery/read tests failed
with the expected missing
`CityCatalystClient.discover_native_inputs` / `read_native_input` methods; the
existing close-lifecycle assertion passes. No production client code was
modified at that checkpoint. Implementation then proceeded only after
explicit review of this red checkpoint.

**TDD green checkpoint**: Following explicit approval of the red checkpoint,
implemented the narrow discovery/read client methods over the existing Core
internal capability transport. Discovery uses the existing auth refresh and
bounded client timeout without loading or executing source capabilities. The
selected-read method uses the same boundary and maps a Core 404 to the fixed
non-disclosing unavailable error. The focused catalog/lifecycle selection
passes 5/5; the complete client test file passes 17/17; both changed Python
files compile. Ruff could not run because it is not installed in the service
environment. The mandatory simplification pass found no redundant scoped code
to remove. Climate Advisor README/architecture documentation was reviewed; no
runtime flow documentation update is applicable until the client contract is
composed into request-time orchestration in later units.

**Atomic commit**: Created `c399c1951`
(`feat(cc-737): add Climate Advisor catalog client contract`) containing only
the Unit 1 client implementation and AI-DLC evidence updates. The Unit 1
contract tests were introduced in the preceding red-checkpoint commit
`0c28762d8`. Unit 1 completion remains pending explicit review and approval.

Story/requirement mapping: US-03, US-07, US-09; FR-04 through FR-07, FR-09,
FR-10, FR-11; NFR-UOW02-02, 04, 05, 07, 11, 12, 14–18, 21–22.

### Unit 2 — Request-time discovery and selection binding

Files:

- New or existing narrow service seam:
  `climate-advisor/service/app/services/native_input_catalog_service.py`
- Extend: `climate-advisor/service/tests/test_native_input_catalog_service.py`

Steps:

1. [x] Add failing tests proving discovery runs once after active context
   resolution and before catalog tool construction.
2. [x] Add failing tests proving discovery consumes safe Core projections,
   retains no omission reason/raw scope/source/storage data, and creates no
   source tool or full-read call for any candidate.
3. [x] Add failing tests for disabled, empty, unavailable, malformed, and
   timeout discovery; assert no catalog tools and unchanged existing packs.
4. [x] Add failing tests for exact current `catalog_id` + Core-issued
   `capability_id` binding, stale/forged/unknown/mismatched selection rejection,
   and active-context mismatch.
5. [x] Run the focused service tests to confirm failure before implementation.
6. [x] Implement request-scoped discovery validation and selection binding with
   bounded state; treat IDs as opaque and never derive routes/capabilities.
7. [x] Verify that Core remains the read-time authority and that no selection
   binding is treated as authorization.
8. [x] Run focused tests, lint/format checks, mandatory project skills, and a
   serialized-field audit.
9. [x] Commit only this unit with:
   `feat(cc-737): add request-time catalog selection binding`.

Story/requirement mapping: US-03, US-07, US-09; FR-01 through FR-04, FR-06,
FR-07, FR-08, FR-11; NFR-UOW02-01–04, 07, 09–11, 15–17, 21–22.

**TDD red checkpoint — Unit 2**: Added the request-time discovery and
selection-binding tests. The focused suite fails during collection because
the planned `app.services.native_input_catalog_service` module does not yet
exist. No Unit 2 production code, tool factory, AgentService, or streaming
code was modified. Implementation remains gated on explicit review of this
red checkpoint. A follow-up test also proves that a pair discovered for one
active context cannot be rebound under another context and receives the same
stable undisclosed error.

**TDD green checkpoint — Unit 2**: Implemented the bounded
`NativeInputCatalogService` request-scoped seam. It performs one Core
discovery call after a resolved context, caches only safe projection fields,
fails closed for disabled/empty/malformed/unavailable/timeout discovery, never
calls selected reads during discovery, and binds only an exact current pair
under the unchanged active context. The Unit 2 suite passes 13/13, the
existing client suite passes 17/17, and the changed Python files compile. The
mandatory simplification pass removed no additional scoped code after the
unused-test-import cleanup. The architecture documentation now records the
new boundary; README/setup documentation remains accurate and unchanged.
Atomic commit `b97525fd9` (`feat(cc-737): add request-time catalog selection
binding`) contains only the Unit 2 coordinator implementation and its
AI-DLC/architecture evidence. Unit completion remains pending explicit review
and approval.

### Unit 3 — Selected-only typed capability tools

Files:

- New or existing narrow tool seam:
  `climate-advisor/service/app/tools/native_input_catalog_tools.py`
- Extend: `climate-advisor/service/tests/test_native_input_catalog_tools.py`

Steps:

1. [x] Add failing tests proving only the selected descriptor creates a tool;
   unselected entries remain unloaded and unread.
2. [x] Add failing tests for capability-specific typed inputs, finite limits,
   active-context binding, and rejection of arbitrary scope/route/source/
   storage/credential arguments.
3. [x] Add failing tests proving one selected invocation calls only the
   selected Core read and never executes readiness/full reads for other entries.
4. [x] Add failing tests for bounded success results, forbidden fields, raw
   storage/credential absence, stable unavailable errors, upstream-error
   suppression, failure isolation, and resource cleanup.
5. [x] Run the focused tool tests to confirm failure before implementation.
6. [x] Implement selected-only wrappers using the typed client and existing
   Agents SDK/tool conventions; do not call storage or module endpoints.
7. [x] Preserve refreshed token-reference updates without exposing tokens.
8. [x] Run focused tests, lint/format checks, mandatory project skills, and
   property-based invariants for pure selection/result/error functions where
   practical.
9. [x] Commit only this unit with:
   `feat(cc-737): add selected native input tools`.

Story/requirement mapping: US-03, US-07, US-09; FR-03 through FR-10, FR-11;
NFR-UOW02-03, 05, 07–18, 21–22.

**TDD red checkpoint — Unit 3**: Added the selected-only capability-tool tests.
The focused suite fails during collection because the planned
`app.tools.native_input_catalog_tools` module does not yet exist. No Unit 3
production tool, AgentService, streaming, Core, storage, or credential code
was modified. Implementation remains gated on explicit review of this red
checkpoint. The test set now also explicitly covers malicious runtime
arguments and oversized input, finite output rejection, isolated selected
tool failure with cleanup, and discovery sets whose unselected entries remain
unloaded, unexposed, and unread.

**TDD green checkpoint — Unit 3**: Implemented the selected-only typed tool
factory over the existing Agents SDK and `CityCatalystClient` boundary. Static
capability descriptors are the only source of tool schemas; request context,
catalog selection, and bounded inputs are captured internally. Runtime scope,
route, source, storage, credential, and oversized arguments are rejected before
Core. Only the selected capability invokes a bounded Core read; success data is
finite and recursively redacted, unavailable and upstream failures use stable
safe envelopes, refreshed token references are propagated without exposure,
and each created client is closed after invocation. No Climate Advisor storage,
S3, raw source, or direct module access was added.

The Unit 3 focused suite passes 12/12. The combined Unit 2/client regression
suite passes 30/30, and the inventory-context regression suite passes 8/8.
The selected tool, service, and related tests compile, and `git diff --check`
passes. Ruff could not run because it is not installed in the service
environment. The mandatory simplification pass removed an unused import and a
redundant argument discard; the documentation-impact review updated
`climate-advisor/docs/architecture.md`, while README/setup documentation
remains accurate.

**Atomic commit**: Created `8388a41fe`
(`feat(cc-737): add selected native input tools`) containing only the Unit 3
selected-tool implementation, its test-fixture correction, architecture
documentation, and AI-DLC evidence. Unit 3 completion remains pending explicit
review and approval; Unit 4 is not opened.

### Unit 4 — AgentService composition and workflow compatibility

Files:

- Modify: `climate-advisor/service/app/services/agent_service.py`
- Modify only if required: `climate-advisor/service/app/utils/streaming_handler.py`
- Extend: `climate-advisor/service/tests/test_agent_service.py`
- Extend only if required: `climate-advisor/service/tests/test_streaming_handler.py`

Steps:

1. [x] Add failing tests for catalog discovery/context handoff before agent
   creation and selected-only catalog tool composition.
2. [x] Add failing compatibility tests for general chat, inventory, Stationary
   Energy, Concept Note, legacy datasource, vector, missing context, feature
   disabled, Core unavailable, and empty discovery behavior.
3. [x] Add failing cancellation/cleanup and refreshed-token handoff tests if
   the shared streaming lifecycle participates in the new path.
4. [x] Run focused service/streaming tests to confirm failure before changes.
5. [x] Integrate the additive catalog pack at the narrowest existing
   composition seam without replacing or widening existing packs.
6. [x] Verify catalog discovery is not global/startup work and that only the
   selected capability enters the final agent tool list.
7. [x] Run focused tests, lint/format checks, mandatory project skills, and
   existing workflow regressions.
8. [x] Commit only this unit with:
   `feat(cc-737): integrate request-time catalog tools`.

Story/requirement mapping: US-03, US-07, US-09; FR-04, FR-08, FR-10, FR-11;
NFR-UOW02-01–08, 14–21.

**TDD red checkpoint — Unit 4**: Added three AgentService composition tests
covering discovery-before-agent construction, exact selected-tool composition,
missing active context/selection fail-closed behavior, and preservation of the
existing vector pack when discovery is empty. The focused AgentService suite
collected 29 tests: 26 existing tests passed and the three new tests failed for
the expected missing `native_input_catalog_service` constructor seam. No Unit
4 production code, streaming changes, storage access, or credential changes
were made. Explicit Unit 4 implementation approval is required before the
green cycle.

**Red-test atomic commit**: Created `470bcfc87`
(`test(cc-737): add AgentService catalog composition red tests`) containing
only the Unit 4 red tests and AI-DLC evidence. Unit 4 production implementation
remains gated on explicit approval.

**TDD green checkpoint — Unit 4**: Added the narrow AgentService catalog
composition seam and the StreamingHandler active-context handoff. AgentService
performs request-scoped discovery before agent construction, binds only the
exact current selection, composes only the selected tool additively, and keeps
existing workflow packs unchanged when context, selection, or discovery is
missing. StreamingHandler derives user/thread from its authenticated state,
accepts only safe scope fields, ignores caller-supplied user identity, and
forwards only the catalog/capability selection pair. The implementation owns
no catalog authorization, route derivation, storage, or S3 access.

The Unit 4-focused and catalog regression suite passes 90/90. The selected
files compile and `git diff --check` passes. Ruff could not run because it is
not installed in the service environment. The complete 393-test service suite
was attempted but stalled on the first CNB test
(`service/tests/cnb/test_concept_note_agent_scope.py`) without a result and was
interrupted; this environment limitation is recorded rather than treated as a
green result. The mandatory simplification pass removed redundant context
extraction and corrected formatting. The architecture documentation records
the AgentService/StreamingHandler handoff; README/setup documentation remains
accurate.

**Atomic commit**: Created `1005e2d35`
(`feat(cc-737): integrate request-time catalog tools`) containing only the
Unit 4 AgentService/StreamingHandler integration, its handoff test,
architecture documentation, and AI-DLC evidence. Unit 4 completion remains
approved after explicit review on 2026-08-31. Unit 5 is now opened at its
test-first red-checkpoint gate.

### Unit 5 — Consumer security, contract, lifecycle, and compatibility hardening

Status: TDD red checkpoint complete; production implementation is not
authorized until the checkpoint is reviewed and explicitly approved.

Files:

- Extend the new/modified UOW-02 client/service/tool tests.
- Extend existing compatibility/auth/token tests only where directly affected.

Steps:

1. [x] Add the complete example-based matrix for stale, forged, malformed,
   unknown, mismatched, unauthorized, withdrawn, superseded, missing, deleted,
   unavailable, and readiness-negative selections.
2. [x] Assert the stable safe error and no source existence/state, labels,
   scope, storage, credential, token, content, or upstream text disclosure.
3. [ ] Assert discovery readiness versus selected execution invocation counts,
   selected-only loading, finite inputs/results, and no raw storage access.
4. [ ] Cover one-time refresh, timeout, cancellation, cleanup on all terminal
   paths, failure isolation, safe telemetry, and feature-gate behavior.
5. [ ] Run the focused UOW-02 sweep and relevant existing Climate Advisor
   suites; record unrelated baseline failures separately.
6. [ ] Add partial property-based tests for pure selection membership,
   selected-only registration, safe serialization, bounds, and safe-error
   invariants with reproducible seeds and shrinking.
7. [ ] Apply mandatory project skills, inspect the final diff for scope/storage
   boundary violations, and commit only hardening/evidence updates with:
   `test(cc-737): harden Climate Advisor catalog security evidence`.

Story/requirement mapping: US-03, US-07, US-09; FR-03 through FR-11;
NFR-UOW02-01 through NFR-UOW02-22.

**TDD red checkpoint — Unit 5**: Added the selection-failure matrix and
consumer hardening tests for stable non-disclosure, transport failure
normalization, finite result serialization, cancellation cleanup, safe
telemetry, and absence of direct storage/source access. The focused client and
selected-tool suite collected 48 tests: 43 passed and five failed for the
expected unimplemented gaps—transport exceptions still escape as raw
`httpx.ReadTimeout`, non-finite results are currently serialized as successful
responses, and generic exception telemetry currently includes upstream text.
The matrix, cancellation cleanup, and static storage-boundary checks passed.
No Unit 5 production implementation was added. The remaining Unit 5 steps
stay gated on explicit approval of this red checkpoint.

**Red-test atomic commit**: Created after this checkpoint with only the Unit 5
hardening tests and AI-DLC evidence. Unit 5 production implementation remains
gated on explicit approval.

## Atomic commit and review protocol

- Each unit is test-first and independently reviewable.
- Before every commit, stage only exact UOW-02 files; never stage
  `AGENTS.md`, `.aidlc-rule-details/`, unrelated package-lock changes, or
  unrelated worktree changes.
- Each unit must report focused tests, lint/format/type checks where applicable,
  mandatory project-skill results, and known repository baseline limitations.
- If implementation reveals a Core contract mismatch, stop and return to UOW-01;
  do not solve it with client-side authorization or an unapproved fallback.
- If implementation requires a new storage, topology, transport, or persistence
  decision, stop, document it with a dedicated question, and request approval.
- UOW-03 consumes the resulting consumer evidence; it does not replace these
  service-local security/compatibility tests.

## Code Generation questions — complete every `[Answer]:` tag

Answer each question directly after its `[Answer]:` tag. Select one option and
state any constraint or rationale required. These questions define execution
controls for the approved units; they do not authorize implementation until
the plan is answered and explicitly approved.

### Question 1 — Unit sequence and scope

How should the five implementation units be executed?

A) **Recommended:** Execute Units 1–5 in order, preserving the dependency
boundaries and exact file scope in the plan; pause and return to design if a
Core contract, storage, topology, or unrelated workflow change is discovered.

B) Execute all units in parallel to reduce elapsed time.

C) Combine all units into one broad refactor.

X) Other (describe after the tag).

[Answer]: A

### Question 2 — Test-first checkpoints

What checkpoint must precede each implementation unit?

A) **Recommended:** Add the smallest failing tests first, run them to record
the intended red checkpoint, then implement the minimum behavior and run the
focused suite green before any commit.

B) Implement production code first and add tests after all units are complete.

C) Use only end-to-end tests after the final unit.

X) Other (describe after the tag).

[Answer]: A

### Question 3 — Approval granularity

When should work pause for explicit review during Code Generation?

A) **Recommended:** Pause after each independently reviewable unit's red/green
evidence and atomic commit, and pause at the final Code Generation completion
gate; do not advance to the next unit without the required approval.

B) Pause only once after all five units are implemented.

C) Continue automatically through all units after plan approval.

X) Other (describe after the tag).

[Answer]: A

### Question 4 — Existing-file and implementation scope

How should brown-field file changes be constrained?

A) **Recommended:** Prefer existing client, AgentService, streaming, token, and
tool patterns; add only the narrowest required seams/files; stage exact files;
leave setup, lockfiles, prompts, storage, migrations, and unrelated behavior
untouched.

B) Refactor shared Climate Advisor infrastructure before adding the feature.

C) Modify any convenient service or dependency to simplify implementation.

X) Other (describe after the tag).

[Answer]: A

### Question 5 — Discovery/readiness execution invariant

What must the implementation prove about discovery?

A) **Recommended:** Discovery runs once per active request after context
resolution and performs only typed safe filtering/readiness consumption; it
must not load Climate Advisor capabilities, execute full reads, retrieve all
candidate content, or speculatively invoke tools.

B) Preload every discovered tool during agent creation.

C) Execute one source read per candidate to validate readiness.

X) Other (describe after the tag).

[Answer]: A

### Question 6 — Selected-only execution invariant

What must the tool implementation guarantee?

A) **Recommended:** Only a current discovery entry paired with its opaque
Core-issued capability ID can create a request-scoped tool, and one invocation
executes only that selected bounded Core read; Core still revalidates it.

B) Register all eligible tools and let the model choose among them.

C) Accept arbitrary capability IDs and derive routes at runtime.

X) Other (describe after the tag).

[Answer]: A

### Question 7 — Security and forbidden-data evidence

Which evidence is mandatory before committing a security-relevant unit?

A) **Recommended:** Assert stable non-disclosure for stale/forged/invalid and
unavailable selections, Core-mediated bounded results, absence of source/state/
scope/storage/credential/upstream-error leakage, and no direct storage/module
access in Climate Advisor.

B) Verify only the authorized happy path.

C) Defer all forbidden-data checks to UOW-03.

X) Other (describe after the tag).

[Answer]: A

### Question 8 — Compatibility and lifecycle evidence

What regression scope is required while integrating the new pack?

A) **Recommended:** Preserve and test general chat, inventory, Stationary
Energy, Concept Note, legacy datasource, vector, auth, token refresh, timeout,
cancellation, cleanup, feature flags, and failure isolation; no catalog failure
may widen or silently replace an existing pack.

B) Test only the new catalog-backed path.

C) Replace existing workflow tools with the new pack during this unit.

X) Other (describe after the tag).

[Answer]: A

### Question 9 — Mandatory post-change quality checks

What checks must follow any Climate Advisor code change?

A) **Recommended:** Apply both mandatory project skills,
`simplify-after-change` and `docs-after-change`, then run focused pytest,
format/lint/type checks applicable to the touched files before committing.

B) Run only the feature test and defer documentation/simplification.

C) Skip checks until the final integration suite.

X) Other (describe after the tag).

[Answer]: A

### Question 10 — Environment limitations and commit protocol

How should unavailable dependencies or unrelated baseline failures be handled?

A) **Recommended:** Record the exact command, failure, and scope in the unit
evidence; continue only with safe deterministic alternatives; never bypass a
security check; stage only the unit's files and create one atomic commit per
unit.

B) Modify unrelated setup or dependencies to make every command pass.

C) Ignore failures and commit the unit without evidence.

X) Other (describe after the tag).

[Answer]: A

## Answer validation and approval gate

After all answers are supplied, they will be checked for completeness,
contradictions, and consistency with the approved Functional Design, NFR
Requirements, NFR Design, UOW-01 Core contract, and brown-field instructions.
Any unresolved decision will receive a follow-up question with a new
`[Answer]:` tag. Tests or application code will be generated only after this
plan is answered and explicitly approved.

### Answer validation result

- All 10 planning questions have non-empty `[Answer]:` tags.
- Every answer selects the recommended behavior and is consistent with the
  approved UOW-02 Functional Design, NFR Requirements, NFR Design, and UOW-01
  Core contract.
- The answers require ordered test-first units, explicit red/green review
  checkpoints, atomic commits, narrow brown-field changes, readiness/read
  separation, selected-only execution, release-blocking security and
  compatibility evidence, mandatory post-change skills, and documented
  environment limitations.
- No contradiction or unresolved ambiguity requires a follow-up question.
- **Gate**: Explicit UOW-02 Code Generation plan approval is required before
  any tests or application code are written.

## Verification commands

Commands must use existing Climate Advisor tooling from its service/project
root, as documented by the repository. At minimum, each unit should run its
focused pytest selection, formatting/lint checks, and applicable type/static
checks. The final hardening unit must run the relevant existing workflow/auth/
token suites and record environment or pre-existing baseline failures without
expanding scope.

## Code Generation completion gate

After Units 1–5 are implemented, tested, simplified, documented, and committed,
the following evidence must be reviewed before UOW-02 Code Generation is
considered complete:

- request-time discovery occurs after active context resolution and only once;
- discovery readiness performs no Climate Advisor capability loading or full
  reads for all inputs;
- only the current selected Core-issued capability is loaded/executed;
- Core revalidation is consumed and never replaced by Climate Advisor logic;
- stable non-disclosing error and bounded result contracts are preserved;
- no credentials, signed URLs, raw storage access, or unrestricted payloads
  reach Climate Advisor model/tool output or telemetry;
- existing workflows and lifecycle behavior remain compatible; and
- atomic commits and focused security/contract evidence are complete.

Explicit UOW-02 Code Generation completion approval is required before UOW-03
cross-service verification or any release-readiness claim.
