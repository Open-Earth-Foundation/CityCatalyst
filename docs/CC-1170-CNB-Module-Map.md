# CC-1170: CNB module and prompt map

Companion to [CC-1170-CNB-Modularization.md](CC-1170-CNB-Modularization.md). Snapshot: `develop` at `2ac6ac166` (November 9, 2026). Pending PRs #3350, #3295 and #3401 are not included.

## How to read this map

Tags:

- `core`: should become a shared Clima capability that main chat, Stationary Energy, HIAP, CCRA and MEED can reuse.
- `cnb`: stays specific to concept notes.
- `unclear`: mixed, or needs a team decision. The reason is in the cell.

Boundaries (from the proposal):

- B1: Interaction and result components
- B2: Tool composition and execution
- B3: Context and authorization
- B4: Source and evidence
- B5: Proposal, review and application

Proposed target paths are a packaging proposal for stage 6 of the proposal, not a precondition:

- Climate Advisor shared code: `climate-advisor/service/app/{services,tools,models,persistence}/clima/<capability>/`
- Frontend shared code: `app/src/components/Clima/<capability>/`. `Clima/stream/` holds SSE and tool-result parsing plus message state.
- Prompts: `prompts/core.md` (core), `prompts/clima/<capability>.md` (shared capability layer), `prompts/cnb/*.md` (CNB).
- `(stays)`: the file keeps its current location.
- `(keep; shared)`: the file is already outside CNB folders. Remove the CNB coupling in place.

Capability names: `choices`, `visuals`, `sources`, `collection` (guided questions, gap answers), `review` (proposals, edit review, apply), `runtime` (tool composition, execution, streaming), `context` (scoped context, authorization), `export`, `lifecycle` (runs, status), and `chat` (the frontend transcript and composer only).

Path prefixes: `ca/` = `climate-advisor/service/app/`, `P/` = `climate-advisor/prompts/`.

Totals:

| Area | Files | core | cnb | unclear |
|---|---|---|---|---|
| Climate Advisor backend | 112 | 41 | 56 | 15 |
| Frontend, CC backend and API routes | 134 | 44 | 61 | 29 |

The tags come from imports, signatures and targeted reads, not from a line-by-line review of every large file.

## Generic agentic primitives

The ticket names seven candidates:

- **Run and lifecycle: core after decoupling.**
  - `ConceptNoteRun` (`ca/models/db/concept_note.py:25`) mixes generic owner, city, thread and status fields with `funder_id`, `custom_template` and `workflow_step`.
  - Stationary Energy keeps a separate `stationary_energy_draft_runs` table with almost the same core columns.
  - Share one run envelope: identity, scope, status, step, trace and idempotency key. Duplicate and delete stay in CNB.
- **Context bundle and provenance: core after decoupling.**
  - `load_agent_context` and `load_query_source` (`ca/persistence/concept_notes/context_bundle.py`) authorize through `_require_owned_run` and gate on `run.workflow_step`.
  - The provenance contracts (`SourceExcerpt`, `SelectedSource` in `ca/models/cnb/context_bundle.py`) do not depend on the resource.
- **Source and upload analysis: core now for analysis; core after decoupling for registration and the tool.**
  - `analyze_document` and `query_document` (`ca/services/cnb/source_analysis.py`) take only an upload id, a label and pages. `funder_document.py` already reuses them outside chat.
  - Registration is tied to the run through the `concept_note_uploads.run_id` foreign key.
- **Chat with edit proposals and review: core after decoupling.**
  - The guarantees are generic: an idempotency key with a fingerprint, and a base-revision check before apply (`ca/persistence/concept_notes/edits.py`).
  - The service and tool require `ConceptNoteRun`, and the planner works on chapter snapshots.
- **Validation (completeness and consistency): core after decoupling, low priority.** The two passes are a generic pattern, but the inputs are one chapter plus a funder template. There is no second consumer.
- **Document export: core after decoupling, frontend only.**
  - The CA backend has no export code. `exportConceptNote` (`app/src/components/ConceptNoteWorkspace/concept-note-export.ts`) builds DOCX and PDF from chapters.
  - The `concept_note_exports` table is never written.
- **Progress and streaming: core now.**
  - The progress sink in `ca/utils/cnb_progress.py` does not depend on CNB, and `streaming_handler.py` applies it to every chat stream. Only the stage vocabulary (`chapter_completed`, `chapter_title`) is CNB.
  - `AgentService` and `StreamingHandler` are shared, but they branch on `concept_note_run_id`.

## Climate Advisor backend

### Services

