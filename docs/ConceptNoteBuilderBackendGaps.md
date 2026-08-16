# Concept Note Builder Backend Gaps

**Status:** current merged backend audit

**Checked against:** merged backend baseline `a78f33eae` on August 17, 2026

## Purpose

This document replaces older CNB backend gap assumptions with a code-grounded view of what is implemented now, what is only partially implemented, and what is still missing for the Figma V1-V6 product surfaces.

It covers the merged CityCatalyst proxy layer, the Climate Advisor runtime, and the current CNB schema groundwork.

## Current baseline

The merged backend already provides the following foundation:

- authorized run start, run detail, and city-scoped run list;
- run-scoped PDF upload registration;
- CityCatalyst-owned PDF storage and OCR queueing;
- Climate Advisor-owned upload lifecycle persistence;
- authenticated Markdown delivery back into Climate Advisor;
- PDF-first context-bundle build and retry;
- optional GHGI and HIAP enrichment during context-bundle assembly;
- internal Climate Advisor chat access to the ready bundle and selected-source query tool.

The merged backend does **not** yet provide the full Figma workspace lifecycle. In particular, the following remain absent or incomplete:

- frontend-readable bundle and shared-context read APIs;
- post-start scope updates and setup-gap resolution contracts;
- document chapter lifecycle runtime APIs;
- CNB-specific SSE lifecycle events;
- validation and export runtime;
- rename, duplicate, delete, and archive run actions.

## Boundaries

### Runtime vs schema-only

- Runtime-implemented:
  - runs;
  - uploads;
  - Markdown ingest and retry;
  - context-bundle retry/build;
  - internal agent bundle access.

- Schema-only today:
  - `concept_note_chapters`;
  - `concept_note_chapter_revisions`;
  - `concept_note_evidence_links`;
  - `concept_note_gaps`;
  - `concept_note_matched_projects`;
  - `concept_note_exports`.

These CNB workspace tables exist in the independent CNB schema, but no current merged runtime routes or services use them for end-user CNB behavior.

### Internal-only vs frontend-readable

- Frontend-readable today:
  - `GET /api/v1/concept-notes?city_id=...`
  - `POST /api/v1/concept-notes/start`
  - `GET /api/v1/concept-notes/{runId}`
  - `POST /api/v1/concept-notes/{runId}/uploads`
  - `GET /api/v1/concept-notes/{runId}/uploads/{uploadId}`
  - `POST /api/v1/concept-notes/{runId}/uploads/{uploadId}/retry`
  - `POST /api/v1/concept-notes/{runId}/context-bundle/retry`

- Internal-only today:
  - `POST /v1/concept-notes/{run_id}/cc-context`
  - `POST /v1/concept-notes/{run_id}/uploads/{upload_id}/markdown`
  - `GET /api/v1/internal/ca/concept-note-uploads/{uploadId}/markdown`
  - Climate Advisor bundle loading through `load_agent_context(...)`
  - selected-source query tool registration for the CA chat agent

The most important missing boundary is that the full ready context bundle is available to Climate Advisor chat internally, but not to the frontend through a stable CityCatalyst proxy read contract.

## Capability matrix

