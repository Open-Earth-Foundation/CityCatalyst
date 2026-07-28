# CNB — SSE events the UI needs

**From:** Carlos (design) · **To:** Piotr (backend) · **Date:** 2026-07-24
**Companion to:** the UI Development Spec v2 and the two fixtures in [`fixtures/`](fixtures/).

The architecture emits **eleven** SSE events, and states plainly that
`concept_note_context_bundle_ready` is the **only** user-visible event covering the whole
context-assembly phase. That single fact is what forces most of this ask: today a user
drops a large CAP and receives no signal until OCR, funder load, and similar-project
matching have **all** finished — minutes later. A silent wait reads as a hang.

Four event families would close the gap. They're ordered by how much they hurt to lack.
Each is already present in the fixtures as `tier: "requested"`, so you can see the exact
shape and where it fires.

---

## 1. `concept_note_upload_status` — per-upload lifecycle  ⟶ unblocks **C2 UploadCard**

**Why it can't be worked around client-side.** OCR on a 180-page PDF is minutes-long. The
client uploads bytes and then has nothing to show. The failure codes we need to
distinguish **already exist** in the architecture's own failure table
(`cc_ocr_failed`, `ca_markdown_ingest_failed`) — they just never reach the client.

**Shape** (one event per transition, per `upload_id`):

```json
{ "event": "concept_note_upload_status",
  "data": { "run_id": "...", "upload_id": "up_cap01", "filename": "CAP.pdf",
            "status": "converting|processing|ready|failed",
            "detail": "OCR — 180 pp", "pages": 180,
            "error_code": null, "retryable": true, "http_status": null } }
```

**The failure codes must arrive distinct**, because they mean opposite things to the user:

| `error_code` | What it tells the user | Retry semantics |
|---|---|---|
| `cc_ocr_failed` | *Your file may be bad* (image-only scan, corrupt). CC keeps the file. | Retry may enqueue another OCR attempt. |
| `ca_markdown_ingest_failed` | *Your file is fine* — our indexing hiccuped. | Retry re-runs indexing only, not OCR. |
| `markdown_identity_conflict` | Duplicate; the upload is immutable. | Not retryable (`http_status: 409`). |
| (size) | Over the 20 MB source-PDF limit. | N/A — reject before upload. |

Collapsing these into a generic "upload failed" is the single biggest avoidable source of
support load in this feature.

---

## 2. `concept_note_workflow_step_changed` — step transitions  ⟶ unblocks **C1, S2, S3**

**Why it can't be worked around.** The workflow step is injected into the *agent's*
always-on context; it is never streamed. So the UI cannot tell `interviewing` from
`drafting_document` from `assembling_context`, and the entire assembly phase — the part
with the longest waits — has no signal at all. C1 (RunStatusIndicator) can currently only
guess from other events, and can't cover assembly.

**Shape:**

```json
{ "event": "concept_note_workflow_step_changed",
  "data": { "run_id": "...", "from": "assembling_context", "to": "interviewing" } }
```

Steps, per the architecture:
`selecting_scope → ingesting_user_files → profiling_funder → matching_examples →
assembling_context → interviewing → drafting_document → editing_document → completed`.

If a per-step event is too heavy, even a coarser `phase_changed` (scope / context /
interview / draft / done) would let C1 stop showing an unchanging spinner.

---

## 3. `document_chapter_ready` — chapter marked ready  ⟶ unblocks **C8 ChapterOutlineRow**

**Why it can't be worked around.** `document_mark_chapter_ready` is a **tool with no
matching event**. So when a chapter transitions to `ready`, the outline has no reactive
signal and can't update without polling. (Note the gate: this transition can't fire while
a critical gap is open — the event should reflect that, so the UI and backend agree on
when "ready" is legal.)

**Shape:**

```json
{ "event": "document_chapter_ready",
  "data": { "document_id": "...", "chapter_id": "ch_problem", "status": "ready" } }
```

Symmetry note: `document_chapter_updated` already fires for draft/edit transitions, so this
is filling the one hole in an otherwise complete chapter-lifecycle event set.

---

## 4. Bundle re-assembly delta  ⟶ unblocks **C4 ContextReadinessPanel**, and C3 tiles

**Why it can't be worked around.** When a file lands mid-interview and the bundle
re-assembles, the backend emits the **same** `concept_note_context_bundle_ready` event as
the first assembly. With no delta, the UI can't distinguish "+1 file added" from "starting
over" — a mid-flow re-assembly looks like a reset, and the user thinks they lost work.

