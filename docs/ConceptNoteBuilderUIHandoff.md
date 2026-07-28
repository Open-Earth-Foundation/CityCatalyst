# Concept Note Builder — UI Design Handoff (v3)

**Owner:** Carlos Graffi (design) · **Backend counterpart:** Piotr · **Date:** 2026-07-28 · **Status:** design complete, pending backend requests below

**Design source of truth:** Figma file *"Agentic Flow - Concept Note Builder"*, page **"CNB v3 – 2026-07-27"**, sections 14–17 (sections 8–10 are the Stationary Energy reference; 11–13 are superseded) — **entry flow superseded by v4, see the update box below**. Styling source: Claude Design project *"CityCatalyst Terra UI"* (tokens + component specs, lifted from `app/src/lib/theme`). Companion artifacts (design workspace): SSE fixtures (`uc1-happy-path.sse.json`, `uc1-degraded.sse.json`) and the backend request doc (mirrored here as `ConceptNoteBuilderBackendRequests.md`).

> ### v4 update — 2026-07-28 (first handoff)
> Figma page **"CNB v4 –– First Handoff"** (sections 18 · Journey, 19 · New & changed
> components) supersedes the **entry flow** of this doc:
> - **Everything at note creation is optional.** Screens **S2·a, S2 and S2·b no longer
>   exist.** Creation is a modal (V2) where every setup field — project, funder,
>   opportunity, even files — can be skipped; whatever is skipped becomes a **setup gap**
>   that Clima resolves in chat (V3, SetupGapChatCard). "Assembly starts on the 4th
>   pick" is dead: the run is created on the modal's CREATE, before uploads (which are
>   run-scoped).
> - **The home screen is now a dashboard (V1)** — note cards by name, shared-context
>   strip, expanded ContextPanel. Workspace drafting runs at chat 480 / artifact 900.
> - **Backend deltas:** §D of `ConceptNoteBuilderBackendRequests.md` is rewritten and
>   §F–H are new (optional scope at `start_run` / `concept_note_set_scope` · setup-gap
>   blocker values in the agent context · a `name` column on `concept_note_runs`). The
>   amber "v4 backend deltas" card in Figma section 19 carries the same list.
> Section 3's screen table is kept as the v3 record (read S2·a/S2/S2·b rows through
> this box); §7 is updated in place. Everything else (principles, components, tool
> moments, data model) carries over unchanged.

---

## 1. The product in one paragraph

A city picks a project, a funder and a funding opportunity; Clima (the Climate Advisor) assembles context from CityCatalyst data, the city's uploaded files and the funder profile, then drafts a funder-ready concept note through a guided interview — **never a wizard** — while the note is visible, readable and restructurable at all times. Every factual claim is source-linked; when no source exists, Clima asks instead of inventing. Export produces DOCX + PDF.

## 2. Design principles (non-negotiables)

1. **The workspace is ONE screen** whose regions change state — never a step sequence. All template chapters exist as visible empty rows from t=0 (the outline is the contract).
2. **The note is text.** The Draft preview shows the full document as readable prose at every moment — empty sections as placeholders, never hidden. The preview is exactly what export renders.
3. **Gap ≠ status.** A chapter can be EMPTY *and* carry a gap tag *and* be locked — three independent signals. Critical gaps functionally gate mark-chapter-ready and export.
4. **Never fabricate, made visible.** Every claim links to a source, a user confirmation, or a CC snapshot. The red "no source" chip is the alarm state; Clima's grounded question always states *why* it's asking.
5. **Export warns, never blocks.** Cities send imperfect drafts on deadlines; "Export anyway" is always available on warnings. DOCX and PDF are independent artifacts.
6. **Users never type into the note.** Every user-sourced field is an interview answer (`You · interview`) or an upload. No "Manual entry" language anywhere.
7. **Auto-save, no save buttons.** Every change writes a full-body revision; adding files saves automatically. A save affordance appears only inside a future bundle-edit view.
8. **Clima green is chat-identity only.** All product actions are Terra blue, uppercase, pill; Export actions are green; danger is red. One button size everywhere (12px Poppins SemiBold, 1.25px tracking, 8/14 padding).

## 3. Information architecture — screens (Figma section 15)

| Screen | Purpose | Key states |
|---|---|---|
| **S1 · Home — Runs** | All of the city's concept notes, resumable. Shared-context strip on top. | empty / has-runs / per-card status + context-% |
| **S2·a · Start a new note** | The selection state: SHARED CONTEXT (city) vs THIS NOTE'S SETUP (project · funder · opportunity). Assembly starts on the 4th pick — no assemble button. | 3-of-4 chosen, dropdown open, disabled until ready |
| **S2 · Scope & context** | Selection collapsed to a summary bar; readiness panel + CC tile mosaic + funder card (with proposed eligibility check) + files/dropzone. | assembling / ready / **ready-with-gaps** (never blocks) / blocked (funder profile only) |
| **S2·b · Thin context (UC-5)** | Same launchpad, city with almost no data. Files become the primary source; nothing hidden. | 3 MISSING tiles, interview still starts |
| **S3 · Workspace** | Clima chat (620) + concept-note artifact (752) with **three tabs**: Draft preview (full text + SECTIONS navigator) · Structure · Context. | interviewing / drafting / gap open / mid-flow upload |
| **S3·b · Structure tab** | Drag-reorder, remove, ADD CUSTOM CHAPTER — or ask Clima (same tools). | row lifted "Moved by Clima" |
| **S4 · Export** | Sheet over the dimmed workspace. Preflight checklist with chapter deep-links, REVIEW FULL TEXT, independent .DOCX/.PDF cards, shared-context auto-saved card. | clean / warnings / blocking / per-format failure with persisted retry |

