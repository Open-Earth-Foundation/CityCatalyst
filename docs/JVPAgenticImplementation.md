# JVP document workspace implementation

The implementation branch is `feature/jvp-agentic-workspace`, based on develop
`e16b8f047`. The product mapping is in `JVPAgenticFlowMapping.md`.

The implementation uses a new durable semantic point layer in the existing CNB
workspace database. Existing chapter gaps and their history are preserved; they
do not become accepted facts merely because an older gap was resolved. Shared
Clima document-workspace services own point commands, evidence candidates,
questions and view projections. CNB supplies the authorized run, template and
existing drafting/review adapters. The generic Clima core prompt stays generic.

Points materialize before prose from a versioned snapshot of the selected
template. Explicit semantic keys may be shared by several chapters; ambiguous
legacy field labels remain template/chapter scoped. Candidate extraction,
acceptance, parked work and draft freshness are distinct. Required assumptions
or not-applicable answers need explicit setup permission and a reason.

The public browser contract is `app/src/util/document-workspace.ts`. Initial CA
routes (all beneath `/v1`) are:

```text
GET  /concept-notes/{run_id}/workspace
PUT  /concept-notes/{run_id}/setup
POST /concept-notes/{run_id}/points/{point_key}/commands
POST /concept-notes/{run_id}/points/{point_key}/question
POST /concept-notes/{run_id}/exports
```

Point commands carry `expected_version` and `idempotency_key`. A stale command
returns 409. Screen and scoped Clima tools call the same services. Model inputs
use semantic keys and local source/candidate handles; backend closures supply
authorization and UUIDs. All full prompts follow the configured Pydantic
role/task/input/output contract; reusable tool fragments remain scoped.

CityCatalyst's existing IngestDocumentPool and NativeInputCatalog remain the
owners of reusable source files. The CNB document adapter lists and attaches
existing city-visible documents with both source and target authorization. It
does not create a parallel file store or widen source visibility.

The first functional implementation uses stable chapter dependencies for safe
background updates. Accepted point revisions and durable update jobs commit
together. Manual or Ready text receives a review proposal. Passage granularity
requires stable editor block identities and is not inferred from Markdown
offsets. Working export remains available with caveats; final export is checked
server-side against the same revision snapshot, required points, conflicts,
freshness and required review.

Run ownership remains private in this first draft, while explicitly shared city
sources can be reused. City-wide draft collaboration requires a coordinated
change across threads, uploads, points and proposals; caller identities are
never replaced with the creator's identity to bypass ownership. Voice notes,
maps and the multi-step Deep decision remain the later PRD scope.

## Supported first draft

The supported document type is **Concept note**, using a programme template or
the existing reviewed custom-template workflow. A CAP methodology adapter is
not implemented, and unsupported document types return 422. No sample points or
prototype figures are shipped as project facts. Existing templates with string
requirements work immediately; explicit semantic keys, typed fields and evidence
needs in a reviewed template enable richer sharing and guidance.

The default screen is Overview. Context groups evidence needs and provides the
existing upload flow plus a paginated picker of reusable city-visible documents.
To do and chat render the same point card: the person can confirm or dismiss
evidence, answer, correct, park/resume, or record a permitted exception. Choice
controls use declared template options without needing a model call. Clima's
read-only tools find/open that card; opening a question never saves an answer.
Draft markers with an exact canonical field key open the same point. Legacy
narrative findings keep their existing review path.

Reused files keep their original IngestDocumentPool identity and get a
target-run association, rather than a second catalog. The original visibility,
scope, lifecycle and byte identity are checked again on artifact reads and at
source-backed acceptance/final export. Withdrawn, superseded or inaccessible
supporting sources block final export. Working exports remain available with
caveats. Read projections do not eagerly rewrite source availability, so a
previously accepted value can remain visible until the next checked operation.