| Current path | Purpose | Tag | Boundary | Proposed target | Coupling to remove |
|---|---|---|---|---|---|
| ca/services/cnb/__init__.py | Package marker | cnb | — | (stays) | — |
| ca/services/cnb/application_context.py | Funder, programme and template context; template fingerprint | cnb | B3 | (stays) | — |
| ca/services/cnb/chapter_drafting.py | Sequential chapter drafting, gaps, leases, revalidation | cnb | B5 | (stays) | `_gather_gap_evidence` should call Clima sources |
| ca/services/cnb/chapter_validation.py | Two-pass completeness and consistency check of one chapter | unclear: generic check, template-chapter inputs | B5 | ca/services/clima/review/ | ApplicationContextTemplate, chapter models, `cnb_chapter_validation_*` prompts |
| ca/services/cnb/chapter_validation_workflow.py | Authorized persistence wrapper for validation | cnb | B3 | (stays) | — |
| ca/services/cnb/chat_readiness.py | Reject chat turns while the source bundle is not ready | cnb | B3 | (stays) | the readiness hook belongs in runtime |
| ca/services/cnb/chat_retry.py | Detect retried turns so they are not saved twice | core | B2 | ca/services/clima/runtime/ | option key `concept_note_turn` |
| ca/services/cnb/chat_suggestions.py | Two optional next-question suggestions | core | B1 | ca/services/clima/choices/ | reads ConceptNoteRun and the draft; `cnb_chat_suggestions` prompt |
| ca/services/cnb/context_bundle.py | Build and refresh source + city context; reconcile jobs | core | B3 | ca/services/clima/context/ | jobs keyed by run_id; imports the chapter draft service |
| ca/services/cnb/draft_overview.py | Hidden first chat turn summarising a draft | cnb | B2 | (stays) | — |
| ca/services/cnb/edit_planner.py | Agentic search/replace planner with semantic review | unclear: proposal producer may vary per resource | B5 | ca/services/clima/review/ | chapter catalogue, `[Information needed]` markers, CNB prompts |
| ca/services/cnb/edit_session.py | Snapshot-bound search/replace proposal session | unclear: engine shaped around chapter snapshots | B5 | ca/services/clima/review/ | WorkspaceChapterSnapshot; protected-marker rules |
| ca/services/cnb/edit_validation.py | Validate anchored edits, markers, provenance | unclear: provenance generic, markers CNB | B5 | ca/services/clima/review/ | EDIT_CONTEXT_LABELS (city/ghgi/hiap); gap markers |
| ca/services/cnb/edits.py | Proposal lifecycle: propose, refine, apply, reject, stale | core | B5 | ca/services/clima/review/ | requires ConceptNoteRun; writes through the workspace repository |
| ca/services/cnb/funder_creation.py | Import a funder or template from upload or input | cnb | B4 | (stays) | — |
| ca/services/cnb/funder_document.py | Extract funder/template drafts; verify quotes | cnb | B4 | (stays) | already reuses source_analysis: a useful reuse test |
| ca/services/cnb/funder_fields.py | Normalize catalogue and template fields | cnb | — | (stays) | — |
| ca/services/cnb/funder_identity_match.py | LLM canonical-funder matching (offline) | cnb | — | (stays) | — |
| ca/services/cnb/funding_catalogue.py | Browse the funding catalogue | cnb | — | (stays) | — |
| ca/services/cnb/funding_references.py | Validate run funding ids against reference data | cnb | B3 | (stays) | — |
| ca/services/cnb/funding_selection.py | Save funding choice; invalidate proposals and review | cnb | — | (stays) | — |
| ca/services/cnb/project_tag_normalizer.py | Deterministic project-tag normalization | cnb | — | (stays) | — |
| ca/services/cnb/reference_data_client.py | Typed reads of CNB reference data | cnb | — | (stays) | — |
| ca/services/cnb/research_agent.py | Firecrawl funding-research agent loop (offline) | cnb | — | (stays) | — |
| ca/services/cnb/research_artifacts.py | Offline research review artifacts | cnb | — | (stays) | — |
| ca/services/cnb/research_bundle.py | Assemble validated research bundles | cnb | — | (stays) | — |
| ca/services/cnb/research_prompt.py | Strip and restore join keys at the model boundary | cnb | — | (stays) | — |
| ca/services/cnb/research_service.py | Orchestrate one offline research run | cnb | — | (stays) | — |
| ca/services/cnb/review_import.py | Import reviewed research pairs and funded projects | cnb | — | (stays) | — |
| ca/services/cnb/similar_project_review.py | Similar-project inputs from reviewed research | cnb | — | (stays) | — |
| ca/services/cnb/similar_project_search.py | Similar-project retrieval and LLM selection | cnb | — | (stays) | — |
| ca/services/cnb/source_analysis.py | Verify artifacts; map, summarise and question-read documents | core | B4 | ca/services/clima/sources/ | ConceptNote artifact/format types; `cnb_source_*` settings and prompts; cnb_progress |
| ca/services/cnb/source_impact_review.py | Select chapters affected by new sources | cnb | B4 | (stays) | — |
| ca/services/cnb/ui_context.py | Workspace UI state; gap list with G# handles | unclear: gap list reusable, UI state CNB | B5 | ca/services/clima/collection/ | `build_gap_list` takes chapter snapshots; `cnb-desktop-v1` |
| ca/services/cnb/visual_context.py | Validate unverified visual annotations from artifacts | core | B4 | ca/services/clima/sources/ | schema version imported from models/cnb |
| ca/services/concept_note_city_context.py | Load GHGI and HIAP city context from CityCatalyst | core | B3 | ca/services/clima/context/ | contracts in models/cnb; CNB naming |
| ca/services/concept_note_lifecycle.py | Rename, duplicate, delete runs; per-run threads | unclear: thread-per-resource generic, copy/delete CNB | B3 | ca/services/clima/lifecycle/ | chat start/list/activate typed on ConceptNoteRun |
| ca/services/concept_note_runs.py | Start/list runs; user and city authorization | unclear: CC user/city auth generic, run creation CNB | B3 | ca/services/clima/context/ | `get_authorized_run` returns ConceptNoteRun; private auth helpers |
| ca/services/agent_service.py | Build the agent: prompt, model, tool composition | core | B2 | (keep; shared) | hardcoded CNB tool branch; `cnb_chat` prompt; Responses model and `stop_at_tool_names` only for CNB |
| ca/services/openrouter_client.py | Shared OpenRouter client options | core | B2 | (keep; shared) | — |
| ca/services/citycatalyst_client.py | HTTP client for CityCatalyst | core | B3 | (keep; shared) | concept-note markdown/structured/delete methods and size settings |

### Tools