**Option A (cheapest):** add a discriminator to the existing event —

```json
{ "event": "concept_note_context_bundle_ready",
  "data": { "reassembly": true, "changed": ["selected_sources", "document_context"],
            "added_source_ids": ["src_letter"] } }
```

**Option B:** a dedicated `concept_note_context_bundle_updated` carrying only the delta.
Either works for the UI; Option A is less surface area for you.

---

## What we're doing until these exist

The UI is being built against the two fixtures, consuming both `existing` and `requested`
tiers. Components fall back to indeterminate/last-known states where only `existing` events
are available (a temporary polling fallback covers the worst gaps). When these four land,
the same components become reactive with no redesign — the fixtures are written so the
shapes above drop straight in.

**Smallest useful first step, if you want to stage it:** #1 (`upload_status`) and #2
(`workflow_step_changed`) together remove essentially all of the "is it hung?" ambiguity,
which is the highest-severity UX problem today.

---

# Tools / endpoints requested (beyond events)

Added 2026-07-28 after the v3 design review. Each spot in the Figma file that depends on
one of these carries an amber **NEEDS BACKEND** flag. Rationale is written in plain terms
on purpose — it's the argument, not just the ask.

## A. Run listing endpoint  ⟶ unblocks **S1 Home**
**Plainly:** the backend can only answer "here's an exact city + project + funder +
opportunity — create or resume *that* run." It cannot answer "*what notes does this city
have?*" It's a filing cabinet with no drawer view: you can retrieve a note only if you
already re-type its exact scope. The home screen is literally a list of the city's notes
with status and context-progress — one boring endpoint (`list runs for city`) makes it
real. Without it, S1 is either empty or faked.

## B. `context_annotate`  ⟶ unblocks the confirm-or-correct promise (C3, tool screen ⑪)
**Plainly:** the tiles promise "confirm or correct — never re-enter." The user says
"population is 92,400, not 86,697." Two constraints collide: we must *use her number*,
and we must *never edit CityCatalyst* (the city's official record, owned by another
module). So the correction needs somewhere durable to live: a small stored fact —
"for this note, population = 92,400, provided by the user." Run-scoped = attached to
this note, not to CC. Without the tool, the correction only exists in the chat
transcript: it evaporates on resume, and the export can silently revert to the wrong
number.

## C. Shared context across notes (bundle promotion)  ⟶ unblocks S1/S4 shared-context cards
**Plainly:** a city's context (CC data + uploaded files) shouldn't be rebuilt per note.
The design's model: one auto-saved **shared context** per city, reused by every note;
each note keeps only its own setup (project · funder · opportunity). This deliberately
resolves the architecture's own open question (bundle run-scoped vs promotable) toward
**shared** — flagging it here so it lands as the product decision it is. Payoff: a
second note costs minutes, not another assembly.

## D. ~~Auto-assembly trigger~~ — DOWNGRADED to a behavior note
**Plainly:** on review this is ~90% frontend: `start_run` already kicks off ingestion
and assembly, so "no assemble button" just means the UI calls `start_run` the moment the
fourth selector is picked. The only backend sliver — signaling *re*-assembly when scope
is edited later — is covered by event #4 (bundle delta). **Nothing new requested.**
The S2·a flag in Figma now reads BEHAVIOR, not NEEDS BACKEND.

## E. Applicant eligibility validation  ⟶ unblocks the C5/S2 eligibility surface
**Plainly:** the funder profile already lists *who may apply* — eligible applicant
types, geography, categories. Today that data only filters **similar projects**; nothing
ever asks "*does this city itself qualify?*" So a city can spend an hour drafting seven
chapters and be rejected in thirty seconds by the funder's front desk. The check is
three field comparisons at assembly time, and the design already shows where the answer
goes (the ✓/✗ list on the funder card). It's the "check you're allowed to enter before
standing in line for an hour" gate.

**Suggested order:** events #1+#2 → A (run listing) → events #3+#4 → B+C (the
shared-context model) → E.

**Explicitly out (Carlos, 2026-07-28):** per-field confidence levels and sub-field source
structure (the Porto Alegre note's `### field` + confidence pattern) — not requested;
chapter-level `body_markdown` + evidence links stay as-is.
