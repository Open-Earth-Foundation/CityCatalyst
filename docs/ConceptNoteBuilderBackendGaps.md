# Concept Note Builder v1 Backend Gaps and Start Order

**Status:** current merged-backend and user-story reconciliation

**Checked against:** `origin/develop` at `3b1f74ec7`, merged into this branch by `a78f33eae`, on August 17, 2026

## Outcome

The backend already has more of the evidence pipeline than the Figma-only audit suggested: a run can be bound at start to an existing authorized chat thread, successful PDF-to-Markdown delivery can schedule a guarded bundle rebuild, native Markdown uploads can land directly in the final CityCatalyst Markdown-result namespace without OCR, large PDF sources are processed in page-preserving partitions, and the agent can query exact evidence or return an explicit no-basis result.

The highest-priority missing capability is a durable first version of the document. The agent can chat and query grounded evidence, but it cannot initialize the selected template, draft the full first version, persist chapter text, or return that document to the Draft preview on resume. The full context bundle remains internal to Climate Advisor; exposing it to the frontend is not a product requirement.

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

Resolved on 2026-08-17: run creation and chat use a typed thin-context bundle
when no source is ready. Source upload is recommended for grounding and evidence,
not required. Later ready uploads rebuild the same run as grounded context.

Resolved on 2026-08-17: the first drafting slice must create one complete,
persisted document version. Missing facts are surfaced as gaps instead of being
invented, evidence remains review-only, and export later uses chapter text rather
than evidence metadata.

| Decision              | Current conflict                                                                                                                                          | Recommended v1 decision                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mid-interview refresh | The stories leave push versus pull re-checking open                                                                                                       | Keep source fingerprints and bundle revisions internal. When later input changes drafting context, mark the persisted document as needing review and surface one simple context-updated state. |
| Bundle reuse scope    | The stories mention multiple notes on reusable context; the Draft PRD leans run-scoped for the first attempt; the current bundle is one-to-one with a run | Keep the first vertical slice run-scoped, but decide whether shared bundle identity is a committed v1 requirement before locking the schema.                                                   |
| Readiness assessment  | Older US-03 requires before/after scoring and a cohort dashboard; the later v1 page omits it                                                              | Confirm whether US-03 is still in v1. If retained, plan it as a separate product/backend track after the core note flow.                                                                       |
| Final format          | The older Epic and Figma allow Word/PDF; the later v1 page says Word                                                                                      | Treat DOCX as required. Do not make PDF a release blocker until scope is reconfirmed.                                                                                                          |

## Backend priority order

Sizes are relative engineering slices, not calendar estimates. Priority starts
with the first complete user outcome. Smaller enabling tasks belong inside that
vertical slice rather than displacing it.