| Current path | Purpose | Tag | Boundary | Proposed target | Coupling to remove |
|---|---|---|---|---|---|
| ca/tools/concept_note_question.py | Present 2–6 answer choices and end the turn | core | B1 | ca/tools/clima/choices/ | name `concept_note_ask_question` hardcoded in streaming_events.py:264 and agent_service.py |
| ca/tools/concept_note_visual_tools.py | Emit a sandboxed HTML visual in chat | core | B1 | ca/tools/clima/visuals/ | action `concept_note.visual.render`; `cnb_render_visual_enabled` flag |
| ca/tools/concept_note_gap_tools.py | Read-only gap list for one run | core | B5 | ca/tools/clima/collection/ | bound to run_id; chapter_position filter |
| ca/tools/concept_note_help_tools.py | CNB UI guide, draft and export state, files | cnb | B3 | (stays) | — |
| ca/tools/concept_note_source_tools.py | Query one selected source for cited evidence | core | B4 | ca/tools/clima/sources/ | resolves run_id + source_index; CNB-named CC endpoints |
| ca/tools/concept_note_edit_tools.py | Chat tool that creates edit proposals | core | B5 | ca/tools/clima/review/ | authorizes via `get_authorized_run` |
| ca/tools/concept_note_draft_tools.py | Planner tools: search/read chapters, propose edits/structure | unclear: text tools generic, `propose_structure` chapter-specific | B5 | ca/tools/clima/review/ | chapter positions, StructureProposal, `emit_cnb_progress` |
| ca/tools/concept_note_source_impact_tools.py | Strict chapter-number output tool | cnb | B4 | (stays) | — |
| ca/tools/concept_note_ui_labels.py | Localized CNB control labels | cnb | B1 | (stays) | — |
| ca/tools/concept_note_ui_guide.txt | CNB navigation guide template | cnb | B1 | (stays) | — |

### Routes

| Current path | Purpose | Tag | Boundary | Proposed target | Coupling to remove |
|---|---|---|---|---|---|
| ca/routes/concept_note_runs.py | Run CRUD, chats, suggestions, funding, draft, confirm | cnb | B3 | (stays) | suggestions endpoint should call Clima choices |
| ca/routes/concept_note_edits.py | Propose, apply, reject, refine; structure get/put | unclear: review API reusable, paths run-scoped | B5 | (stays) | `/concept-notes/{run_id}/edits`; AuthorizedRun |
| ca/routes/concept_note_markdown.py | Upload registration, markdown ingest, retry | unclear: ingest generic, keyed by run_id | B4 | (stays) | MAX_UPLOADS_PER_RUN; run-owned uploads |
| ca/routes/concept_note_context_bundle.py | Retry/refresh bundle; select inventory | cnb | B3 | (stays) | — |
| ca/routes/concept_note_city_context.py | Build CC context into the run bundle | cnb | B3 | (stays) | — |
| ca/routes/concept_note_chapter_validation.py | Validate one chapter revision | cnb | B5 | (stays) | — |
| ca/routes/concept_note_funders.py | Funder import and create | cnb | — | (stays) | — |
| ca/routes/messages.py | Create a message and stream the SSE reply | core | B2 | (keep; shared) | inline CNB readiness, draft-overview claim, retry |
| ca/routes/dependencies.py | AuthorizedRun dependency | cnb | B3 | (stays) | — |

### Models

| Current path | Purpose | Tag | Boundary | Proposed target | Coupling to remove |
|---|---|---|---|---|---|
| ca/models/cnb/__init__.py | Package marker | cnb | — | (stays) | — |
| ca/models/cnb/chapter_content.py | Chapter title/description contract | cnb | — | (stays) | — |
| ca/models/cnb/chat_suggestions.py | Suggestion request/output contracts | core | B1 | ca/models/clima/choices/ | `tab` literal draft/structure/context |
| ca/models/cnb/concept_note_application_context.py | Funder, opportunity and template contracts | cnb | — | (stays) | — |
| ca/models/cnb/concept_note_chapter_validation.py | Validation request and finding contracts | unclear: follows the validation decision | B5 | ca/models/clima/review/ | chapter/template fields |
| ca/models/cnb/concept_note_city_context.py | GHGI/HIAP context contracts | core | B3 | ca/models/clima/context/ | ConceptNote wrapper types |
| ca/models/cnb/concept_note_draft.py | Drafting, gap and validation response contracts | unclear: gap contracts reusable | B5 | ca/models/clima/collection/ (gap parts) | gap models inside draft output |
| ca/models/cnb/concept_note_edits.py | Edit proposal, change, notice and apply contracts | core | B5 | ca/models/clima/review/ | EDIT_CONTEXT_LABELS; changes keyed by chapter |
| ca/models/cnb/concept_note_markdown.py | Upload and ingest contracts; schema version | core | B4 | ca/models/clima/sources/ | MAX_UPLOADS_PER_RUN; run-scoped naming |
| ca/models/cnb/concept_note_runs.py | Run start/list/rename contracts | cnb | — | (stays) | — |
| ca/models/cnb/concept_note_structure.py | Chapter structure state and proposals | cnb | B5 | (stays) | — |
| ca/models/cnb/context_bundle.py | Source excerpt, selection and query contracts | core | B4 | ca/models/clima/sources/ | bundle aggregate; imports services.cnb.visual_context |
| ca/models/cnb/funder_creation.py | Funder import contracts | cnb | — | (stays) | — |
| ca/models/cnb/funding_catalogue.py | Funding catalogue contracts | cnb | — | (stays) | — |
| ca/models/cnb/research.py | Offline research contracts | cnb | — | (stays) | — |
| ca/models/cnb/research_prompt.py | Identifier-free research contracts | cnb | — | (stays) | — |
| ca/models/cnb/similar_projects.py | Similar-project contracts | cnb | — | (stays) | — |
| ca/models/cnb/source_prompt.py | Identifier-free source-reader output contracts | core | B4 | ca/models/clima/sources/ | — |
| ca/models/db/concept_note.py | ORM: runs, context bundles, uploads (CA DB) | unclear: uploads generic, run row CNB | B3 | (stays) | `ConceptNoteUpload.run_id` foreign key |
| ca/models/db/cnb_edit.py | ORM: edit proposals and applications (CNB DB) | core | B5 | ca/models/clima/review/ | run_id without foreign key; revisions keyed by chapter |
| ca/models/db/cnb_workspace.py | ORM: chapters, revisions, validations, gaps, evidence, exports | unclear: gap/evidence generic, chapters CNB | B5 | (stays) | gaps/evidence keyed by chapter_id |
| ca/models/db/cnb_reference.py | ORM: funders, opportunities, templates, projects | cnb | — | (stays) | — |
| ca/models/db/thread.py | ORM: chat thread with optional run link | core | B3 | (keep; shared) | `concept_note_run_id` should become a generic resource binding |