| Figma surface | Current backend state | What exists now | Missing or partial contracts |
| --- | --- | --- | --- |
| V1 Dashboard | Partial | City-scoped run list, run detail, newest-first ordering, persisted name/scope/status/workflow step, resume identifiers | No shared city-context API, no rename/duplicate/delete/archive, no export status lookup, run lifecycle remains shallow |
| V2 / V2b New note modal | Partial | Authorized idempotent run start, nullable `project_id`/`funder_id`/`selected_funding_opportunity_id`, run-scoped upload creation | Name is still required, no post-start scope update API, no setup-gap contract, no upload SSE |
| V3 First-open workspace | Partial | Durable run detail, upload polling, PDF-first context build/retry, generic CA SSE/chat foundations | No frontend-readable context summary, no workflow-step event contract, no bundle delta event, no setup-gap payload |
| V4 Funder chosen / context assembled | Partial | Funder/opportunity validation exists; internal similar-project and reference-data foundations exist | No production runtime orchestration from scope selection to template loading, chapter initialization, persisted chosen similar projects, or frontend-readable bundle provenance |
| V5 Drafting | Missing at runtime | Internal bundle access and selected-source query tool exist for CA chat | No runtime chapter, revision, evidence, gap, lock, or streamed document update APIs |
| V5-S Structure | Missing at runtime | CNB workspace tables exist for chapter/revision groundwork | No reorder, add-chapter, delete/restore, lock/unlock, or revision-history runtime contracts |
| V5-C Context tab / panel | Partial | Internal bundle contains `selected_sources`, `cc_context`, `funder_context`, `similar_projects`, `document_context` | No frontend bundle read API, no shared-context cross-run API, no annotate/correct/promote/remove operations, no freshness/provenance ownership contract per item |
| V6 Export | Missing at runtime | `concept_note_exports` schema exists | No validation/preflight API, no DOCX/PDF generation API, no export artifact records surfaced to frontend, no retry, no exported run lifecycle |

## Current code-backed foundations

### Runs

- CityCatalyst proxy routes exist for list, start, and detail.
- Climate Advisor persists `concept_note_runs` with:
  - `name`
  - `city_id`
  - `project_id`
  - `funder_id`
  - `selected_funding_opportunity_id`
  - `status`
  - `workflow_step`
  - `context_summary`

Current limitation:

- run state is still effectively centered on `status="active"`;
- the initial workflow step is `assembling_context`;
- bundle success moves the run to `workflow_step="interviewing"`;
- there is no complete run lifecycle covering drafting, validation, export, archive, or failure summaries.

### Upload and OCR pipeline

- CityCatalyst owns source PDF storage and OCR queueing.
- Climate Advisor owns the authoritative run-scoped upload row and immutable Markdown pointer.
- Retry correctly distinguishes OCR retry from delivery retry.

Current limitation:

- upload lifecycle is pollable, not event-driven for the frontend.

### Context bundle

- The current production build path is PDF-first.
- At least one ready PDF is required.
- GHGI and HIAP are best-effort optional enrichments and do not block readiness.
- Bundle progress is persisted in `run.context_summary["context_bundle"]`.

Current limitation:

- current production build writes selected PDF source summaries plus optional `ghgi` and `hiap`;
- the broader Figma concepts of template chapters, user-confirmed interview answers, and finalized similar-project context are not yet exposed through a user-facing runtime flow.

### Similar projects and funder context

- Reviewed reference-data access and similar-project matching service code exists.
- Bundle schema already allows `funder_context` and `similar_projects`.

Current limitation:

- these are still internal foundations, not a merged end-user CNB route flow;
- there is no current CityCatalyst proxy contract to read or mutate these sections in the workspace UI.

### Workspace schema

The independent CNB schema already models the likely runtime objects for:

- chapters;
- chapter revisions;
- evidence links;
- gaps;
- matched projects;
- exports.

Current limitation:

- this is groundwork only;
- there is no merged runtime API surface for these objects yet.

## Missing and partial API contracts

### Highest priority

1. Frontend-readable context bundle read
   - Add a CityCatalyst proxy route and CA route for read-only retrieval of the current run bundle and bundle-progress summary.
   - This is the main blocker for V3, V4, and V5-C.

2. Post-start scope update contract
   - Add one scoped operation to set or update:
     - name;
     - project;
     - funder;
     - funding opportunity.
   - Return the updated run plus explicit setup gaps and blocked-next-step metadata.

3. CNB workflow lifecycle contract
   - Normalize durable workflow labels beyond `assembling_context` and `interviewing`.
   - Keep these labels backend-owned and reusable across dashboard, workspace, and export.