| Rank | Slice                                                    |     Size     | Why it comes now                                                                                                                       | Acceptance proof                                                                                                                                                                                                                                                                    |
| ---: | -------------------------------------------------------- | :----------: | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | Agent-generated first document version                   |     M/L      | This is the first user outcome that proves CNB creates a document rather than only discussing one in chat.                             | One idempotent, authorized flow resolves the selected template, drafts every required chapter from internal run context, persists agent-authored revisions, records missing facts as gaps, and returns the same ordered document on resume.                                         |
|    2 | Visual review and application of model-suggested edits   |      M       | The first version is only useful if users can safely inspect and control later agent changes instead of having text silently replaced. | A proposal is bound to an exact base revision, exposes deterministic before/after hunks for red/green rendering, supports per-hunk and whole-proposal accept/reject, applies accepted hunks atomically as a new revision, and becomes stale rather than overwriting a changed base. |
|    3 | Representative 180-page CAP acceptance and observability |     XS/S     | The source pipeline is already present, but a first draft cannot be trusted on large CAPs until the real path is measured.             | A real approximately 180-page PDF completes with every page covered, exact page anchors, explicit not-found behavior, and recorded latency/token/failure metrics.                                                                                                                   |
|    4 | Run-scoped CityCatalyst correction annotations           |      S       | Confirmed corrections must reach the first version without overwriting authoritative CityCatalyst records.                             | Create/read/remove an override retaining original value, corrected value, author, reason, timestamp, and source provenance; internal drafting context resolves the run overlay first.                                                                                               |
|    5 | Post-start scope correction                              |      S       | Useful only if project, funder, or opportunity can change after opening the run.                                                       | An authorized patch validates funder/opportunity ownership, persists the new scope, reports setup gaps, and invalidates affected derived context.                                                                                                                                   |
|    6 | Requirement-to-context coverage map                      |     S/M      | Improves later refinement by making unsupported requirements and missing facts explicit.                                               | Every selected-grant requirement is `supported`, `missing`, or `unknown`, with source anchors or explicit no-basis.                                                                                                                                                                 |
|    7 | DOCX source intake                                       |      M       | Completes the v1 PDF/Markdown/DOCX input promise now that direct Markdown intake exists.                                               | DOCX text and tables are stored with stable section/paragraph anchors, provenance, retry, and bundle rebuild behavior.                                                                                                                                                              |
|    8 | Validation and DOCX export                               |     M/L      | Completes delivery after the first version can be reviewed and edited.                                                                 | Preflight returns blocking findings and warnings; export is persisted, retryable, downloadable, and contains the accepted chapter text shown in preview.                                                                                                                            |
|    9 | Shared bundle identity across notes, if confirmed        |      L       | The current one-bundle-per-run model cannot literally serve multiple notes from one bundle.                                            | Separate bundle identity/version from run identity, authorize reuse, and preserve internal provenance across notes.                                                                                                                                                                 |
|   10 | Readiness assessment, if US-03 is retained               | L / separate | This introduces a separate questionnaire, scoring, snapshot, and cohort-reporting product.                                             | A versioned assessment instrument, auditable scoring, snapshots, permissions, and cohort reporting have an agreed contract and tests.                                                                                                                                               |

### Recommended first implementation tickets

1. Resolve the selected authoritative template and initialize its ordered chapters for the run.
2. Generate and persist one complete first version, storing unknown or unsupported facts as user-visible gaps instead of invented prose.
3. Return and update that persisted document so the Draft preview, resume flow, and later DOCX export all use the same chapter text.
4. Generate and persist model edit proposals against exact chapter base revisions without changing the accepted document.
5. Return server-derived before/after hunks so the Draft UI can show removed text in red and proposed text in green, with per-hunk and accept-all/reject-all controls.
6. Apply accepted hunks atomically as a new immutable revision, persist the decisions for resume, and reject stale-base application.

Tickets 1-3 form the first-document vertical slice; tickets 4-6 form the
immediately following visual-editing slice. A chat response containing
draft-like prose does not satisfy the first slice unless the document is
persisted and recoverable. A model message describing an edit does not satisfy
the second slice unless the proposal can be reviewed and explicitly applied or
rejected.

## User-story coverage

Statuses mean:

- **Covered** — runtime path exists end to end at the backend boundary.
- **Partial** — meaningful runtime foundation exists, but required runtime or persisted behavior is absent.
- **Backend gap** — no runtime implementation exists; schema alone does not count.
- **Decision** — scope or contract must be resolved before implementation is judged.