### Persistence

| Current path | Purpose | Tag | Boundary | Proposed target | Coupling to remove |
|---|---|---|---|---|---|
| ca/persistence/concept_notes/__init__.py | Package marker | cnb | — | (stays) | — |
| ca/persistence/concept_notes/city_context.py | Merge CC context into the bundle | cnb | B3 | (stays) | — |
| ca/persistence/concept_notes/context_bundle.py | Atomic bundle builds; authorized agent context | core | B3 | ca/persistence/clima/context/ | `_require_owned_run`; `workflow_step` gate; run JSON |
| ca/persistence/concept_notes/edits.py | Idempotent proposal store; revision-checked apply | core | B5 | ca/persistence/clima/review/ | `lock_run`; chapter revisions |
| ca/persistence/concept_notes/gaps.py | Gap snapshots, resolutions, reconciliation | core | B5 | ca/persistence/clima/collection/ | keyed by chapter_id; consumes draft output |
| ca/persistence/concept_notes/markdown.py | Upload registration and ingest status | core | B4 | ca/persistence/clima/sources/ | `ConceptNoteUpload.run_id`; `_require_owned_run` |
| ca/persistence/concept_notes/runs.py | Run create/get/list; bind thread | cnb | — | (stays) | — |
| ca/persistence/concept_notes/source_revalidation.py | Source-revalidation jobs on run JSON | cnb | B4 | (stays) | — |
| ca/persistence/concept_notes/structure.py | Validate and save chapter structure | cnb | B5 | (stays) | — |
| ca/persistence/concept_notes/workspace.py | Chapter workspace: template chapters, content, confirm | cnb | B5 | (stays) | the CNB document adapter that review calls |
| ca/persistence/concept_notes/workspace_queries.py | Workspace row queries | cnb | — | (stays) | — |
| ca/persistence/concept_notes/workspace_rows.py | Bulk copy/delete of workspace rows | cnb | — | (stays) | — |
| ca/persistence/concept_notes/workspace_snapshots.py | Detached chapter snapshots | cnb | B5 | (stays) | the document interface review uses |
| ca/persistence/concept_notes/workspace_validation.py | Validation snapshots; freshness fingerprint | cnb | B5 | (stays) | — |

### Shared utilities

| Current path | Purpose | Tag | Boundary | Proposed target | Coupling to remove |
|---|---|---|---|---|---|
| ca/utils/concept_note_context.py | Strip identifiers, source message, visual replay | core | B3 | ca/services/clima/context/ | `CONCEPT_NOTE_SOURCE_DOCUMENTS` header; visual tool name; run-id extraction |
| ca/utils/cnb_progress.py | Request-local SSE progress and reasoning sink | core | B2 | ca/services/clima/runtime/ | `chapter_completed` stage; `chapter_title` |
| ca/utils/cnb_model_settings.py | ModelSettings with reasoning summaries | core | B2 | ca/services/clima/runtime/ | name only |
| ca/utils/cnb_observability.py | CNB interaction enum; edit-outcome logging | cnb | B2 | (stays) | — |
| ca/utils/cnb_information_markers.py | Parse `[Information needed: …]` markers | unclear: CNB drafting convention | B5 | ca/services/clima/collection/ | marker syntax |
| ca/utils/prompt_budget.py | Token counting and history trimming | core | B2 | (keep; shared) | SE budget helpers in the same module |
| ca/utils/streaming_prompt.py | SE prompt composition; chat budget | core | B2 | (keep; shared) | SE helpers mixed in |
| ca/utils/streaming_context.py | Resolve workflow context; load SE/CNB context | core | B3 | (keep; shared) | hardcoded CNB and SE loaders; should become a per-surface provider |
| ca/utils/streaming_handler.py | SSE orchestration for one reply | core | B2 | (keep; shared) | `stream_cnb_events` on every stream; CNB history/context; edit audit |
| ca/utils/streaming_agent.py | Workflow scope; request-scoped composition | core | B2 | (keep; shared) | parses `concept_note_edit` from the payload |
| ca/utils/streaming_events.py | Agents SDK events to chat SSE | core | B2 | (keep; shared) | special case for `concept_note_ask_question`; `emit_cnb_reasoning` |
| ca/utils/streaming_runner.py | SDK execution, budgeting, tracing | core | B2 | (keep; shared) | CNB tracing flags |
| ca/utils/streaming_telemetry.py | Stream telemetry metadata | core | B2 | (keep; shared) | CNB metadata keys |
| ca/utils/chat_workflow_context.py | Resolved workflow context for the stream | core | B3 | (keep; shared) | `concept_note_run_id` field; CNB prompt name |
| ca/utils/history_manager.py | Load and prune history | core | B2 | (keep; shared) | imports `omit_visual_html` from concept_note_context |

## Frontend, CC backend and API routes

### ConceptNoteWorkspace