**Navigation:** primary loop S1 → S2·a → S2 → S3 ⇄ S4 → S1. Resume/Duplicate short-circuit from S1 (Duplicate = setup pre-filled, shared context already in place). Every screen reaches Home via "← All concept notes". Full audited map: the Navigation card in section 15.

## 4. Component inventory (Figma section 14 — every state drawn, frame names = intended React names)

C1 RunStatusIndicator · C2 UploadCard (incl. 4 distinct failure modes) · C3 ContextTile (**Connected** badge, preview line — GHGI: total + sectors covered; CCRA: risks mapped; HIAP: ranking status — and "Open in module" redirect) · C4 ContextReadinessPanel · C5 FunderSummaryCard (+ proposed eligibility state) · C6 SimilarProjectCard (weak/empty first; no scores in v1) · C7 ConversationTurn (incl. the grounded question with WHY) · C8 ChapterOutlineRow (real enum: empty·draft·needs_review·ready·deleted; `user_locked` boolean; gap tag separate) · C9 ChapterBody (body = latest revision) · C10 CitationChip + SourcePopover (no-basis = red alarm) · C11 GapIndicator (severity is functional) · C12 DiffProposal (inline diff + REASON; v1.1) · C13 DestructiveConfirm (soft delete) · C14 ExportPreflight · C15 NotePreview + StructureTab (empty→streaming→complete; reorder; add-custom) · DECISION band (evidence-in-export A/B, unresolved).

## 5. Tool → SSE → UI behavior (Figma sections 16 + 17)

Thirteen moments, each as a reference card (16) and a full workspace screen (17):
① start_run → 7 empty rows instantly · ② bundle_ready → context lands everywhere at once · ③ update_chapter → text streams into the preview · ④ link_evidence → provenance pills + source trail · ⑤ flag_gap → grounded question; row keeps EMPTY + gains gap tag · ⑥ user answer → gap resolves into citable provenance · ⑦ mark_chapter_ready → refused while critical gap open · ⑧ edit on user_locked → inline diff + REASON · ⑨ delete → gated, soft, preflight warning · ⑩ restore → full body returns · ⑪ context_annotate → run-scoped override, Context tab · ⑫ export → independent formats, persisted retry · ⑬ **mid-flow upload → "what context do you have now?"** → in-chat upload card + structured context summary by source type.

Amber SSE chips throughout = events that don't exist yet (see the requests doc).

## 6. Data model the design assumes

- **Shared context per city** (CC data + files, auto-saved, reused by every note) + **per-note setup** (project · funder · opportunity). This resolves the architecture's bundle open question toward *shared* — deliberately.
- **Provenance types:** upload (CAP p.x) · CC dataset · funder criterion · similar project · `You · interview`. **Out of scope by decision:** per-field confidence levels and sub-field source structure.
- Real notes run ~20+ numbered sections with inline gaps and tables (reference: the Porto Alegre BPJP/C40 example note) — hence the SECTIONS navigator and the Structure tab.

## 7. Backend requests

Full detail + plain-terms rationale in `ConceptNoteBuilderBackendRequests.md`. Summary: **4 SSE events** (per-upload status · workflow step changed · chapter ready · bundle re-assembly delta) + **7 tools/endpoints/schema asks** (run listing · `context_annotate` · shared-context promotion · applicant eligibility validation · optional scope at `start_run` or `concept_note_set_scope` · setup-gap blocker values in the agent context · `name` column on `concept_note_runs`). The v3 "auto-assembly = frontend behavior on the 4th pick" note is **dead** — v4 creates the run on the modal's CREATE, before run-scoped uploads (`POST /concept-notes/{run_id}/uploads`); see the rewritten §D. Suggested order: events 1+2 → run listing + name column → optional scope → events 3+4 → annotate + shared context → setup-gap context → eligibility.

## 8. Open decisions

1. **Evidence in export** (blocking, Carlos + Piotr): architecture says workspace-only; PRD says linked sources travel to the funder. Both export variants are drawn in section 14's DECISION band.
2. Custom chapters in the funder document (architecture's own open question).
3. Restore position after reorders.
4. Citation-density collapse rule (Carlos).
5. Real MN funder template — the 7-chapter plan everywhere is a placeholder.