| Story or outcome                                                                    | Status                            | Current truth and remaining gap                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UC-1: use existing CityCatalyst data and files                                      | Partial                           | City context, PDF bundle assembly, and agent consumption exist internally. The missing core outcome is selected-template initialization plus agent generation and persistence of the first complete document version.                                                                  |
| UC-2: add a file during the interview                                               | Partial, strong foundation        | Successful PDF OCR and native Markdown registration rebuild over all ready uploads, with fingerprint and build guards preventing stale replacement. Missing DOCX intake and backend-owned review/refresh behavior for a document drafted before the new file arrived.                  |
| UC-3: ingest an approximately 180-page CAP                                          | Partial, strong foundation        | Page-preserving 50,000-token partitions, bounded concurrency of 3, oversized-page splitting, digest/page verification, and exact-citation tests exist. A representative 180-page performance/operability acceptance test is still missing.                                             |
| UC-4: show sources and say when there is no basis                                   | Partial                           | Internal source query covers every PDF page or native Markdown block, returns verified located excerpts, and can return explicit not-found. Chapter-level evidence links, frontend source objects, and a persisted no-basis state are not wired at runtime.                            |
| UC-5: work with thin context                                                        | Implemented                       | A source-less run automatically completes a ready `thin` bundle with typed `source_documents` absence, enters interviewing, and can chat. Later ready uploads rebuild the same run as `grounded`.                                                                                      |
| UC-6: one note, one conversation, resume later                                      | Mostly covered                    | New frontend runs create and bind a durable chat thread; history and SSE are connected in the workspace. Literal reuse of one bundle by multiple runs is not supported by the current one-to-one schema.                                                                               |
| US-01: view the selected grant's requirements, criteria, template, and current gaps | Partial/internal                  | Funding IDs are validated and funder research/reference foundations exist, but no stable run-scoped read model or requirement-to-project coverage map composes them for the product.                                                                                                   |
| US-02: guided drafting, editing, and structured download                            | Backend gap                       | Generic run-scoped chat exists, but no runtime initializes chapters, asks the agent for a first persisted document version, stores revision-bound model edit proposals, applies explicit red/green review decisions, records direct user edits, validates the document, or exports it. |
| US-03: before/after readiness score and cohort dashboard                            | Decision; backend gap if retained | No assessment instrument, scoring service, snapshots, aggregation, or cohort API exists. The story is absent from the later v1 use-case page and must be reconfirmed.                                                                                                                  |

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

### PDF and Markdown intake with mid-interview rebuilding

- CityCatalyst accepts a run-scoped PDF, stores it, and queues OCR.
- CityCatalyst validates native UTF-8 Markdown, normalizes its BOM and line
  endings, stores it directly as an immutable content-addressed result artifact,
  and skips OCR.
- Climate Advisor owns the upload lifecycle and immutable Markdown pointer.
- Successful Markdown registration schedules a context build when the context-bundle service is available.
- The build considers all current ready uploads.
- Source fingerprint and build-id guards prevent an older build from overwriting a newer source set.

This satisfies the core PDF/Markdown append-and-reindex foundation of UC-2. What is
missing is backend-owned document review/refresh behavior after context changes,
not the rebuild trigger itself.

### Large-document evidence

- PDF page markers, artifact digest, and declared page count are reverified before analysis.
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
- Production assembly currently populates selected PDF or Markdown analyses plus optional GHGI/HIAP context.
- The full ready bundle is internal to Climate Advisor; the frontend only receives run/upload progress.
- Chapter, revision, evidence-link, gap, matched-project, and export tables exist.
- Those workspace tables are schema groundwork only; no merged end-user runtime routes currently use them.
- `concept_note_context_bundles.run_id` is the primary key, so the current model is exactly one bundle per run.

### First draft generation

- The implemented CNB routes stop at run lifecycle, uploads, upload status, Markdown registration, bundle retry, and CityCatalyst context refresh.
- The frontend draft tab is explicit that no application text has been generated and that chapter generation, evidence links, revisions, and funder templates do not yet have runtime APIs.
- The export dialog is also explicit that document, validation, and export services are not implemented yet.
- Workspace tables for chapters, revisions, evidence links, gaps, and exports exist only as schema and migration coverage today.

Consequently, the agent can currently chat about the note and query grounded evidence, but it cannot yet draft and persist the first version of the concept note as a document artifact.

## Missing contracts by area

### 1. Agent-generated first document version

The context bundle is injected into the agent internally. The first-document
runtime does not require a frontend route that exposes the bundle, its source
fingerprint, or revision mechanics.

The minimum complete vertical slice must:

- resolve the authoritative template for the run's selected opportunity;
- initialize its ordered required and optional chapters;
- generate a complete first version from the available internal run context;
- persist each chapter body as an immutable agent-authored draft revision;
- store unsupported or unknown facts as gaps surfaced to the user, not prose;
- keep evidence metadata separate for review and out of exported chapter text;
- return the same ordered document on refresh and resume;
- be idempotent and retryable so retries do not create duplicate first versions.

The agent may trigger this orchestration from chat, but a draft-like assistant
message is not completion. Success means the document version is persisted and
readable by the workspace.

### 2. Visual review and application of model-suggested edits