| Current path | Purpose | Tag | Boundary | Proposed target | Coupling to remove |
|---|---|---|---|---|---|
| add-funder-flow.tsx | Add-funder dialog flow | cnb | B3 | (stays) | — |
| add-funder-form.tsx | Funder and template form fields | cnb | B3 | (stays) | — |
| add-funder-panel.tsx | Upload funder document | cnb | B4 | (stays) | — |
| application-template-dialog.tsx | Preview application template | cnb | B3 | (stays) | — |
| chapter-gaps-panel.tsx | Open gaps per chapter with "Answer in chat" | core | B5 | Clima/collection/ | chapter-keyed gap types; `concept-notes` namespace |
| chapter-validation.ts | Validation status and finding grouping | unclear: finding model generic | B5 | Clima/review/ (grouping only) | chapter validation types |
| chat-choices.tsx | Suggested-reply buttons plus custom answer | core | B1 | Clima/choices/ | `concept-notes` namespace; test ids |
| chat-panel.tsx | CNB chat rail: transcript, composer, notices, retry | unclear: generic transcript mixed with run glue | B1 | split: Clima/chat/ + (stays) | runId/editScope props; private ContextStatusNotice |
| chat-progress.tsx | Thinking spinner and staged progress | core | B1 | Clima/runtime/ | chapter stage labels |
| chat-suggestions.tsx | Fetched next-question suggestions | core | B1 | Clima/chat/ | run-scoped fetch; `tab` enum |
| chat-threads.tsx | Thread list, switch, start new | unclear: thread UX generic, endpoints run-scoped | B3 | Clima/chat/ | run-keyed RTK hooks |
| chat-utils.ts | Parse choices, visuals, reasoning, progress, history | core | B1/B2 | Clima/stream/ | tool name `concept_note_ask_question`; action `concept_note.visual.render` |
| chat-visual-frame.tsx | Sanitized, CSP-sandboxed visual iframe | core | B1 | Clima/visuals/ | `concept-notes` namespace; ReviewButton import |
| chat-welcome.tsx | Empty-thread CNB greeting | cnb | B1 | (stays) | — |
| concept-note-export.ts | Chapters to DOCX/PDF; marker blockers | unclear: builder generic, blockers CNB | B5 | Clima/export/ | chapter type; marker rules |
| context-changes-notice.tsx | Announce sources added by a rebuild | unclear: needs a generic change type | B4 | Clima/sources/ | ConceptNoteContextChange; runId storage key |
| context-status-badge.tsx | Tone dot badge for context state | core | B1 | Clima/context/ | — |
| context-status.ts | Context readiness from uploads and bundle | unclear: states generic, inputs CNB | B3 | Clima/context/ | run upload and bundle types |
| context-tab.tsx | Sources tab | cnb | B4 | (stays) | file rows could later move to Clima/sources |
| document-review.tsx | Actionable proposal, review toolbar | core | B5 | Clima/review/ | `EditController`; chapter type; structure branch |
| draft-document-panel.tsx | Chapter document with inline diffs | cnb | B1 | (stays) | consume Clima/review and collection |
| draft-markdown.ts | Parse/strip information-needed markers | unclear: CNB marker format | B5 | Clima/collection/ | `#cnb-missing-information` |
| draft-setup-panel.tsx | Pre-draft readiness checklist | cnb | B3 | (stays) | — |
| draft-tab.tsx | Switch draft setup and document | cnb | B1 | (stays) | — |
| drafting-progress-card.tsx | Drafting progress card in chat | unclear: long-task card reading draft state | B2 | Clima/runtime/ | ConceptNoteDraftState |
| edit-diff.tsx | Before/after diff with accept/reject | core | B5 | Clima/review/ | `chapter_title`; marker rendering |
| edit-proposal-card.tsx | Proposal card: apply, reject, refine, sources | core | B5 | Clima/review/ | chapter navigation; context section keys |
| export-dialog.tsx | Guided pre-export review | unclear: chapter-bound stages | B5 | Clima/export/ | GuidedReviewController |
| funder-form.ts | Funder form model and validation | cnb | B3 | (stays) | — |
| funding-details.tsx | Funder and opportunity details | cnb | B3 | (stays) | — |
| funding-selection-dialog.tsx | Search and select funding | cnb | B3 | (stays) | — |
| guided-review-navigation.tsx | Review stepper | unclear: `ReviewStage` enum CNB | B5 | Clima/review/ | ReviewStage |
| guided-review-panels.tsx | Running, findings, decision, export panels | unclear: bound to validation and export | B5 | (stays) | — |
| guided-review-summary.tsx | Findings and review summary | unclear: CNB finding types | B5 | Clima/review/ | chapter titles |
| index.tsx | Workspace orchestration | cnb | B1 | (stays) | becomes a Clima consumer |
| inline-review.ts | Locate edits in markdown; check revisions | core | B5 | Clima/review/ | chapter revision fields; structure branch |
| inventory-selection-dialog.tsx | Choose GHG inventory | cnb | B3 | (stays) | — |
| missing-information.tsx | Render marker labels | unclear: CNB marker contract | B5 | Clima/collection/ | marker format |
| next-step-banner.tsx | Generic next-step banner | core | B1 | Clima/lifecycle/ | — |
| own-template-flow.tsx | Import or edit own template | cnb | B3 | (stays) | — |
| review-button.tsx | Button variant for review surfaces | core | B1 | Clima/review/ | — |
| structure-tab.tsx | Chapter outline editor | cnb | B5 | (stays) | — |
| use-concept-note-chat.ts | Chat turn state, SSE, history, retry | core | B1/B2 | Clima/stream/ | `concept_note_run_id`/`concept_note_edit` context; CNB error codes |
| use-concept-note-edits.ts | Load/apply/reject/refine proposals | core | B5 | Clima/review/ | run-scoped edit API; workspace events |
| use-concept-note-workspace-data.ts | Load run, city, draft, uploads | cnb | B3 | (stays) | — |
| use-concept-note-workspace-events.ts | Workspace SSE observer | unclear: own SSE parser | B3 | (stays); parser to Clima/stream/ | duplicate `parseEvent` |
| use-draft-focus.ts | Focus a chapter or finding | cnb | B1 | (stays) | — |
| use-funder-import.ts | Upload and poll funder import | cnb | B4 | (stays) | — |
| use-guided-review.ts | Parallel chapter validations | unclear: per-chapter validation | B5 | (stays) | — |
| use-import-form.ts | Funder/template import form state | cnb | B4 | (stays) | — |
| use-inline-review-decisions.ts | Per-change accept/reject, apply subset | core | B5 | Clima/review/ | `EditController`; chapter navigation |
| validation-evidence.tsx | Evidence quotes for findings | core | B4 | Clima/sources/ | validation evidence type |
| workspace-states.tsx | Loading and unavailable states | cnb | B1 | (stays) | — |