Arbitrary structured CC fields are not heuristically converted into accepted
template points. Existing authorized CC context remains available to Clima and
drafting. Source reading produces candidates and the person decides what to
accept. Passage-level updates, team assignment/notifications, CAP methodology,
voice, maps and Deep decision require subsequent adapters or product work.

## Running and checking

Use the existing CC Concept Note Builder and Climate Advisor feature flags,
service authentication, CA database and `CNB_DATABASE_URL`. There are no new
provider credentials or runtime environment variables. Apply the CNB migration
before starting this version of CA, from `climate-advisor`:

```powershell
uv run --directory service alembic -c cnb-alembic.ini upgrade head
```

The target head is `20261115_120000`. The existing CA startup owns the durable
point-update reconciler. It remains inactive when CA/CNB storage is unconfigured.

To exercise the workflow:

1. Create a Concept Note, choose a funding template or reviewed custom template,
   and open Overview/To do before drafting prose.
2. Enter an answer or attach an existing city document in Context. Review any
   extracted candidates and citations before confirming.
3. Park another point with the person/material being waited on. Reload and
   resume it; open the same point through chat.
4. Generate the draft, then change an accepted point. Dependent chapters update
   in the background; manual/Ready text requires accepting a normal edit proposal.
5. Download a working DOCX/PDF with caveats. Resolve required work and confirm
   required chapters before requesting final export.

Local validation evidence is in `output/jvp-functional-validation/` (ignored
artifacts): a fresh PostgreSQL 17 schema through the full migration chain,
12 functional persistence/concurrency/export scenarios, nine browser scenarios,
English screenshots and a verified working DOCX. PostgreSQL checks use actual
services and locks with controlled reader/drafter output. Browser checks run
actual CC components against controlled API fixtures. They do **not** establish
live provider quality or full authenticated CC-to-CA/storage integration.

The branch was subsequently deployed to the existing Mikrus test stack. Live
authenticated verification uses explicitly fictional project materials and real
storage, OCR, Clima, candidate extraction, drafting and export services. The
current full-flow audit and recorder artifacts are kept separately in
`output/browser-demo-recording/jvp-full-flow-20261115/`; its report distinguishes
preflight failures, fixes, deployed checks and the final continuous recording.
Do not treat the earlier controlled browser scenarios as live-provider evidence.
Live CNB benchmark evaluation remains a release check before a PR.

