# Concept Note chat edits

## Review before mutation

CC-732 extends the existing chat-left/document-right workspace. A chat edit creates
an authorized, durable proposal; it does not replace the current draft. Ordinary
questions remain read-only. The agent has only `concept_note_edit_propose`, not
apply, undo, or restore tools.

The document shows previous text in red and proposed text in green directly at
each affected passage, with `del`/`ins` semantics and a non-color legend. Chat
contains only the conversation and never renders proposal, failure, refinement,
or comparison cards. A pending proposal automatically opens its inline document
review. Completed proposals remain persisted through the backend API. The document header,
beside Export, provides
previous/next arrows, Accept all and Reject all; there is no second toolbar above
the draft. Each inline replacement also has an X for rejecting that occurrence
and a tick for accepting it. These decisions advance through the unresolved
changes and commit atomically when every occurrence has a decision, so reviewing
one passage never closes the proposal or loses the remaining passages. A small
More review options popover holds refinement, provenance and optional grouped
selection. Switching away from Draft replaces mutation controls with View changes
so confirmation is never detached from its preview. Consistency groups remain a
bulk-review convenience, while explicit inline decisions may accept or reject
individual occurrences. A partial application is terminal and truthfully reported;
rejected changes never enter the draft or its exports.

Applying refreshes the document and focuses the first affected chapter. Accepted
factual edits display the saved current text, not a second regeneration
diff. A factual edit can still reset publication readiness to Draft; confirming
the chapter as Ready is separate from accepting and saving the edit. New or
restored proposals reveal the first affected passage once; subsequent arrows
scroll the actual inline hunk, not a chat card or chapter heading. Chat and
document scrolling remain independent; streaming does not continuously force
the user's scroll position. Regenerated chapter comparisons use the same inline
renderer. This workspace does not expose a History, Undo or Restore control; the
backend audit and compensating-operation APIs remain available.

Anchors are validated against the original Markdown before presentation;
Python Unicode code-point offsets are converted to JavaScript UTF-16 positions.
The renderer transforms parsed Markdown, never raw HTML. Plain text replacements
stay within the surrounding paragraph/list/table cell. Changes spanning Markdown
syntax or blocks redline the complete affected enclosing block so the document
structure remains valid. Snapshot comparison uses bounded token alignment, falling back to
line alignment for large snapshots and one changed range for exceptionally large
comparisons. Stale, overlapping or missing anchors disable acceptance.

The existing RTK Query API owns proposal fetching, caching, refresh and polling.
The review hook retains only explicit mutations and durable acceptance retry keys;
inline decisions live in their own hook. Chapter polling batch-loads revisions,
gaps and resolutions in at most four SELECTs, independent of chapter count.
Planning and semantic review live in `edit_planner.py`; deterministic authorization,
provenance and exact-anchor expansion live in `edit_validation.py`. Both expansion
paths use the same protected-text traversal and size limit.

## Scope, anchors, and grounding

Scope is always automatic. The server sends the exact user instruction to one
independent model call per unlocked chapter. Each call sees only that chapter's
current and confirmed text, its gaps, authorized run context, chapter-local prior
proposal details, and at most the three previous visible user/assistant messages.
The server-owned chat window excludes the current instruction and internal context
or tool records; it is used only to resolve short follow-ups, while assistant text
is never authorization or factual evidence. Calls run concurrently under a
configured limit and the server combines their outputs before whole-document
validation. A table-of-contents click is a non-binding focus hint. There is no
passage, chapter-set, or full-document mode for the user to choose or confirm.
Broad requests proceed to normal proposal review without a separate
scope-confirmation step.

Each replacement must match an exact current-body quote. An incorrect model offset
is repaired only when that quote is unique within its chapter. Ambiguous anchors
require clarification. The planner is instructed to return the smallest exact
replacement span so red/green review does not highlight surrounding unchanged
sentences or paragraphs. The review UI presents that complete previous span in a
red row and the complete proposed span in a green row instead of interleaving
word-level differences.

Clarification is reserved for a target that cannot be identified from the current
instruction plus recent user messages, or for a factual value that lacks required
support from either the user or supplied sources. Explicit user values do not
require an uploaded document. Direct editorial requests proceed with the smallest reasonable proposal
even when phrased informally or without quoting the draft. This includes replacing
the project name at later chapter openings with neutral wording when the user asks
to retain the name only in the first chapter. Planner chapter positions are
zero-based, and the server completes an omitted matching later-chapter opening
from the model's selected neutral replacement before validation.

When clarification is genuinely required, the edit tool returns the focused
question to the chat agent so it can ask the user directly. There is no
clarification card. Successful proposals are reviewed through the inline document
controls, and the chat must not claim that the draft has already changed.