Paths in this table are relative to `app/src/components/ConceptNoteWorkspace/`; targets to `app/src/components/`.

### ConceptNoteDashboard and ConceptNoteWiringHarness

| Current path | Tag | Proposed target | Note |
|---|---|---|---|
| ConceptNoteDashboard/context-source-action.tsx, context-source-status.ts | unclear | Clima/context/ | city source readiness could be reused |
| ConceptNoteDashboard/lifecycle-dialog.tsx | unclear | Clima/lifecycle/ | generic, but typed to runs |
| ConceptNoteDashboard/status-badge.tsx | cnb | (stays) | generic; candidate for `ui/` |
| ConceptNoteDashboard/utils.ts | cnb | (stays) | the workspace imports context-change types from here |
| ConceptNoteDashboard (6 other files) | cnb | (stays) | run list, run cards, create dialog |
| ConceptNoteWiringHarness/utils.ts | unclear | Clima/sources/ | upload limits used by the workspace |
| ConceptNoteWiringHarness (6 other files) | cnb | (stays) | dev harness |

### Main Clima chat (the first consumer)

| Current path | Purpose | Tag | Proposed target | Coupling to remove |
|---|---|---|---|---|
| app/src/components/ChatBot/chat-bot.tsx | Main chat body | core | (stays; consumer) | text-only `useChat`; no tool-result slots |
| app/src/components/ChatBot/chat-popover.tsx | Launcher and `open-clima-ai` event | core | (stays; consumer) | event carries only suggestions |
| app/src/components/ChatBot/ChatInput.tsx | Composer with send/stop | core | Clima/chat/ | — |
| app/src/components/ChatBot/ChatMessageList.tsx | Markdown bubbles, autoscroll | core | Clima/chat/ | index keys; no ids, choices or visuals |
| app/src/components/ChatBot/ChatSuggestions.tsx | Static suggestion chips | core | Clima/chat/ | — |
| app/src/components/ChatBot/PulsingAIIcon.tsx | Pending indicator | core | Clima/runtime/ | — |
| app/src/components/ChatBot (2 disclaimer files) | First-use disclaimer | core | (stays) | — |
| app/src/hooks/useSSEStream.ts | Climate Advisor SSE transport | core | Clima/stream/ | already shared |
| app/src/hooks/useChat.ts | Main chat turn state | core | Clima/stream/ (merge with the CNB hook) | ignores tool results, progress, reasoning; no history |
| app/src/utils/chatUtils.ts | Message type and helpers | core | Clima/stream/ | no message ids |
| app/src/services/chatService.ts | Create-thread wrapper | core | Clima/stream/ | thread context is inventory-only |
| app/src/components/shared/chat-markdown-components.tsx | Chat markdown renderers | core | (stays; already shared) | — |

Main chat parses only `message`, `done` and `error` events. It ignores `tool_result`, `progress` and `reasoning`, loads no history, and starts a new thread per mount. It does not duplicate CNB tool parsing; it lacks it.

### RTK services, CC backend and API routes

