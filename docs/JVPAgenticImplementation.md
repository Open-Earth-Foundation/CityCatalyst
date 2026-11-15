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
live provider quality or full authenticated CC-to-CA/storage integration, and
this branch has not been deployed. Live CNB benchmark evaluation remains a
release check before a PR.

Final focused regression batches passed 189 Jest tests and 189 pytest tests.
Next route types were regenerated and TypeScript `tsc --noEmit` passed. Changed
TypeScript files passed ESLint; the new Python modules passed Ruff/Black checks
(Ruff excludes `__init__.py` from the repository's package-name rule). The local
validation report preserves the PostgreSQL run's original tested hashes and the
later browser rerun separately.