4. Document workspace runtime
   - Add runtime APIs for:
     - list/read chapters;
     - update chapter text;
     - revision history;
     - lock/unlock;
     - gap list and resolution;
     - evidence links;
     - reorder/add/delete/restore chapters.

### Next priority

5. Validation and export runtime
   - Preflight validation/readiness endpoint.
   - Export creation endpoint per format.
   - Export status/artifact lookup.
   - Retry for failed exports.

6. Run management actions
   - rename;
   - duplicate;
   - archive or delete.

7. Shared context and correction scope
   - distinguish run-only corrections from city-shared corrections;
   - expose provenance, freshness, and ownership per reusable item;
   - support promotion/removal of shared files and context items.

### Event priority

8. CNB-specific SSE events
   - `concept_note_upload_status`
   - `concept_note_workflow_step_changed`
   - `document_chapter_updated`
   - `document_chapter_ready`
   - `concept_note_context_bundle_ready` with user-facing delta payload

Current generic CA SSE is not enough to satisfy the Figma workspace lifecycle without CNB-specific payload contracts.

## Recommended API shape

The following contracts would close the largest product gaps without broad redesign.

### Read contracts

- `GET /api/v1/concept-notes/{runId}/context-bundle`
  - return:
    - run summary;
    - bundle progress;
    - `selected_sources`;
    - `cc_context`;
    - `funder_context`;
    - `similar_projects`;
    - `document_context`;
    - provenance/freshness metadata.

- `GET /api/v1/concept-notes/{runId}/workspace`
  - return:
    - chapters;
    - current revisions;
    - gaps;
    - locks;
    - export readiness summary.

### Mutating contracts

- `PATCH /api/v1/concept-notes/{runId}/scope`
  - update any combination of:
    - `name`
    - `project_id`
    - `funder_id`
    - `selected_funding_opportunity_id`
  - return explicit setup gaps and workflow implications.

- `PATCH /api/v1/concept-notes/{runId}/chapters/{chapterId}`
- `POST /api/v1/concept-notes/{runId}/chapters/reorder`
- `POST /api/v1/concept-notes/{runId}/chapters`
- `POST /api/v1/concept-notes/{runId}/chapters/{chapterId}/delete`
- `POST /api/v1/concept-notes/{runId}/chapters/{chapterId}/restore`
- `POST /api/v1/concept-notes/{runId}/chapters/{chapterId}/lock`
- `POST /api/v1/concept-notes/{runId}/chapters/{chapterId}/unlock`

- `POST /api/v1/concept-notes/{runId}/validate`
- `POST /api/v1/concept-notes/{runId}/exports`
- `GET /api/v1/concept-notes/{runId}/exports`
- `POST /api/v1/concept-notes/{runId}/exports/{exportId}/retry`

- `PATCH /api/v1/concept-notes/{runId}`
  - for rename only if a dedicated rename route is not preferred.

- `POST /api/v1/concept-notes/{runId}/duplicate`
- `POST /api/v1/concept-notes/{runId}/archive`

## Practical implementation order

1. Add frontend-readable context-bundle read.
2. Add post-start scope update plus setup-gap response.
3. Normalize workflow-step and progress contract.
4. Add document workspace read/write runtime on top of the existing CNB schema.
5. Add validation and export runtime.
6. Add rename/duplicate/archive actions.
7. Add CNB-specific SSE events and migrate polling surfaces where appropriate.

## Decision guardrails

- Treat the existing workspace tables as groundwork, not proof of runtime support.
- Do not expose internal-only CA chat bundle structures to the frontend unchanged; wrap them in a stable UI-facing contract.
- Do not let the frontend infer lifecycle from timers or local state when backend state is available.
- Do not treat the presence of `funder_context` or `similar_projects` fields in the bundle schema as evidence that the V4 runtime orchestration is complete.
- Keep the distinction explicit between:
  - CityCatalyst-owned files, OCR, and permissions;
  - Climate Advisor-owned workflow state and bundle persistence;
  - CNB reference-schema groundwork that is not yet wired into runtime.