Final focused regression batches passed 189 Jest tests and 189 pytest tests.
Next route types were regenerated and TypeScript `tsc --noEmit` passed. Changed
TypeScript files passed ESLint; the new Python modules passed Ruff/Black checks
(Ruff excludes `__init__.py` from the repository's package-name rule). The local
validation report preserves the PostgreSQL run's original tested hashes and the
later browser rerun separately.


### Workspace presentation (local UI pass, November 15)

The document pane has a fixed compact header and a single tab row, with one
vertical scrolling content region shared by Overview, Context, To do, Structure
and Draft. Export stays in a reachable header dialog. Setup emptiness is an
actionable template choice rather than zero-point completion. Ready workspaces
show coverage, the next point and compact current facts; evidence and export
checks expand on demand. On narrow screens a Document/Clima switch preserves
both panes while giving each the available width. Component container queries
adapt the To do list and Overview columns to the document pane's actual width.

Canonical gap markers open the matching point in To do directly. Chapters with
missing or stale validation open document review before a confirm command is
allowed. Source-unavailable conflicts direct the user to evidence; revision
conflicts offer refresh. Current accepted answers and their basis remain visible
while a conflicting source is awaiting a decision. Current citations use the
server-authoritative accepted_candidate_id; explicit null denotes a human answer
without candidate attribution, and earlier accepted candidates remain history. This pass keeps all command,
review and export authority on the existing backend; deployed screenshots and
visual critique follow the local component checks.


### Screenshot-review follow-up

The desktop pane switch now uses Chakra responsive visibility. At narrow widths
the breadcrumb/title, status/actions and five short tab labels use a compact
header; layout verification is recorded separately with the deployed screenshots.
Covered points open in read mode and retain explicit unsaved edits through query
refreshes. Numbers use locale separators and only a declared definition unit;
dates use locale display while commands retain raw numeric and ISO values.
Required facts and evidence appear first, with optional exceptions disclosed.

Overview derives open draft questions from the same chapterGapRows normalizer as
Draft, including unpersisted legacy markers. Pending proposals offer View changes
without changing the current tab or focus. Whole-chapter proposals compare common
paragraphs for display only (bounded to 256 paragraphs per side); unchanged prose
renders normally. All displayed changed regions still invoke the original atomic
EditChange IDs and preserve backend source/gap metadata and approval semantics.
The two point-card surfaces share pending mutation state via a run-and-point
fixedCacheKey; source failures explain evidence recovery without blocking manual
answers or unrelated candidates. Dashboard notes use compact rows, secondary
content-gated export and a menu for lifecycle actions; illustrative workflow
percentages are no longer presented as document readiness.

Validation readiness and human chapter confirmation remain distinct: a current
Ready validation still offers Review & confirm until that revision has a saved
human confirmation. Final export shows its outstanding checks immediately. The
guided review downloads explicitly say working draft; final documents use the
header Export action and its server eligibility check. Persisted completed-chapter
progress permits dashboard working export while the detailed summary loads.

### Selection toolbar and persisted formatting

Selecting current Draft prose opens a compact CC toolbar: Ask for changes, Font,
Bold and Italic. There is no link action. Alt+F10 moves keyboard focus into the
toolbar; native focusgroup is used where supported, with a conditional roving
tabindex fallback elsewhere. Escape closes it without losing or immediately
recapturing the selected range. Toolbar focus and the instruction field retain a
captured selection; unchanged background query refreshes do not clear an edit.

The preview's text spans carry parser source positions from the **complete stored
Markdown**. The displayed duplicate chapter heading is removed from the AST, not
from the source string. DOM ranges map back through escape/entity decoding and
UTF-16 boundaries, then become Unicode codepoint offsets for the API. This selects
the correct occurrence of repeated text and does not search for the first matching
sentence. Complete formatting wrappers are included when their entire contents
are selected. Cross-chapter selections, links, code and gap/review controls are
excluded. Revision/content changes invalidate the selection. The toolbar is not
offered while another proposal is being reviewed/processed or drafting is busy.

Both AI requests and formatting use the existing edit-proposal POST/apply flow.
A direct Bold/Italic/Font click is the human formatting command: its deterministic
proposal is applied immediately with the server revision vector. AI prose changes
remain pending until explicit human acceptance. Selection scope contains chapter_id, base_revision, start, end
and exact selected_markdown. The server owns the allowed AI window: selected text
plus the immediately preceding and following sentences, with bounded context.
Formatting is deterministic and restricted to the exact selection. Formatting saves only after the explicit toolbar command; AI never applies itself.
A stale response is not automatically retried.
The instruction remains available after a failed request.

Persisted formatting uses only strict span attributes data-cc-font (default,
serif, mono), data-cc-bold and data-cc-italic (true/false). Only this allowlist is
converted by the remark renderer; arbitrary HTML, styles, links or events are not
enabled. Existing Markdown inside the wrapper stays parsed, with explicit off
overrides applying to inherited strong/emphasis. Current prose and inline/block
proposal previews share this renderer. Saved markup is part of the authoritative
Markdown supplied to AI; export and server selection-fence checks use the same
stored body, rather than DOM-only formatting.

Focused UI regression coverage includes repeated occurrences, title offsets,
Unicode/escapes/entities, strict formatting and proposal rendering, keyboard
selection, focus retention, Escape, authoritative scope payloads and a stale 409
without automatic retry. Deployed-provider validation and recording are tracked
separately from these controlled local tests.