This is the next top-priority document outcome after first-version generation.
The Cursor-like red/green treatment is a frontend presentation responsibility;
the backend must provide the revision-safe proposal and decision contract that
makes the comparison truthful and recoverable.

The minimum complete vertical slice must:

- create a model-authored edit proposal for one chapter against an exact immutable `base_revision_id` without changing the accepted chapter text;
- retain the model instruction, author type, creation time, and full proposed text for audit and resume;
- derive deterministic ordered diff hunks on the server from the stored base and proposed text rather than trusting line offsets invented by the model;
- return stable hunk identifiers with `before_text` and `after_text`, allowing the frontend to render existing/removal text in red and proposed/addition text in green;
- support accept or reject for each hunk, plus accept-all and reject-all, and persist those decisions;
- apply the accepted set atomically as one new immutable chapter revision while leaving a fully rejected proposal non-mutating;
- require the current chapter revision to still equal the proposal's base revision, otherwise mark the proposal `stale` and require a new proposal instead of silently rebasing or overwriting user work;
- return pending and decided proposals on refresh and resume with clear `pending`, `applied`, `rejected`, or `stale` status.

The accepted document remains the only input to validation and export. Pending
green text is a proposal, not document content, and a model message claiming an
edit was made is not completion.

### 3. Selected funding context

The single selected opportunity needs composed run context containing:

- funder and program identity;
- application requirements and eligibility/selection criteria;
- authoritative application-template sections;
- source URL, retrieval/review time, and version/freshness;
- known gaps or unavailable fields;
- selected similar projects only if internal matching has produced reviewed results.

This is not a funder discovery or scoring capability.

The selected-grant dossier's own missing fields are different from the project's coverage gaps. A later run-scoped evaluation can map every requirement to `supported`, `missing`, or `unknown`, with exact source anchors or no-basis state. That result supports refinement without pretending to be the separate US-03 readiness score or a formal applicant-eligibility decision.

### 4. Multi-format sources and provenance

Current user-facing source upload accepts PDF and Markdown. Native Markdown is validated, BOM/line-ending normalized, and saved as UTF-8 in a content-addressed object in the final CityCatalyst Markdown-result namespace. It bypasses OCR and is not wrapped in synthetic page markers or a synthetic page count. Climate Advisor derives deterministic heading/block anchors from the stored Markdown bytes. PDF remains page-based and continues to use exact page citations. Supporting DOCX upload still requires an anchor contract:

- PDF: page and exact excerpt;
- Markdown: heading path plus immutable block identifier;
- DOCX: section/table/paragraph or bookmark identifier;
- every generated claim: zero or more source anchors plus `supported`, `not_found`, or `uncertain` basis state.

Inventing synthetic page numbers for Markdown or DOCX would make UC-4 look complete while breaking traceability.

### 5. Direct user edits and document review

After the first version exists, the runtime should:

- read ordered chapters, their current text, revision history, evidence review state, and gaps;
- append explicit user edits as immutable revisions;
- flag affected chapters for review when later inputs change drafting context;
- never silently replace user-edited chapter text;
- keep evidence and source links visible in review state but outside the exported document.

Reorder, custom chapters, delete/restore, and locks can follow after the first
version is usable. Model-suggested changes use the top-priority proposal and
acceptance contract above; direct user edits and accepted model changes should
share the same immutable revision service.

### 6. Validation and Word export

Validation should report blocking findings and warnings against exact chapter
and gap identifiers. Export should be asynchronous, persisted, retryable, and
generated from the same accepted chapter revisions returned by the workspace.
The exported DOCX contains chapter text only; evidence and source metadata stay
in the review workspace.

The backend should not start final rendering until product names the
authoritative DOCX template.

