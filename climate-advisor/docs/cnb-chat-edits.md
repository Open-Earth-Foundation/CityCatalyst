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
review. Completed proposals are condensed under History. The document header,
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
the user's scroll position. Undo/restore freezes the current revision vector
before reading history, displays each changed passage in the document and
requires explicit document-header confirmation. Regenerated chapter comparisons
use this same inline renderer instead of side-by-side columns.

Anchors are validated against the original Markdown before presentation;
Python Unicode code-point offsets are converted to JavaScript UTF-16 positions.
The renderer transforms parsed Markdown, never raw HTML. Plain text replacements
stay within the surrounding paragraph/list/table cell. Changes spanning Markdown
syntax or blocks redline the complete affected enclosing block so the document
structure remains valid. History uses bounded token alignment, falling back to
line alignment for large snapshots and one changed range for exceptionally large
comparisons. Stale, overlapping or missing anchors disable acceptance.

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
their existing telemetry. This boundary is tested with actual local MLflow
autologging and concurrent fake-transport SDK calls; tracking DB and artifacts
stay in pytest's temporary directory. Redacting secret-looking strings alone
would not protect document text.

## Focused tests and coverage

Use Node 22 and the locked Python environment. No live model or embedding call is
needed. Provide a disposable loopback PostgreSQL database named `cc732_*` through
`CNB_EDIT_TEST_DATABASE_URL`; the runner rejects missing or non-isolated targets
before executing required PostgreSQL tests.

From `climate-advisor/`:

```text
uv sync --locked
uv run python service/scripts/run_cnb_edit_tests.py --suite all --coverage
```

From `app/`:

```text
npm ci
node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.cnb-edits.config.ts --runInBand --coverage
node scripts/verify-cnb-edit-coverage.mjs
```

Each package independently requires at least 80% executable-line coverage over
all new/modified runtime files. The manifests include shared wiring, complete UI
files, literal bracket-named routes, and unexecuted files. The verifier rejects
missing/duplicate source entries. Existing shared-boundary tests and explicit
workspace/document/inline-review supplements are included; their selection does not change the
denominator or replace separate existing regression suites. `CNB_EDIT_COVERAGE_BASE`
must identify the PR base in CI (local default: HEAD).

CA emits `service/coverage/cnb-edits/coverage.json`; web emits
`coverage/cnb-edits/coverage-final.json`. New regression failures must be repaired,
not hidden among known baseline failures. The implementation record keeps exact
baseline/regression and browser results separately from these package gates.

## Synthetic persisted browser fixture

The dedicated setup uses the real web app, NextAuth credentials/CSRF, CC-issued
user tokens, CA authorization, planner parsing/validation, and PostgreSQL. Only
model Runner output is deterministic. It is not a browser-only mocked API test.

Use separate disposable databases named `cc732_web`, `cc732_ca`, and `cc732_cnb`
(any explicit `cc732_*` CNB test name is accepted). Bind them only to loopback.
The exact synthetic environment, web user/city fixture overrides, migrations,
readiness checks, and commands are defined in the `cnbChatEdits` job of
`.github/workflows/web-develop.yml`. Do not copy these values into an existing
application database. In particular, supply the synthetic
`VERIFICATION_TOKEN_SECRET`, matching `CC_SERVICE_API_KEY`/`CC_API_KEY`,
`NEXTAUTH_SECRET`, and `PLAYWRIGHT_TEST=1`; the latter uses the repository's
existing browser-test rate-limit switch, not a production policy change.

The web fixture is seeded using the existing `npm run upsert-ca-smoke-fixture`
command with that job's normal-author overrides. Run a dedicated web instance on
`127.0.0.1:3410`, configured with `CA_BASE_URL=http://127.0.0.1:8082` and matching
`HOST`/`NEXTAUTH_URL`. From `climate-advisor/`, with explicit loopback database and
CC bridge environment:

```text
uv run --directory service python -m scripts.run_cnb_edit_browser_fixture serve
```

From `app/`:

```text
node node_modules/@playwright/test/cli.js test e2e/concept-note-chat-edits.spec.ts --project=chromium --config=playwright.cnb-edits.config.ts
```

The browser spec appends fresh synthetic runs through the helper's `seed` action;
it never deletes prior fixtures. On Windows/non-default web DB ports, use the
test-only `e2e/cnb-edit-test-preload.cjs` with `CNB_EDIT_TEST_DB_PORT` and
`CNB_EDIT_TEST_BASE_URL`. Sequelize in this checkout does not honor `PGPORT`;
the preload rejects unexpected database targets. DB-integrated Jest also needs
the preload in `--setupFiles` because it runs a separate module environment.

The dedicated config includes one auth test plus six feature journeys. The
legacy Playwright config excludes only these two fixture-specific files; the
dedicated blocking CI job runs them with their isolated prerequisites. CA-only
pull requests also trigger that cross-service job. Existing push/deployment
filters, destinations, and credentials are unchanged.
