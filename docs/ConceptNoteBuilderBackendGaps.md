# Concept Note Builder v1 Backend Gaps and Start Order

**Status:** current merged-backend and user-story reconciliation

**Checked against:** `origin/develop` at `3b1f74ec7`, merged into this branch by `a78f33eae`, on August 17, 2026

## Outcome

The backend already has more of the evidence pipeline than the Figma-only audit suggested: a run can be bound at start to an existing authorized chat thread, successful PDF-to-Markdown delivery can schedule a guarded bundle rebuild, large sources are processed in page-preserving partitions, and the agent can query exact page evidence or return an explicit no-basis result.

The smallest meaningful missing piece is therefore **not** a new chat stack or granular SSE. It is a frontend-safe read model for the context bundle. After that, the highest-value small slices are a representative 180-page acceptance test, a selected-grant requirements read model, and run-scoped corrections that preserve the original CityCatalyst values.

## Product sources and precedence

This audit reconciles four inputs:

1. [Concept Note Builder — v1 Use Cases & Open Questions](https://app.notion.com/p/396eb557728b81f2a2aff7518494d75b) — primary v1 product source.
2. [Concept Note Builder — Draft PRD](https://app.notion.com/p/38eeb557728b816f8c06f8f6469f9b6c) — exploratory context, explicitly non-prescriptive.
3. [NLC pilot Epic and user stories](https://app.notion.com/p/382eb557728b8022bfe2e5673973fc5f) — older pilot scope containing US-01 through US-03.
4. [Figma CNB flow](https://www.figma.com/design/KwCeqEGCQomYRfxkcp9HKK/Agentic-Flow---Concept-Note-Builder?node-id=4678-8838&t=ZpFsjpktuow5PHwh-1) and the current repository implementation.

Where these conflict, this document uses the later v1 use-case page for the intended experience, current code for implementation truth, and records older-Epic additions as decisions rather than silently expanding v1.

## Reconciled v1 boundary

The later v1 stories define:

- one city and one pre-selected funder/instrument producing one concept note;
- one draft, one note, and one persistent conversation;
- a guided interview, not a fixed step-by-step wizard;
- a read-only live draft preview and an editable Word deliverable;
- CityCatalyst context plus user sources, with linked evidence and an explicit no-basis state;
- files that may be added during the interview and then become available to the same run;
- resumable work, with more than one note potentially based on reusable context.

The following should not be treated as first-start backend work:

- multi-funder discovery, ranking, or a second funder;
- regional or multilingual expansion;
- cross-agent or bring-your-own bundle import;
- branching or duplicating note variants;
- a simultaneous chat and rich-text editor experience;
- granular CNB SSE when polling a stable revision is sufficient;
- PDF export unless product reconfirms it alongside the later Word-first requirement.

## Decisions required before dependent implementation

These are product/data-contract decisions, not evidence that the backend team has failed to implement an agreed contract.

| Decision                      | Current conflict                                                                                                                                                | Recommended v1 decision                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| File gate versus thin context | UC-5 expects the interview to work with little data, while the current bundle requires at least one ready PDF                                                   | Permit run creation and chat with thin context; make source upload recommended, not a prerequisite. If a mandatory file gate is intended, state it explicitly and keep the current backend rule. |
| Mid-interview refresh         | The stories leave push versus pull re-checking open                                                                                                             | Start with pull: expose the ready-upload `source_fingerprint` plus a separate full `bundle_revision`, then let the workspace re-read. Add SSE only if measured latency requires it.              |
| Live structured note          | The preview fills during the interview, but the backend currently has only schema groundwork                                                                    | Use one persisted structured note/chapter model during the run; render Word from it. A Word-only end render cannot support a trustworthy live preview.                                           |
| Source links in Word          | The later v1 page asks for linked sources, while [repository architecture notes](./ConceptNoteBuilderArchitecture.md) have described evidence as workspace-only | Decide whether Word contains footnotes/endnotes, a source appendix, or only source URLs before export work starts.                                                                               |
| Bundle reuse scope            | The stories mention multiple notes on reusable context; the Draft PRD leans run-scoped for the first attempt; the current bundle is one-to-one with a run       | Keep the first vertical slice run-scoped, but decide whether shared bundle identity is a committed v1 requirement before locking the schema.                                                     |
| Readiness assessment          | Older US-03 requires before/after scoring and a cohort dashboard; the later v1 page omits it                                                                    | Confirm whether US-03 is still in v1. If retained, plan it as a separate product/backend track after the core note flow.                                                                         |
| Final format                  | The older Epic and Figma allow Word/PDF; the later v1 page says Word                                                                                            | Treat DOCX as required. Do not make PDF a release blocker until scope is reconfirmed.                                                                                                            |

## Smallest meaningful backend start order

Sizes are relative engineering slices, not calendar estimates. Ordering favors the smallest slice that unlocks a real user outcome and respects dependencies.

| Rank | Slice                                                    |     Size     | Why it comes now                                                                                                                                                           | Acceptance proof                                                                                                                                                                                    |
| ---: | -------------------------------------------------------- | :----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | Frontend-readable context-bundle projection              |      XS      | Unlocks the real Context panel, provenance, and pull-based detection of files added mid-interview using state that already exists                                          | An authorized `GET` returns status, ready-upload `source_fingerprint`, full `bundle_revision`, selected sources, CityCatalyst context, optional GHGI/HIAP, provenance, freshness, and typed absence |
|    2 | Representative 180-page CAP acceptance and observability |     XS/S     | UC-3 is high-risk, while the code foundation is already present; prove it before redesigning ingestion                                                                     | A real approximately 180-page PDF completes with every page covered, exact page anchors, explicit not-found behavior, and recorded latency/token/failure metrics                                    |
|    3 | Selected grant requirements/template read model          |      S       | Delivers the read-only part of older US-01 and gives the guided interview a real target without adding funder discovery                                                    | For the run's selected opportunity, return requirements, criteria, template sections, authoritative source/version, and known dossier gaps                                                          |
|    4 | Run-scoped CityCatalyst correction annotations           |      S       | UC-1 requires the user to confirm or correct existing data without corrupting CityCatalyst source records                                                                  | Create/read/remove an override that keeps original value, corrected value, author, reason, timestamp, and source provenance; agent and UI resolve the run overlay first                             |
|    5 | Direct Markdown source intake                            |      S       | The v1 source list includes Markdown, while the user-facing upload route accepts only PDF                                                                                  | Existing upload flow accepts Markdown without OCR and produces stable heading/block anchors rather than fake page numbers                                                                           |
|    6 | Thin-context mode, if the product chooses an open start  |      S       | Satisfies UC-5 and removes the current `no_ready_city_pdf` block                                                                                                           | A run with no ready file can enter interviewing with typed missing-context warnings; later uploads rebuild the same run normally                                                                    |
|    7 | Post-start scope correction                              |      S       | Useful if a user can correct the project/funder/opportunity after opening; it is smaller than document runtime but is not required for a strictly pre-selected-funder flow | An authorized patch validates funder/opportunity ownership, persists the new scope, reports setup gaps, and invalidates only affected derived context                                               |
|    8 | Requirement-to-context coverage map                      |     S/M      | Completes the “what is missing from this project?” part of US-01 and provides grounded interview questions                                                                 | Every selected-grant requirement is `supported`, `missing`, or `unknown`, with source anchors or explicit no-basis; results carry the full bundle revision                                          |
|    9 | Minimal structured document vertical slice               |      M       | Enables the first honest live preview and editing path using the existing chapter/revision/evidence schema                                                                 | Initialize template chapters, read the workspace, edit one chapter by appending a revision, return evidence/no-basis state, and mark revisions stale when their bundle revision changes             |
|   10 | Guided suggestion actions                                |      M       | Delivers US-02 after there is somewhere durable to put suggestions                                                                                                         | Generate, accept, edit, and regenerate a section suggestion; every suggestion records its bundle revision and evidence anchors                                                                      |
|   11 | DOCX source intake                                       |      M       | Completes the v1 PDF/Markdown/DOCX input promise after the simpler Markdown contract is proven                                                                             | DOCX text and tables are stored with stable section/paragraph anchors, provenance, retry, and bundle rebuild behavior                                                                               |
|   12 | Validation and DOCX export                               |     M/L      | Completes the user outcome only after structured content and source-link policy exist                                                                                      | Preflight returns blocking/warning findings; export is persisted, retryable, downloadable, and rendered from the same accepted revisions shown in preview                                           |
|   13 | Shared bundle identity across notes, if confirmed        |      L       | The current one-bundle-per-run model cannot literally serve multiple notes from one bundle                                                                                 | Separate bundle identity/version from run identity, authorize reuse, and preserve immutable source/revision provenance across notes                                                                 |
|   14 | Readiness assessment, if US-03 is retained               | L / separate | It introduces questionnaires, scoring policy, before/after snapshots, and cohort aggregation unrelated to the core drafting runtime                                        | Versioned assessment instrument, auditable score calculation, snapshots, permissions, and cohort reporting have an agreed contract and tests                                                        |

### Recommended first three implementation tickets

1. `GET /api/v1/concept-notes/{runId}/context-bundle`, exposing the already-persisted ready-upload source fingerprint and adding a full bundle revision.
2. A real 180-page CAP acceptance fixture/harness with page-coverage, evidence, latency, and cost assertions.
3. `GET /api/v1/concept-notes/{runId}/funding-context` for the single pre-selected opportunity.

Together these make the current frontend materially truthful without waiting for the full drafting engine.

## User-story coverage

Statuses mean:

- **Covered** — runtime path exists end to end at the backend boundary.
- **Partial** — meaningful runtime foundation exists, but a required public contract or persisted behavior is absent.
- **Backend gap** — no runtime implementation exists; schema alone does not count.
- **Decision** — scope or contract must be resolved before implementation is judged.

| Story or outcome                                                                     | Status                            | Current truth and remaining gap                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UC-1: use existing CityCatalyst data and files                                       | Partial                           | City context, PDF bundle assembly, and agent consumption exist internally. Missing public bundle/requirements reads, run-scoped corrections, template-to-interview/chapter mapping, and the live structured draft.                                                                                           |
| UC-2: add a file during the interview                                                | Partial, strong foundation        | Successful Markdown registration schedules a rebuild over all ready uploads when the bundle service is available; source fingerprinting prevents a stale build from replacing a newer upload set. Missing non-PDF intake, frontend bundle revision/read, and drafted-section invalidation/re-check behavior. |
| UC-3: ingest an approximately 180-page CAP                                           | Partial, strong foundation        | Page-preserving 50,000-token partitions, bounded concurrency of 3, oversized-page splitting, digest/page verification, and exact-citation tests exist. A representative 180-page performance/operability acceptance test is still missing.                                                                   |
| UC-4: show sources and say when there is no basis                                    | Partial                           | Internal source query covers every page, returns verified page excerpts, and can return explicit not-found. Chapter-level evidence links, frontend source objects, and a persisted no-basis state are not wired at runtime.                                                                                  |
| UC-5: work with thin context                                                         | Decision plus conditional gap     | Chat can operate with limited context, but the bundle fails with `no_ready_city_pdf` when no PDF is ready. Backend work depends on the file-gate decision.                                                                                                                                                   |
| UC-6: one note, one conversation, resume later                                       | Mostly covered backend foundation | Thread creation/history/SSE already exist; start accepts `thread_id`, persists it on the run, and binds `concept_note_run_id` into thread context. The frontend must use that path. Literal reuse of one bundle by multiple runs is not supported by the current one-to-one schema.                          |
| US-01: view the selected grant's requirements, criteria, template, and current gaps  | Partial/internal                  | Funding IDs are validated and funder research/reference foundations exist, but no stable run-scoped read model or requirement-to-project coverage map composes them for the product.                                                                                                                         |
| US-02: guided section adaptation with accept/edit/regenerate and structured download | Backend gap                       | Generic run-scoped chat exists, but chapter initialization, suggestions, revisions, evidence, validation, and export have no runtime API.                                                                                                                                                                    |
| US-03: before/after readiness score and cohort dashboard                             | Decision; backend gap if retained | No assessment instrument, scoring service, snapshots, aggregation, or cohort API exists. The story is absent from the later v1 use-case page and must be reconfirmed.                                                                                                                                        |

## Current code-backed foundations

### Runs, chat, and resume

- Authorized run start/list/detail are implemented.
- Start already accepts a `thread_id`, verifies ownership, persists it, and binds the run identifier into the Climate Advisor thread context.
- Generic chat provides thread creation, message history, and SSE response streaming.
- Climate Advisor loads and prunes persistent conversation history and registers the selected-source query tool for a bound Concept Note run.

Consequently, a separate CNB chat stack is **not** a backend prerequisite. The frontend can create a thread first, pass it to run start, resume from `run.thread_id`, and use the shared chat APIs. A post-start attach operation is only needed if product insists on creating the run before its thread.

Code evidence:

- [`concept_note_runs.py`](../climate-advisor/service/app/services/concept_note_runs.py)
- [`runs.py`](../climate-advisor/service/app/persistence/concept_notes/runs.py)
- [`chat/threads/route.ts`](../app/src/app/api/v1/chat/threads/route.ts)
- [`chat/messages/route.ts`](../app/src/app/api/v1/chat/messages/route.ts)
- [`chat/threads/[threadId]/messages/route.ts`](../app/src/app/api/v1/chat/threads/%5BthreadId%5D/messages/route.ts)

### PDF intake and mid-interview rebuilding

- CityCatalyst accepts a run-scoped PDF, stores it, and queues OCR.
- Climate Advisor owns the upload lifecycle and immutable Markdown pointer.
- Successful Markdown registration schedules a context build when the context-bundle service is available.
- The build considers all current ready uploads.
- Source fingerprint and build-id guards prevent an older build from overwriting a newer source set.

This satisfies the core append-and-reindex foundation of UC-2 for PDF. What is missing is the user-facing revision contract and downstream chapter invalidation, not the rebuild trigger itself.

### Large-document evidence

- Page markers, artifact digest, and declared page count are reverified before analysis.
- Source pages are split without dropping or reordering content.
- Oversized individual pages are segmented while retaining their page identity.
- Partition readers must confirm complete segment coverage.
- Source queries scan the complete document for the question and return verified page excerpts or explicit not-found.
- Current configuration uses 50,000-token partitions with maximum concurrency 3.

Code evidence:

- [`source_analysis.py`](../climate-advisor/service/app/services/cnb/source_analysis.py)
- [`concept_note_source_tools.py`](../climate-advisor/service/app/tools/concept_note_source_tools.py)
- [`test_source_analysis.py`](../climate-advisor/service/tests/cnb/test_source_analysis.py)

### Context and workspace persistence

- A normalized bundle can hold selected sources, CityCatalyst context, funder context, similar projects, and document context.
- Production assembly currently populates selected PDF analyses plus optional GHGI/HIAP context.
- The full ready bundle is internal to Climate Advisor; the frontend only receives run/upload progress.
- Chapter, revision, evidence-link, gap, matched-project, and export tables exist.
- Those workspace tables are schema groundwork only; no merged end-user runtime routes currently use them.
- `concept_note_context_bundles.run_id` is the primary key, so the current model is exactly one bundle per run.

## Missing contracts by area

### 1. Context read and correction

Minimum public projection:

- bundle status and failure/retry state;
- the existing ready-upload `source_fingerprint` and a new opaque full `bundle_revision`;
- selected source identifier, filename, type, readiness, summary, topics, and anchors;
- CityCatalyst values with provenance and freshness;
- optional GHGI/HIAP, funder, similar-project, and document sections represented as typed absence, not fabricated empty content;
- run-scoped override annotations that never overwrite the source record.

Do not expose the internal agent bundle unchanged. Return a versioned UI contract and authorize it through the CityCatalyst proxy.

The existing `source_fingerprint` hashes only ready upload IDs, Markdown digests, and page counts. It is suitable for detecting source-set changes, but it does not version GHGI/HIAP, funder, similar-project, correction, or other bundle content. Staleness and cache validation therefore need a separate full bundle revision.

### 2. Selected funding context

The single selected opportunity needs a composed read model containing:

- funder and program identity;
- application requirements and eligibility/selection criteria;
- authoritative application-template sections;
- source URL, retrieval/review time, and version/freshness;
- known gaps or unavailable fields;
- selected similar projects only if internal matching has produced reviewed results.

This is not a funder discovery or scoring API.

The selected-grant dossier's own missing fields are different from the project's coverage gaps. A second run-scoped evaluation should map every requirement to `supported`, `missing`, or `unknown`, carry exact source anchors or no-basis state, and identify the full bundle revision used. That result seeds interview questions without pretending to be the separate US-03 readiness score or a formal applicant-eligibility decision.

### 3. Multi-format sources and provenance

Current user-facing source upload is PDF-only. Markdown exists only as the internal OCR-delivery/ingest artifact today. Supporting direct Markdown and DOCX upload requires an anchor contract:

- PDF: page and exact excerpt;
- Markdown: heading path plus immutable block identifier;
- DOCX: section/table/paragraph or bookmark identifier;
- every generated claim: zero or more source anchors plus `supported`, `not_found`, or `uncertain` basis state.

Inventing synthetic page numbers for Markdown or DOCX would make UC-4 look complete while breaking traceability.

### 4. Structured document runtime

The minimum useful vertical slice should provide:

- initialize chapters from the selected authoritative template;
- read chapters/current revisions/evidence/gaps;
- append a user edit as a revision;
- generate and regenerate a suggestion;
- accept a suggestion without losing its source anchors;
- associate every revision with the full bundle revision it used;
- flag, rather than silently rewrite, a chapter when new source input makes it stale.

Reorder, custom chapters, delete/restore, and locks can follow after this slice. Whether custom chapters appear in the final funder document remains a product decision.

### 5. Validation and Word export

Validation should report blocking findings and warnings against exact chapter/source identifiers. Export should be asynchronous, persisted, retryable, and generated from the same accepted revisions returned by the workspace read model.

The backend should not start final rendering until product names the authoritative DOCX template and resolves how linked sources appear in the file.

### 6. Shared bundle and readiness assessment

These are architecture/product expansions, not small additions:

- sharing one versioned bundle across multiple notes requires separating bundle identity from run identity and defining reuse permissions;
- readiness assessment requires a versioned questionnaire, scoring policy, before/after snapshots, cohort access control, and aggregation semantics.

Keep both out of the first vertical slice unless product explicitly promotes them into v1.

## Residual backend gap register

This register keeps lower-priority and conditional gaps visible even though they should not displace the start order above.

| Area                  | Current state                                      | Remaining runtime contract                                                                                                     | Priority treatment                                                                       |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Run lifecycle         | Partial                                            | Durable backend-owned steps beyond `assembling_context` and `interviewing`, plus failure and completion summaries              | Add with the structured-document/export slices; do not create states the UI does not use |
| Post-start scope      | Missing                                            | Update name/project/funder/opportunity, return setup gaps, and invalidate affected derived context                             | Small but conditional on agreed flow                                                     |
| Run management        | Missing                                            | Rename and archive/delete with ownership and list behavior                                                                     | Later polish; duplicate/branch is explicitly deferred                                    |
| Chat attachment       | Covered only when `thread_id` is supplied at start | Attach a newly created thread to an existing run                                                                               | Do not add if the frontend can create the thread before starting the run                 |
| Funding orchestration | Internal/partial                                   | Compose selected requirements, template sections, reviewed similar projects, provenance, and known gaps into the run           | Start with the read model; keep matching internal                                        |
| Requirement coverage  | Missing                                            | Map selected grant requirements to supported/missing/unknown project context with evidence and bundle revision                 | After the bundle and funding reads; before guided drafting                               |
| Shared context        | Decision/partial                                   | Freshness/refresh semantics, run-only versus shared correction ownership, promote/remove operations, and cross-run permissions | Product/data decision before mutation APIs                                               |
| Document content      | Schema-only                                        | Chapter initialization, current revision read/write, suggestions, evidence, gaps, and stale-source handling                    | Core medium slice                                                                        |
| Document structure    | Schema-only                                        | Reorder, custom chapter, delete/restore, lock/unlock, conflict handling, and revision history                                  | After minimal content editing; export treatment of custom chapters remains a decision    |
| Validation            | Missing                                            | Blocking/warning findings linked to exact chapter and source identifiers                                                       | Before export; existing schema does not implement it                                     |
| Export                | Schema-only                                        | DOCX render, attempt/status/artifact read, download authorization, failure detail, and retry                                   | After template and source-link decisions                                                 |
| CNB events            | Missing                                            | Optional bundle-revision or document-update notifications                                                                      | Poll first; add only events justified by measured UX need                                |
| Readiness assessment  | Missing                                            | Instrument, score policy, snapshots, cohort aggregation, and reporting                                                         | Separate track only if US-03 is reconfirmed                                              |

## Recommended minimal API shape

### Start-now read contracts

- `GET /api/v1/concept-notes/{runId}/context-bundle`
- `GET /api/v1/concept-notes/{runId}/funding-context`
- `GET /api/v1/concept-notes/{runId}/requirements-coverage`

### Next small mutations

- `POST /api/v1/concept-notes/{runId}/context-overrides`
- `DELETE /api/v1/concept-notes/{runId}/context-overrides/{overrideId}`
- extend `POST /api/v1/concept-notes/{runId}/uploads` for Markdown, then DOCX
- `PATCH /api/v1/concept-notes/{runId}/scope` only if post-start selection/correction is part of the agreed flow

### Structured-document contracts

- `GET /api/v1/concept-notes/{runId}/workspace`
- `PATCH /api/v1/concept-notes/{runId}/chapters/{chapterId}`
- `POST /api/v1/concept-notes/{runId}/chapters/{chapterId}/suggestions`
- `POST /api/v1/concept-notes/{runId}/chapters/{chapterId}/suggestions/{suggestionId}/accept`
- `POST /api/v1/concept-notes/{runId}/validate`
- `POST /api/v1/concept-notes/{runId}/exports`
- `GET /api/v1/concept-notes/{runId}/exports/{exportId}`
- `POST /api/v1/concept-notes/{runId}/exports/{exportId}/retry`

## Guardrails

- Schema-only tables are not runtime-complete features.
- Internal Climate Advisor context is not automatically a frontend contract.
- Never overwrite a CityCatalyst source value to apply a run-specific correction.
- Never claim a source basis when complete source search returned no evidence.
- Reuse the existing chat/thread flow before creating CNB-specific chat infrastructure.
- Prefer bundle revision polling before adding granular SSE.
- Keep one selected funder/instrument in v1; do not turn funding context into discovery.
- Do not implement duplicate/branch variants as a substitute for the unresolved shared-bundle model.
- Verify the 180-page path with the real OCR/artifact/Climate Advisor pipeline; mock-only success is not acceptance evidence.