| Current path | Tag | Boundary | Proposed target | Coupling to remove |
|---|---|---|---|---|
| app/src/services/api.ts (about 35 concept-note endpoints) | unclear | B3 | (stays) | thread operations are run-scoped |
| app/src/services/concept-note-edit-api.ts | core | B5 | (stays) behind a Clima/review adapter | runId URLs |
| app/src/services/concept-note-structure-api.ts | cnb | B5 | (stays) | — |
| app/src/util/concept-note-edit-types.ts | unclear | B5 | Clima/review/ (types) | `chapter_id`; context section enum; StructureProposal |
| app/src/backend/chat/climate-advisor.ts, message-payload.ts, authorization.ts | core | B2/B3 | (stays) | message-payload forwards `context` without validation |
| app/src/backend/climate-advisor-token.ts, climate-advisor-connection.ts | core | B3 | (stays) | — |
| app/src/backend/concept-notes.ts, ConceptNoteWorkspaceObserver.ts, concept-note-page-guard.ts | cnb | B3 | (stays) | — |
| app/src/backend/ConceptNote{Upload,UploadStatus,SourceProcessing,Deletion}Service.ts | cnb | B4 | (stays) | already uses the shared PdfOcrService |
| app/src/backend/concept-note-run-proxy.ts, concept-note-edits.ts | unclear | B3/B5 | (stays) | run-to-city lookup; run-scoped paths |
| app/src/app/api/v1/chat/messages/route.ts | core | B2 | (stays) | forwarded `concept_note_*` conflict codes |
| app/src/app/api/v1/chat/threads/route.ts, threads/[threadId]/messages/route.ts | core | B1/B3 | (stays) | ownership checked only by Climate Advisor |
| app/src/app/api/v1/concept-notes/[runId]/edit-proposals/** (5) | core | B5 | (stays) | run-scoped path |
| app/src/app/api/v1/concept-notes/[runId]/chat/** (3), uploads/** (3) | unclear | B3/B4 | (stays) | run-bound threads and uploads |
| app/src/app/api/v1/concept-notes/** (17 other routes) | cnb | B3–B5 | (stays) | — |

### i18n

The `concept-notes` namespace has 915 lines in `en`. The shared chat, edit, choices, visual and progress keys should move to a Clima namespace. Every `core` component above calls `useTranslation(lng, "concept-notes")`. ChatBot passes a `t` prop while CNB passes `lng`; pick one convention.

### Duplication between ChatBot and ConceptNoteWorkspace

1. Turn hook: `app/src/hooks/useChat.ts` and `use-concept-note-chat.ts` both wrap `useSSEStream`, append deltas and drop empty replies on error.
2. Message model: `app/src/utils/chatUtils.ts` and `ConceptNoteChatMessage` in `chat-utils.ts`.
3. Transcript: `ChatMessageList.tsx` and the message loop in `chat-panel.tsx`, each with its own markdown component config.
4. Composer: `ChatInput.tsx` and the `chat-panel.tsx` form.
5. Suggestions: static `ChatSuggestions.tsx` and fetched `chat-suggestions.tsx`.
6. Pending indicator: `PulsingAIIcon.tsx` and `chat-progress.tsx`.
7. Thread creation: `chatService.ts` and the run-scoped start mutation in `chat-threads.tsx`.
8. Error mapping: a toast with hardcoded English in `useChat`, and translated keys in `use-concept-note-chat.ts`.
9. SSE frame parsing: `parseSSEEvent` in `useSSEStream.ts` and `parseEvent` in `use-concept-note-workspace-events.ts`.
10. A third chat implementation, `app/src/components/StationaryEnergyDraft/`, interprets tool results its own way.

## Prompt map

Proposed layers:

- `core`: composed into every chat surface.
- `clima`: a shared capability fragment or worker prompt.
- `cnb`: feature-specific.

The `cnb_chat` sub-rows split `P/cnb/chat.md` by capability.

| Prompt key | Current file | Layer | Proposed file | Consuming code | I/O contract | Owner |
|---|---|---|---|---|---|---|
| `core` | P/core.md | core | — | `PromptsConfig.compose_prompt` (settings.py) | streamed chat | Clima core |
| `chat` | P/chat.md (+ P/tools/default_tool_policy.md) | main chat | — | agent_service.py `create_agent` | streamed chat | Main chat |
| `stationary_energy_review` | P/stationary_energy_review.md (+ SE tool policy) | SE | — | agent_service.py; streaming_prompt.py | streamed chat | Stationary Energy |
| `cnb_chat` (role, bundle fields, step guidance, help) | P/cnb/chat.md | cnb | stays, thin, with `{{ include: ../clima/*.md }}` | agent_service.py; streaming_context.py | streamed chat + bundle JSON message | CNB |
| ↳ choices | chat.md L24-68, 136-140, 183-189 | clima | P/clima/choices.md | tools/concept_note_question.py; streaming_events.py:264 | ConceptNoteQuestion | Clima choices |
| ↳ visuals | chat.md L173-179, 227-247 | clima | P/clima/visuals.md | tools/concept_note_visual_tools.py | `title`, `html` primitives | Clima visuals |
| ↳ sources | chat.md L95-104, 122-132, 160-172, 216-225 | clima | P/clima/sources.md + sources_evidence.md | tools/concept_note_source_tools.py → `query_document` | SourceQueryResult | Clima sources |
| ↳ collection | chat.md L147-151, 200-207 | clima | P/clima/collection.md | tools/concept_note_gap_tools.py | dict, no output model | Clima collection |
| ↳ review | chat.md L8-12, 45-49, 152-159, 209-214 | clima | P/clima/review.md | tools/concept_note_edit_tools.py | status proposed/processing/clarification_required | Clima review |
| ↳ context | chat.md L72-75, 111-121 | clima | P/clima/context.md | streaming_context.py; history_manager.py | user-role data messages | Clima context |
| `cnb_draft_overview` | P/cnb/draft_overview.md | cnb | — | services/cnb/draft_overview.py | streamed Markdown or ConceptNoteQuestion | CNB |
| `cnb_chat_suggestions` | P/cnb/chat_suggestions.md | clima (CNB fields as input) | P/clima/choices_suggestions.md | services/cnb/chat_suggestions.py | ChatSuggestionsOutput (`json_object`) | Clima choices |
| `cnb_chat_edit_planner` | P/cnb/chat_edit_planner.md | clima + cnb fragment | P/clima/review_planner.md + P/cnb/edit_policy.md | services/cnb/edit_planner.py `_plan` | EditAgentOutput; DraftReplacement → EditPlanOutput | Clima review |
| `cnb_chat_edit_review` | P/cnb/chat_edit_review.md | clima | P/clima/review_semantic.md | edit_planner.py (reviewer) | ChapterEditReview | Clima review |
| `cnb_source_document_mapping` | P/cnb/source_document_mapping.md | clima | P/clima/sources_document_mapping.md | source_analysis.py `analyze_document` | DocumentMappingReading → SourcePartitionMap | Clima sources |
| `cnb_source_question_reading` | P/cnb/source_question_reading.md | clima | P/clima/sources_question_reading.md | source_analysis.py `query_document`; chapter_drafting.py | QuestionReading → SourceQuestionReading | Clima sources |
| `cnb_source_summary_synthesis` | P/cnb/source_summary_synthesis.md | clima | P/clima/sources_summary_synthesis.md | source_analysis.py `analyze_document` | DocumentSummary → SelectedSource | Clima sources |
| `cnb_source_impact_review` | P/cnb/source_impact_review.md | cnb | — | services/cnb/source_impact_review.py | forced tool `select_chapters_to_update` | CNB |
| `cnb_chapter_drafting` | P/cnb/chapter_drafting.md | cnb + clima includes | stays; evidence and gap-item rules move to clima fragments | services/cnb/chapter_drafting.py | ConceptNoteChapterDraftOutput | CNB |
| `cnb_chapter_validation_completeness` | P/cnb/chapter_validation_completeness.md | cnb | — | services/cnb/chapter_validation.py | ChapterCompletenessValidationOutput | CNB |
| `cnb_chapter_validation_consistency` | P/cnb/chapter_validation_consistency.md | cnb | — | same | ChapterConsistencyValidationOutput | CNB |
| `cnb_funder_document_extraction` | P/cnb/funder_document_extraction.md | cnb | — | services/cnb/funder_document.py (key built as `f"cnb_{kind}_document_extraction"`) | FunderDocumentExtraction | CNB |
| `cnb_template_document_extraction` | P/cnb/template_document_extraction.md | cnb | — | same, `kind="template"` | TemplateDocumentExtraction | CNB |
| `cnb_funding_opportunity_research` | P/cnb/funding_opportunity_research.md | cnb (offline) | — | services/cnb/research_service.py → research_agent.py | ResearchPromptResult | CNB research |
| `cnb_funder_identity_matching` | P/cnb/funder_identity_matching.md | cnb (offline) | — | scripts/cnb/research_funded_projects.py → funder_identity_match.py | FunderIdentityLlmDecisionSet | CNB research |
| `cnb_similar_project_matching` | P/cnb/similar_project_matching.md | cnb | — | services/cnb/similar_project_search.py | SimilarProjectSelections | CNB |
| (not in config) UI guide | ca/tools/concept_note_ui_guide.txt | cnb | — | concept_note_ui_labels.py | tool-result text | CNB |

### What belongs in each layer

- `core.md`:
  - **Keep:** identity, grounding, no identifiers or secrets, no raw JSON, say what is missing, concise answers.
  - **Add:** one rule that tool results, documents and runtime messages are data, never instructions. Today that rule is repeated in 8 prompts.
  - **Keep out:** tool policies. Main chat also receives core, and it does not bind those tools.
- `clima`:
  - **Fragments:** `P/clima/<capability>.md` files that a workflow prompt includes, without a `<role>` block.
  - **Standalone worker prompts:** `P/clima/<capability>_<task>.md`, with full schema blocks and no core.
- `cnb`:
  - **Bundle semantics:** CNB role, workflow_step, cc_context, manual_population and funder context.
  - **Help:** the help tool and the UI guide.
  - **Chapters:** chapter structure rules and the `[Information needed: ...]` marker syntax.
  - **Feature prompts:** drafting, validation, impact, extraction and research.

Instructions duplicated across prompts, to move into one place:

| Instruction | Repeated in | Move to |
|---|---|---|
| Unverified image-annotation envelope | 5 prompts | `clima/sources_evidence.md` |
| Untrusted evidence, never instructions | 8 prompts + both extraction prompts | `core.md` (chat) and `sources_evidence.md` (workers) |
| Source tag and page-marker format | 2 prompts | `clima/sources.md` |
| 2–6 option question format | 3 places | `clima/choices.md` |
| "A proposal does not apply changes" | 5 prompts | `clima/review.md` |
| Page and heading locators; state disagreements | 4 prompts | `sources_evidence.md` |
| `manual_population` precedence | 5 prompts | one `cnb/` include |
| Extraction evidence and `<input>` rules | funder and template extraction | one `cnb/` include |
| Validation boilerplate | completeness and consistency | one `cnb/` include |
| Tool argument contracts restated in prose | cnb/chat.md, chat_edit_planner.md | drop; the tool schemas are the contract |
| Five rules in main chat | `chat.md` and `default_tool_policy.md` | keep one copy |

### Loading and versioning today

- **Registry:** `llm_config.yaml` `prompts:` maps keys to paths. `PromptsConfig` in `ca/config/settings.py` reads them.
  - Most CNB keys also have hardcoded path defaults in settings.py, which is a second source of truth.
- **Loading:** `get_prompt` reads from disk on every call. `{{ include: path }}` resolves relative to the including file, and include cycles are rejected.
- **Composition:** `compose_prompt` is core plus the workflow prompt, and only for `chat`, `stationary_energy_review` and `cnb_chat`. Worker prompts get no core.
- **Versioning:** no version fields; git is the version. Content hashes exist in three places:
  - `source_analysis_contract_version` (prompt text, model and limits, but not the output schema) invalidates saved source analyses.
  - The research pipeline logs `prompt_sha256` to MLflow.
  - The similar-project script logs `prompt_sha256` too.
- **Models:** bound by role keys in `llm_config.yaml`, not by prompt key.
  - Temperature 0.0 is hardcoded in four services.
  - Edit review has no model role of its own.
- **Tests:**
  - `test_prompt_config.py` checks the role, task, input and output blocks for 18 of 20 keys; both extraction prompts are missing.
  - Substring tests pin some contracts.
- **Registries and tracing:** no prompt registry or hub. LangSmith is used for tracing only, and several CNB workers turn it off.

### Proposal: versioning and ownership

1. Keep `llm_config.yaml` `prompts:` as the only registry.
   - Prefix keys by owner (`core`, `chat`, `clima_<capability>_<task>`, `cnb_<task>`) and put files under `P/<owner>/`.
   - Delete the path defaults in settings.py so a missing key fails at startup.
   - Update the dynamic extraction key in `funder_document.py` with the rename.
2. Keep `compose_prompt` as core plus workflow. Workflow files include Clima fragments with the existing `{{ include }}`, so composition needs no code change.
3. Clima prompts speak about sections, context sections and markers. CNB supplies chapters, marker syntax and allowed context sections, through a `cnb/` include or payload fields.
4. Each Pydantic contract moves with its prompt:
   - `source_prompt.py` and `SourceQueryResult` go to `models/clima/sources`.
   - `ChapterEditReview`, `DraftReplacement` and `EditAgentOutput` go to `models/clima/review`.
   - `ConceptNoteQuestion` and `ChatSuggestionsOutput` go to `models/clima/choices`.
   - Rename a class in the same PR as its prompt, because prompts quote class names.
5. Version = git plus one content hash.
   - Generalize `source_analysis_contract_version` into one helper that hashes the rendered prompt, model, reasoning effort, temperature and output JSON schema.
   - Use the hash in two places only: to invalidate reused stored outputs, and as `prompt_key` and `prompt_sha256` in MLflow telemetry on every LLM call.
   - No semver fields and no prompt registry.
6. Add one parametrized contract test over every yaml key. It checks:
   - the schema blocks, including the extraction prompts
   - that `<output>` names `output_type.__name__`
   - that the backticked fields exist in the model schema
7. Tool argument contracts come only from tool schemas. Prompts say when to use a tool, not its argument shape.
8. Rename the reused model roles (`cnb_source_reader`, `cnb_source_synthesizer`, `cnb_chat_edit_planner`) to `clima_*`, and give review its own role.
9. Owner = directory = test location. A change to `core.md` or `P/clima/*` runs the prompt tests of main chat, Stationary Energy and CNB.