Explicit literal all-occurrence instructions are expanded deterministically across
all unlocked chapter prose. Template headings remain protected. An
`[Information needed: ...]` marker may be replaced only when the edit supplies
substantive grounded text for the matching open structured gap; arbitrary marker
deletion, rewriting, addition, or reordering remains blocked.

The planner receives the authorized run bundle and explicit human inputs. Source
references must belong to that run; the server records upload identity, label,
and source SHA-256 and rechecks these before apply. A refinement receives its
authorized prior proposal and verified human inputs as bounded context, but prior
model-written text is not factual evidence. A failed refinement retains the good
prior proposal.

After planning, an independent tool-free semantic review evaluates each changed
chapter's original text, proposed replacements and user instruction. It distinguishes
meaning-preserving editorial work from user-authorized or source-supported factual
changes. Synonyms, modal syntax and capitalization alone do not block a rewrite.
Every change requires exactly one indexed review decision; missing, duplicate or
unsupported decisions fail closed. Model-produced semantic assessments are not
factual verification, and cannot bypass source identity, exact user quote or
numeric grounding checks. Unreviewed outputs retain conservative lexical checks.
The server-only assessment is not persisted or exposed as a client authority field.

The review toolbar shows the number of changes and affected chapters. User-supplied
facts without selected-source evidence receive a non-blocking notice that they
have not been independently verified. Accept all remains available.

Deterministic validation checks numeric/date/currency consistency,
preserved required headings, and information-needed markers.
Related numeric replacements are grouped server-side even if the model supplies
different group labels. Unsupported added or removed facts, deleted negations
(including contractions), contradictory replacements, or omitted intended
occurrences require clarification. These conservative checks are not a proof of
arbitrary natural-language truth: the visible diff and explicit human acceptance
remain required, and synthetic tests do not establish live-model planning quality.

Limits are recoverable errors, never silent scope truncation:

- Instruction: 8,000 characters; one proposal: at most 100 changes.
- Chapter body: 50,000 characters.
- Automatic revision vector: at most 100 chapters.
- Prompt budget: `generation.prompt_budget.cnb_edits.max_prompt_tokens`,
  default 50,000 tokens per chapter call. A chapter that exceeds the boundary
  fails explicitly; it is never silently trimmed.
- Planner concurrency: `generation.prompt_budget.cnb_edits.max_concurrency`,
  default and maximum 5 concurrent chapter calls. All chapter workers finish
  before a model error is surfaced and the shared client is closed.
- Model and prompt: `models.cnb_chat_edit_planner` and
  `prompts.cnb_chat_edit_planner` in `llm_config.yaml`; prompt file
  `prompts/cnb/chat_edit_planner.md`. The independent review uses the same model
  and `prompts.cnb_chat_edit_review` (`prompts/cnb/chat_edit_review.md`). Both calls
  share the concurrency and prompt budget limits. The existing provider configuration is reused.

## Persistence and concurrency

`CA_DATABASE_URL` continues to store runs, context bundles, and threads.
`CNB_DATABASE_URL` stores chapters/revisions and the new
`concept_note_edit_proposals` / `concept_note_edit_applications` tables.
Repository boundaries are in `service/app/persistence/concept_notes/edits.py`;
planning and orchestration remain separate in `service/app/services/cnb/`.
The assistant message's `tools_used` JSONB preserves the model's raw empty
arguments for `concept_note_edit_propose` and adds `bound_arguments` containing
the exact server-bound instruction, automatic scope, idempotency key, and optional
refinement target. This audit-only field is written when the message is persisted;
it is not added to the streamed tool event or sent back into later model context.

Planning does not expose chapter IDs or revision fingerprints to the model. The
server binds each typed chapter result to its source chapter, namespaces its local
change groups, caps the combined proposal at 100 changes, and then performs the
existing whole-document anchor, provenance, structure, and consistency checks.

Apply takes a per-run transaction advisory lock and chapter row locks in stable
UUID order. It validates the complete expected base vector before appending any
accepted revision. Revisions, exact confirmation updates, and the immutable batch
history entry commit together. A stale base cannot overwrite newer content; a
failed transaction leaves no partial chapter set. Repeating an identical
idempotency key returns its recorded result; reusing a key for different input
fails. An uncertain web apply retains only its key, revision vector, and selected
IDs in session storage, not document text.