### 7. Shared bundle and readiness assessment

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
| Funding orchestration | Internal/partial                                   | Resolve the selected authoritative template and requirements for the run                                                       | Required inside the top-priority first-document slice; keep matching internal            |
| Requirement coverage  | Missing                                            | Map selected grant requirements to supported/missing/unknown project context with evidence                                     | Refine after the first persisted version exists                                          |
| Shared context        | Decision/partial                                   | Freshness/refresh semantics, run-only versus shared correction ownership, promote/remove operations, and cross-run permissions | Product/data decision before mutation APIs                                               |
| First document        | Schema-only                                        | Template chapter initialization, complete agent draft, persisted revisions, gap creation, and resume/read                      | Top priority; schema alone does not produce a document                                   |
| Model edit proposals  | Missing                                            | Revision-bound proposed text, server-derived before/after hunks, persisted decisions, atomic apply, and stale-base protection  | Second top priority, directly after the first-version vertical slice                     |
| Document content      | Schema-only                                        | Current revision read/write, evidence review, gaps, and changed-context review state                                           | Share the revision service used by first drafts and accepted model edits                 |
| Document structure    | Schema-only                                        | Reorder, custom chapter, delete/restore, lock/unlock, conflict handling, and revision history                                  | After minimal content editing; export treatment of custom chapters remains a decision    |
| Validation            | Missing                                            | Blocking/warning findings linked to exact chapter and source identifiers                                                       | Before export; existing schema does not implement it                                     |
| Export                | Schema-only                                        | DOCX render, attempt/status/artifact read, download authorization, failure detail, and retry                                   | After the first version, authoritative DOCX template, and validation                     |
| CNB events            | Missing                                            | Optional first-draft-ready or context-updated notification                                                                     | Poll first; add one user-meaningful event only if measured UX needs it                   |
| Readiness assessment  | Missing                                            | Instrument, score policy, snapshots, cohort aggregation, and reporting                                                         | Separate track only if US-03 is reconfirmed                                              |

## Recommended minimal API shape

### Immediate first-version contracts

- one agent-callable first-document operation backed by a shared drafting service;
- `POST /api/v1/concept-notes/{runId}/first-draft` for the same authorized orchestration outside chat;
- `GET /api/v1/concept-notes/{runId}/document` for Draft preview and resume;
- `PATCH /api/v1/concept-notes/{runId}/chapters/{chapterId}` for later user edits.

The route names are proposed contracts, not implemented endpoints. Neither the
agent operation nor these routes expose the internal context bundle.

### Visual edit-proposal contracts

- one agent-callable propose-edit operation backed by the same revision-aware service as the document routes;
- `POST /api/v1/concept-notes/{runId}/chapters/{chapterId}/edit-proposals` with an instruction and expected base revision;
- `GET /api/v1/concept-notes/{runId}/edit-proposals?status=pending` for review and resume;
- `POST /api/v1/concept-notes/{runId}/edit-proposals/{proposalId}/decisions` with the expected base revision and a decision for every hunk.

The proposal read model should include `proposal_id`, `chapter_id`,
`base_revision_id`, proposal status, author metadata, and ordered hunks containing
stable `hunk_id`, `before_text`, and `after_text`. The decision call is
idempotent: it either records a fully rejected proposal without changing the
chapter or atomically returns the new accepted chapter revision. Endpoint names
are proposed; the required behavior is the contract.

### Supporting internal/read contracts

- selected funder template and requirements resolution for the run;
- `GET /api/v1/concept-notes/{runId}/requirements-coverage` after the first-version slice;
- run-scoped correction annotations that are injected into drafting context.

### Next small mutations

- `POST /api/v1/concept-notes/{runId}/context-overrides`
- `DELETE /api/v1/concept-notes/{runId}/context-overrides/{overrideId}`
- extend `POST /api/v1/concept-notes/{runId}/uploads` for DOCX
- `PATCH /api/v1/concept-notes/{runId}/scope` only if post-start selection/correction is part of the agreed flow

### Validation and export contracts

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
- Never mutate accepted chapter text merely because the model generated a suggestion; require an explicit persisted accept decision.
- Compute before/after hunks from the stored base revision and proposed text on the server, and reject stale proposals instead of guessing how to rebase them.
- Keep source fingerprints and bundle revisions internal; surface only user-meaningful document or context states.
- Keep one selected funder/instrument in v1; do not turn funding context into discovery.
- Do not implement duplicate/branch variants as a substitute for the unresolved shared-bundle model.
- Verify the 180-page path with the real OCR/artifact/Climate Advisor pipeline; mock-only success is not acceptance evidence.
