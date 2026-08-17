# Concept Note Builder Frontend Implementation Map

**Status:** implementation planning

**Design source:** [Agentic Flow - Concept Note Builder, CNB v4 First Handoff](https://www.figma.com/design/KwCeqEGCQomYRfxkcp9HKK/Agentic-Flow---Concept-Note-Builder?node-id=4678-8838&t=ZpFsjpktuow5PHwh-1)

**Frontend ticket:** [CC-604 — Implement the Concept Note Builder frontend](https://linear.app/openearth/issue/CC-604/cnb-implement-the-concept-note-builder-frontend)

**Repository baseline checked:** `origin/develop`, 2026-08-06

## Purpose

This document converts the approved CNB v4 Figma journey into buildable frontend surfaces and maps each surface to the backend contracts that exist today or are still missing.

The design contains eight named frames, but they should not become eight independent routes. The product needs:

- two routes;
- one creation modal;
- one persistent workspace with three tabs and several lifecycle states;
- one export sheet;
- one reusable context panel.

The workspace is explicitly not a wizard. Its regions remain stable while the run, context, chapters, gaps, and export readiness change.

## Route and surface map

| Figma frame | Product surface        | Proposed implementation                                            | Backend readiness                            |
| ----------- | ---------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| V1          | Concept-note dashboard | `/[lng]/cities/[cityId]/concept-notes`                             | Blocked by run listing and shared context    |
| V2 / V2b    | New concept note       | Modal over the dashboard                                           | Mostly buildable                             |
| V3          | First-open workspace   | `/[lng]/cities/[cityId]/concept-notes/[runId]`, pre-template state | Partially blocked                            |
| V4          | Funder chosen          | Same workspace after context and template arrival                  | Blocked by context and document lifecycle    |
| V5          | Drafting               | Default Draft Preview workspace tab                                | Blocked by document lifecycle                |
| V5-S        | Structure              | Workspace tab                                                      | Blocked by document lifecycle                |
| V5-C        | Context                | Workspace tab and reusable dashboard panel                         | Blocked by shared context and read contracts |
| V6          | Export                 | Sheet over the workspace                                           | Blocked by validation and export services    |

## Shared frontend structure

The final implementation should converge on these product-level components:

- `ConceptNotesDashboard`
- `NewConceptNoteModal`
- `ConceptNoteWorkspace`
- `ClimaConversationRail`
- `RunStatusIndicator`
- `ContextPanel`
- `ContextTile`
- `UploadCard`
- `DraftPreview`
- `ChapterOutlineRow`
- `StructureTab`
- `ContextTab`
- `GapIndicator`
- `CitationChip`
- `ExportSheet`

The dashboard context panel and workspace Context tab should share data contracts and presentational components rather than becoming separate implementations.

## 1. V1 — Concept-note dashboard

### User outcome

The city user sees every concept note for the current city, understands its progress, resumes the correct run, and can inspect the shared city context reused by new notes.

### Frontend responsibilities

- Render empty, loading, error, and populated states.
- Render the shared-context strip:
  - city data;
  - GHGI;
  - CCRA;
  - HIAP;
  - shared files.
- Render note cards with:
  - display name;
  - funder or opportunity summary;
  - lifecycle status;
  - progress summary;
  - last update time.
- Support New concept note, Open context, Resume, Duplicate, Export, and Delete actions.
- Navigate Resume to the durable run identifier returned by the backend.

### Backend available today

- Authorized single-run detail exists.
- `concept_note_runs` stores name, city, project/funder scope, status, workflow step, and timestamps.
- Run-scoped CityCatalyst context assembly exists.

### Backend still missing

- [CC-606](https://linear.app/openearth/issue/CC-606/cnb-add-authorized-city-concept-note-run-listing-apis): authorized city run listing, deterministic newest-first ordering, progress fields, and resume identifiers.
- [CC-607](https://linear.app/openearth/issue/CC-607/cnb-reuse-shared-city-context-across-concept-note-runs): shared city context, provenance, freshness, permissions, refresh, and invalidation.
- Duplicate-run endpoint.
- Delete/archive-run endpoint.
- Rename endpoint.
- Export status and export artifact lookup.
- Real lifecycle values for Draft, Exported, and terminal failure states. Thin and grounded context builds now move active runs from `assembling_context` to `interviewing`.

## 2. V2 / V2b — New-concept-note modal

### User outcome

The user starts with whatever information is already available. Every skipped field becomes something Clima can resolve later in the workspace conversation.

### Inputs

- Name — optional in the design.
- CityCatalyst project — optional.
- Funder and funding opportunity — optional.
- Initial PDFs — optional.
- City — derived from the current workspace and not editable in this modal.

### Submission sequence

1. Create a durable Climate Advisor chat thread.
2. Create the durable run with that `thread_id`.
3. Receive `run_id` and queue its thin-context build.
4. Upload any selected files against that run.
5. Open the workspace immediately and allow chat.
6. Continue upload/context preparation in the background.

Uploads must never be created before the durable run because they are run-scoped.

### Backend available today

- `POST /api/v1/concept-notes/start`.
- Idempotent, authorized run creation.
- Nullable `project_id`, `funder_id`, and selected funding record.
- `GET /api/v1/concept-notes/{runId}`.
- `POST /api/v1/concept-notes/{runId}/uploads`.
- Upload status polling and retry endpoints.
- PDF validation, S3 storage, OCR processing, and durable Markdown-pointer delivery.

### Backend still missing or mismatched

- The backend requires a non-empty name, while the design allows a blank name that Clima fills later.
- No rename operation exists.
- No post-start `set_scope` contract exists for selecting project/funder/opportunity in chat.
- No structured setup-gap contract tells Clima which scope values are unset and what each missing value blocks.
- Upload state is pollable, but there is no user-facing upload-status SSE event.

## 3. V3 — First-open workspace

### User outcome

The run opens immediately, shows the context already known from CityCatalyst, displays upload/preparation progress, and lets Clima resolve missing setup values conversationally.

### Frontend state

- Stable workspace shell.
- Clima conversation rail.
- Pre-template note shell.
- No invented chapter outline before the funder template is available.
- Setup-gap card with a grounded “why I’m asking” explanation and quick replies.
- Upload/context preparation events in the conversation timeline.
- Setup in progress status.

### Backend available today

- Durable run detail.
- Run-scoped uploads with queued, processing, ready, and failed states.
- CityCatalyst context assembly for accessible city data.
- Existing generic chat and SSE foundations.
- Run-scoped thread binding, persisted chat history, and streamed CNB conversation.
- A ready typed thin-context mode when no source is attached; later uploads rebuild the run as grounded context.

### Backend still missing

- Setup-gap values in the always-on agent context.
- Post-start scope update operation.
- Frontend-readable context preparation summary.
- Workflow-step transition contract.
- `concept_note_workflow_step_changed` SSE event.
- Bundle reassembly delta event when uploads or scope change.

## 4. V4 — Funder chosen and context assembled

### User outcome

After the funder/opportunity is selected, the real funder template becomes the chapter structure, initial context is assembled, and Clima explains what is ready and what information is still missing.

### Frontend state

- Template chapters replace the pre-template placeholder.
- Available chapters may be pre-drafted from trusted context.
- Missing information appears as explicit gaps rather than invented content.
- Context assembled and preparation states are visible.
- Funder profile and similar funded projects are shown as sources.

### Backend available today

- Funder and funding-opportunity reference validation.
- Funder research and similar-project matching foundations.
- Run-scoped CityCatalyst context assembly.
- Run-scoped upload persistence.

### Backend still missing

- [CC-513](https://linear.app/openearth/issue/CC-513/combine-all-datasources-into-a-context-bundle): production composition of city context, uploads, funder data, and similar projects into the run bundle.
- Persisted selection of source uploads and similar projects.
- Production orchestration from funder selection to template loading and chapter initialization.
- Frontend-readable preparation progress and provenance.
- Bundle reassembly event describing what changed.

## 5. V5 — Drafting workspace

### User outcome

The user interviews with Clima while reading the full concept note. Every factual claim is traceable, every missing fact becomes a grounded question, and document structure remains visible.

### Frontend responsibilities

- Preserve the two-rail workspace layout.
- Keep Draft Preview, Structure, and Context tabs available.
- Render every chapter, including empty chapters.
- Stream chapter text without hiding unfinished sections.
- Show independent chapter status, gap, and lock signals.
- Show provenance pills and source details.
- Support grounded quick replies and “not applicable” with a stored reason.
- Preserve the user’s own edits and show proposed changes to locked content.

### Backend still missing

There are no production CNB tables, repositories, routes, or services for:

- chapters;
- chapter revisions;
- chapter ordering;
- user locks;
- gaps and severity;
- evidence links and provenance;
- soft deletion and restoration;
- streamed chapter updates;
- chapter-ready transitions.

The design assumes the following document operations, but PR #2905 currently documents them without implementing runtime contracts:

- update chapter;
- link evidence;
- flag and resolve gap;
- mark chapter ready;
- propose edits to locked content;
- delete and restore chapter;
- add a custom chapter.

## 6. V5-S — Structure tab

### Frontend responsibilities

- List all template chapters.
- Drag to reorder.
- Add a custom chapter.
- Lock and unlock user-owned content.
- Soft-delete and restore chapters.
- Display required/template constraints.
- Preserve revision history for every structural operation.

### Backend still missing

- Persisted chapter order.
- Reorder endpoint/tool.
- Add-custom-chapter endpoint/tool.
- Soft-delete and restore operations.
- Template-order validation.
- Revision/audit records for structural changes.

This work needs a dedicated backend document-lifecycle ticket; it is not covered by the completed run/upload tickets.

## 7. V5-C — Context tab and dashboard Context panel

### User outcome

The user can inspect what Clima knows, where it came from, how fresh it is, and whether a correction applies only to this note or should affect future notes.

### Context groups

- CityCatalyst city data.
- GHGI inventory summary.
- CCRA hazards.
- HIAP status and results.
- Funder profile.
- Similar funded projects.
- Uploaded files.
- User-confirmed interview answers.

### Backend available today

- Run-scoped CityCatalyst context assembly.
- GHGI/CCRA/HIAP capability integration.
- Upload metadata and Markdown pointers.
- Similar-project matching logic.

### Backend still missing

- Complete context-bundle read contract for the frontend.
- CC-607 shared context across runs.
- CC-513 production bundle composition.
- Run-scoped `context_annotate`/confirm-or-correct operation.
- Provenance, freshness, ownership, and permissions for every reusable item.
- Deterministic refresh and invalidation when source data changes.
- Shared-file promotion and removal controls.
- A clear contract distinguishing run-only corrections from city-shared corrections.

## 8. V6 — Export sheet

### User outcome

The user understands remaining warnings, can jump back to affected chapters, and can export an imperfect draft when deadlines require it.

### Frontend responsibilities

- Open as a sheet over the current workspace.
- Show non-blocking preflight findings.
- Deep-link findings to the relevant chapter.
- Offer independent DOCX and PDF exports.
- Display per-format progress, success, failure, and retry.
- Support Review full text, Go back, and Export anyway.
- Return to the dashboard with an Exported state after success.

### Backend still missing

- [CC-605](https://linear.app/openearth/issue/CC-605/cnb-add-final-chapter-validation-and-ready-state-verification): persisted validation status, checks, actionable findings, validated revision, timestamp, stale-revision detection, and revalidation.
- DOCX artifact generation.
- PDF artifact generation.
- Persisted export attempts and artifact records.
- Per-format failure and retry.
- Exported lifecycle transition for the run listing.
- Final product decision on whether evidence links travel inside exported documents.

Export generation and persistence need a dedicated implementation ticket beyond CC-605.

## Cross-cutting event requirements

Polling can temporarily support uploads, but the complete design needs these user-visible event families:

| Event                                                     | Purpose                                                                           | Current state                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `concept_note_upload_status`                              | Per-upload queued, processing, ready, and failed lifecycle                        | Missing; polling exists                                                   |
| `concept_note_workflow_step_changed`                      | Move the shell between assembling, interviewing, drafting, editing, and completed | Missing                                                                   |
| `document_chapter_updated`                                | Stream draft/edit changes into the preview                                        | Missing for CNB runtime                                                   |
| `document_chapter_ready`                                  | Keep outline readiness synchronized                                               | Missing                                                                   |
| `concept_note_context_bundle_ready` with reassembly delta | Explain which sources changed after upload or scope updates                       | Generic signal exists in matching code; production UI contract is missing |

Frontend state must be derived from backend contracts. It must not infer durable readiness from timers, browser-local state, or optimistic labels.

## Current backend foundation

The following foundations are merged into `origin/develop`:

- [CC-608](https://linear.app/openearth/issue/CC-608/cnb-implement-concept-note-run-start-and-persistence): authorized, idempotent run start and single-run detail.
- [CC-609](https://linear.app/openearth/issue/CC-609/cnb-connect-run-scoped-uploads-to-pdf-ocr-and-persistence): run-scoped uploads, PDF OCR, durable lifecycle, retry, and Markdown pointers.
- [CC-556](https://linear.app/openearth/issue/CC-556/integrate-cc-data-to-the-cnb-bundle): CityCatalyst data assembly into the run context bundle.
- [CC-510](https://linear.app/openearth/issue/CC-510/build-search-pipeline-for-funder-search-for-cnb): funder search foundation.
- [CC-512](https://linear.app/openearth/issue/CC-512/similar-project-search): similar-project matching foundation.

These foundations are necessary but do not yet form the complete user-facing CNB workflow.

## Open backend work by existing ticket

| Ticket                                                                                                            | Status checked 2026-08-06 | Required by                                       |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| [CC-605](https://linear.app/openearth/issue/CC-605/cnb-add-final-chapter-validation-and-ready-state-verification) | Todo                      | Chapter readiness and export preflight            |
| [CC-606](https://linear.app/openearth/issue/CC-606/cnb-add-authorized-city-concept-note-run-listing-apis)         | Todo                      | Dashboard and resume                              |
| [CC-607](https://linear.app/openearth/issue/CC-607/cnb-reuse-shared-city-context-across-concept-note-runs)        | Todo                      | Dashboard Context panel and workspace Context tab |
| [CC-513](https://linear.app/openearth/issue/CC-513/combine-all-datasources-into-a-context-bundle)                 | Todo                      | Funder-chosen, drafting, and Context states       |

## Backend gaps without a complete implementation ticket

- Chapter/revision/gap/evidence persistence and APIs.
- Template loading and chapter initialization.
- Post-start scope updates and setup-gap context.
- Rename, duplicate, and delete/archive operations.
- Context annotations and correction scope.
- CNB-specific SSE lifecycle events.
- DOCX/PDF export generation, persistence, and retry.
- Applicant-eligibility validation if the proposed eligibility surface remains in scope.

These gaps should be ticketed before the frontend is expected to deliver real end-to-end behavior for V4–V6.

## Recommended implementation order

1. Update the CC-604 branch with the merged run/upload foundation from `origin/develop`.
2. Define shared TypeScript contracts and the workspace shell.
3. Implement V2 creation modal using the real start/upload endpoints.
4. Implement V3 pre-template workspace with real polling and explicit unsupported states.
5. Deliver CC-606 and build the V1 dashboard against the real list contract.
6. Deliver CC-513 and CC-607, then build the shared Context panel and V5-C tab.
7. Implement the chapter/revision/gap/evidence backend and then V4, V5, and V5-S.
8. Deliver CC-605 plus export services and then implement V6.
9. Add the CNB SSE events and replace temporary polling where appropriate.
10. Add component, integration, and end-to-end coverage for creation, resume, upload, context preparation, drafting, structure, validation, and export.

## Implementation guardrails

- Do not implement the workspace as a wizard.
- Do not hide empty template chapters.
- Treat chapter status, gap, and user lock as independent values.
- Do not invent content when no source exists; surface a grounded question.
- Do not mark context or chapters ready before the backend confirms readiness.
- Preserve upload and workflow state across reload and resume.
- Keep export warnings non-blocking while persisting warnings and attempts.
- Use the same backend-derived lifecycle labels across the dashboard, workspace, resume flow, and export result.
- Keep run-specific drafts, gaps, uploads, and generated content isolated from city-shared context unless a contract explicitly promotes an item.