Wording-only acceptance can retain Ready only when the exact latest base was
confirmed, regeneration is idle, the chapter is unlocked, and current gaps do not
block it. The new revision receives a matching confirmation; an old confirmation
pointer is never left behind a false Ready label. Factual changes return affected
chapters to draft/review as appropriate. Applying a grounded marker replacement
atomically resolves its matching structured gap and records an append-only answer
event; unrelated open markers and unresolved gaps remain.

History stores before/after revision vectors, not destructive rewrites. Undo is
limited to the latest applied batch, with both the recorded after-vector and the
reviewed current vector validated. Restore is an explicit reviewed compensating
write bound to the current vector. Both append revisions, preserve the original
history, and recheck current locks, gaps, and regeneration state before restoring
review status.

Proposals persist as `processing`, `clarification_required`, `proposed`, `applied`,
`partially_applied`, `rejected`, `failed`, or `stale`. Listing restores actionable
proposals even when older than the newest 100 records; recent terminal records
are retained in the response too. Processing records interrupted for over ten
minutes become retryable failures during listing. Rejection/cancellation never
stores proposed text as a current chapter revision.

## Authorized API contract

CA routes are below `/v1/concept-notes/{run_id}`. Corresponding web routes are
below `/api/v1/concept-notes/{runId}`. Every read and mutation validates current
session/token identity, run ownership, and city access. Web routes retain
`apiHandler`, including organization-frozen and existing rate-limit behavior.
Inactive runs cannot be mutated.

- `GET /edit-proposals`: restore proposal states.
- `POST /edit-proposals`: `{instruction, scope, idempotency_key}`; returns a
  proposal with HTTP 202, not evidence that document content was applied.
- `GET /edit-proposals/{proposal_id}`: complete authorized diff and base vector.
- `POST /edit-proposals/{proposal_id}/apply`: `{idempotency_key,
expected_revisions, selected_change_ids?}`. Omitting selection accepts all.
  `expected_revisions` must equal the proposal's full base vector, including
  every chapter because scope is always automatic.
- `POST /edit-proposals/{proposal_id}/reject`: no content body is needed.
- `POST /edit-proposals/{proposal_id}/refine`: new instruction, scope, and key;
  the server binds the prior proposal from the route.
- `GET /revisions?before_sequence=N`: descending paginated batch history.
- `GET /revisions/{revision_id}`: exact immutable before/after chapter bodies.
- `POST /revisions/{revision_id}/undo` and `/restore`: `{idempotency_key,
expected_revisions}` captured when the user opens the review, not silently
  refreshed immediately before confirmation.

Missing/foreign identities fail closed. Invalid payloads or contradictory selected
groups fail validation; stale revisions/source snapshots and key reuse are
conflicts. Safe edit errors carry `code`, `detail`, `status`, and `request_id`.
The web proxy preserves upstream error status. The streamed tool result uses the
existing typed `tool_result` channel and exposes only proposal identity/status;
the full diff is read through the authorized endpoint.

## Migrations and deployment boundary

Apply the existing CA chain and the independent CNB chain to their correctly
configured databases, from `climate-advisor/`:

```text
uv run --directory service alembic upgrade head
uv run --directory service alembic -c cnb-alembic.ini upgrade head
```

CNB revisions `20260830_120000` and `20260830_130000` are additive. The second
backfills batch history for any already-applied first-slice proposals while
retaining their original application IDs and chapter revisions. No web migration
or CA migration creates these CNB tables. Verify database targets before migration;
do not use downgrade or history deletion as a production undo operation.

The runtime needs no new provider key or account. Existing CNB/CA database and CC
token/service-key configuration remains in use. This implementation was verified
locally; CI configuration is checked in, but no remote CI run, deployment, push,
or live model test is implied by local test results.

## Metadata-only observability

`CNBInteraction` and the `cnb_start`, `cnb_chat`, `cnb_missing_information`, and
`cnb_chat_edit` naming vocabulary are adopted from CC-751 / PR 3069, inspected
commit `571aa54e93d40c7325092b35bf5ac8b650982a7c`. Only that vocabulary is adopted,
not a wholesale merge of the open dependency.

Ordinary CNB chat uses `cnb_chat`; dedicated proposal/apply/history interactions
use `cnb_chat_edit`, `workflow=CNB`, run/proposal/application correlation,
operation, outcome, duration, and safe failure categories. Telemetry is best
effort and accepts no document, source, instruction, credential, or token fields.

CNB chat, edit planning, and nested source-query clients locally bind the original
SDK callables to bypass raw MLflow autolog capture, while SDK `RunConfig` disables
sensitive agent tracing. Explicit CNB debug payload artifacts are not emitted.
Global tracing is not toggled per request, so concurrent generic requests retain
their existing telemetry. Redacting secret-looking strings alone
would not protect document text.
