# CNB Funding Research

This folder holds the offline research CLIs and static review site for the
Concept Note Builder funding-reference workflow. The CLIs accept caller-supplied
JSON inputs and write local review artifacts under `output/cnb_research/`.
Generated runs are ignored by Git except for the retained EUCF reference bundle
described below. Reusable models, orchestration, Firecrawl tools, and the
production prompt stay in the standard Climate Advisor application folders.

```text
scripts/cnb_research/
|-- research_funding_opportunity.py
|-- research_funded_projects.py
|-- run_similar_project_matching.py
|-- import_reviewed_reference_data.py
|-- review.html
|-- review.css
`-- review.js

output/cnb_research/
|-- ef602f2c-f47d-4384-b079-5fdfde085ad4/
|   `-- research_bundle.json       # Tracked EUCF reference bundle
`-- <run_id>/                      # Other generated artifacts; ignored by Git
```

From `climate-advisor/`:

```powershell
uv run python -m scripts.cnb_research.research_funding_opportunity `
  --input path/to/research-request.json `
  --output output/cnb_research
```

To generate a project-anchored funded-project research artifact without
requiring canonical-funder data:

```powershell
uv run python -m scripts.cnb_research.research_funded_projects `
  --project path/to/current-project.json `
  --input path/to/research-request.json `
  --output output/cnb_research
```

The same command accepts a strict batch manifest with `batch_name` and a
non-empty `requests` array. Each request is the normal
`FundingOpportunityResearchRequest`; the batch file supplies program seeds, not
candidate project facts. `--project` is always required and must match
`CnbSimilarProjectSearchRequest`. The script embeds that validated profile into
every single or batch request so its name, summary, sector, location,
interventions, finance route, and curated tags guide model queries and project
prioritization. Metadata-only or blank profiles are rejected. The target project
is search context, never evidence for a candidate row.

`--funders` is optional. Supplying a canonical-funder snapshot adds identity
candidates for later human review; omitting it leaves `candidate_funders` empty
without blocking discovery. The script runs the existing Firecrawl/model
pipeline independently for every request and writes
`<slugified-batch-name>.batch.json` with the generated run IDs and research
artifact paths. To rerun one failed entry without repeating completed work, pass
its 1-based batch position as `--request-index N`. The selected request writes
its ordinary per-run artifact and does not overwrite the existing full batch
index. Set `target_funded_projects` to a positive integer up to 50 to keep each
request in source-grounded breadth discovery after its first deeply supported
project; the default remains one. This wrapper defaults omitted `max_turns` to
20 while preserving an explicit caller value.

For the widest reproducible scan, supply a caller-owned batch whose request
entries seed official pages that enumerate completed or selected projects. The
batch still contains no project records: the model must extract every retained
project and its evidence from the captured sources.

```powershell
uv run python -m scripts.cnb_research.research_funded_projects `
  --project path/to/current-project.json `
  --input path/to/award-portfolio-batch.json `
  --output output/cnb_research
```

Add `--funders path/to/canonical-funders.json` only when the same discovery run
should also propose canonical identities for later review.

To exercise the configured runtime matcher with plan-aligned, approved research
artifacts, derive candidates from one or more reviewed pairs:

```powershell
uv run python -m scripts.cnb_research.run_similar_project_matching `
  --search-request path/to/search-request.json `
  --funders path/to/canonical-funders.json `
  --research path/to/run-a.research.json --review path/to/run-a.review.json `
  --research path/to/run-b.research.json --review path/to/run-b.review.json `
  --output output/cnb_research
```

Reviewed-pair mode reuses the strict importer validation, preserves the
reviewer-selected canonical funder and retained evidence, normalizes reviewed
tags, deduplicates equivalent projects deterministically, and records the
resolved funder snapshot plus every research/review artifact path. It performs
no database writes. Human approval and tag/funder curation remain required by
the plan; project discovery does not happen in the browser or matcher input.

For focused fixture and service tests only, the legacy mode accepts an explicit
candidate snapshot:

```powershell
uv run python -m scripts.cnb_research.run_similar_project_matching `
  --input path/to/similar-project-input.json `
  --source-bundle path/to/research_bundle.json `
  --output output/cnb_research
```

The legacy fixture input contains `search_request`, `candidates`, and optional
lightweight `sources`. It is strict: candidate and source IDs must be unique, every
candidate must retain its own canonical `funder_id`, and the request must
represent fields extracted after project-upload ingestion. The default
`funder_scope` is `same_funder`, which requires every candidate to use the
request's canonical funder. Set `funder_scope` to `cross_funder` only for an
explicit broad search over reviewed candidates from multiple funders; the
candidate funder identities remain unchanged. A request may return at most 50
reviewable matches. The command uses the
same `ProjectMatchingService`, prompt, configured model, shortlist rules, and
structured-output validation as the runtime workflow. Its store and
reference-data adapters are in-memory, and it disables provider-side response
storage, so this is a provider-backed local review run, not proof of production
ingestion, persistence, or database IDs.

Each local match run writes:

- `<run_id>.similar-projects.input.json`, the normalized input snapshot;
- `<run_id>.similar-projects.json`, the model result, candidates, evidence,
  provenance metadata, and pending review state.

In legacy fixture mode, the optional `--source-bundle` path is recorded for
auditability but is not parsed or changed. Local run IDs and candidate IDs must
not be treated as production identities unless the supplied snapshot actually
came from the production contracts.

The canonical-funder snapshot may be a top-level JSON array or an object whose
`funders`, `items`, `results`, or `data` key contains an array of
`{"funder_id": "uuid", "name": "Canonical name"}` records.

The commands load `OPENAI_API_KEY` and `FIRECRAWL_API_KEY` from the local
environment, use the model and prompt configured in `llm_config.yaml`, and
write only local artifacts. They have no database dependency and never write to
the database. An input manifest may include a validated `current_filled_object`
to continue from an existing partial dossier; otherwise the runtime creates a
seed-only object before the first model turn. `target_funded_projects` defaults
to one and keeps discovery active until that many distinct project rows are
captured or the final audit records why the target could not be reached.
`max_turns` is optional. The generic funding-opportunity CLI uses the shared
15-turn model default, while the funded-project similar-search wrapper defaults
to 20. Both preserve an explicit positive caller limit.

New bundles use schema version `2.0`. They contain one funder and one shared
`funding_records` collection, with `is_opportunity` distinguishing the program
from funded projects. Project interventions and award information stay in the
same funded-project row. Templates and criteria link to the opportunity record.

The funded-project wrapper reuses the same research pipeline. When `--funders`
is supplied it also runs the shared deterministic canonical-funder matcher over
funded-project rows only; otherwise the identity-candidate arrays remain empty.
It writes `<run_id>.research.json` beside the normal run artifacts so review can
pair the research and review files by the shared `run_id`.

The configured model is `gpt-5.6-terra` with `medium` reasoning. The prompt is
kept in `prompts/cnb_funding_opportunity_research.md`; the Firecrawl integration
is kept in `service/app/tools/firecrawl.py`.

If `MLFLOW_ENABLED=true`, the commands also use the shared Climate Advisor
MLflow setup. They start a run in `MLFLOW_EXPERIMENT_NAME`, activate the
existing OpenAI autologging, record run parameters and coverage metrics, and
upload redacted copies of the bundle, review, and trace plus the exact
Markdown source snapshots under `sources/`. One parent workflow trace contains
the OpenAI model spans and Firecrawl tool spans, including failed calls that the
workflow handles and retries. Every run is tagged
`module=concept_note_builder` and
`workflow=cnb_funding_opportunity_research`. MLflow is
best-effort: an unavailable tracking server does not prevent local output.

Each `<run_id>/` contains:

- `research_bundle.json`
- `<run_id>.research.json` when `research_funded_projects.py` is used
- `review.md`
- `agent_trace.jsonl`
- `sources/<source_ref>.md`

Each source reference is derived from the canonical URL and captured Markdown
hash. Evidence resumed from a prior filled object counts toward coverage only
when the current run captures the same source identity. Otherwise the target
remains unresolved so the agent must recapture or replace its evidence; any
still-unverified evidence is dropped and recorded as a review gap. Model output
also rejects duplicate record identifiers and project, action, or conflict links
to missing records.

`research_bundle.json` remains the canonical full run bundle. The funded-project
wrapper also writes `<run_id>.research.json`, which keeps the same run-level
shape but adds review-facing funded-project fields:

- `reported_funder_name`
- `candidate_funders`
- `selected_funder_id`
- `project_tags`

When a funded-project source does not state the funder name, candidate matching
may use the known dossier funder name. This leaves `reported_funder_name` null,
does not auto-select `selected_funder_id`, and labels the candidate as a
dossier-funder match for reviewer visibility.

The run-level JSON embeds the effective request, including the required target
project profile, and run metadata such as the model, reasoning effort, prompt
SHA-256, timing, turn use, termination reason, and MLflow run ID. The model
receives the validated current filled object, the code-generated
`<missing_data>` priorities, and its remaining turn budget on each checkpoint.
One final no-tools turn performs the systematic gap audit.

## Review the result

Open `scripts/cnb_research/review.html` directly in a browser, or serve the
project folder locally if the browser limits local files:

```powershell
uv run python -m http.server 8080
```

Then visit
`http://localhost:8080/scripts/cnb_research/review.html`. The same page accepts
either a generated `<run_id>.research.json` corpus artifact or a
`<run_id>.similar-projects.json` matching artifact. Older
`research_bundle.json` files still load for inspection, but the funded-project
import workflow expects `<run_id>.research.json` so each funded project carries
canonical-funder candidates and local `project_tags`.

Each top-level section can be collapsed, as can nested objects and individual
records. Every disclosure shows an explicit `Expand` or `Collapse` action.
Every ordinary leaf field can be edited. Optional fields can be included or
excluded; fields required by the import contract stay selected and are labelled
`Required for import`. The entire right panel, including evidence, review
status, reviewer, and notes, is hidden until a field is selected, then reveals
that field's mapped evidence, gaps, and conflicts alongside the review controls.
Use the panel's `Close` action to return to the full-width editor.

Technical `*_ref` and `*_reference` fields remain preserved in the saved object
but are not displayed, editable, selectable, or included in visible field
counts. Monetary inputs use thousands separators for readability, accept grouped
or ungrouped decimal values, and retain numeric meaning in the saved update.

Evidence, gaps, and conflicts whose target paths do not map to an editable
dossier field remain visible with human-readable labels in a `Needs follow-up`
section; their technical target paths stay hidden from reviewers.

Each funded project requires exactly one reviewer-selected `selected_funder_id`
chosen from its code-owned `candidate_funders` dropdown. Reviewers can also add
`project_tags` one per line. Saving rejects missing or unknown canonical-funder
selections.

`Save review` downloads `<run_id>.review.json`. The review file is paired to
the research file by the shared top-level `run_id`; the browser does not
compute, store, or validate a SHA. The review file contains top-level
`run_id`, `schema_version`, `update_type`, `saved_at`, review metadata, every
field decision, and the selected edited `reviewed_reference_data`. It does not
modify the source research JSON and makes no API or database request. Save the
file beside the source run artifacts when it should travel with that run.

For a similar-project artifact, the page shows the extracted current-project
fields, model-selected matches joined to their candidate name, applicant,
location, award, and summary, plus cited source evidence and caveats. Reviewers
can keep or exclude each whole match and edit its rationale, matched tags, and
caveats. Saving downloads `<run_id>.similar-project-review.json` with
`update_type: cnb_similar_project_review`, field-level audit decisions, and the
reviewed `matches` and result caveats. This review file is an internal/local QA
artifact; it is not accepted by the reference-data importer and does not write
runtime workflow state.

Set `CNB_DATABASE_URL` to the externally managed CNB PostgreSQL database, then
validate the reviewed pair and canonical funder IDs without writing:

```powershell
uv run python -m scripts.cnb_research.import_reviewed_reference_data `
  --research output/cnb_research/<run_id>/<run_id>.research.json `
  --review output/cnb_research/<run_id>/<run_id>.review.json `
  --dry-run
```

Remove `--dry-run` only after validation. The importer rejects mismatched run
IDs, reviews that are not approved, missing or unknown canonical funders, and
funded projects without retained evidence. It inserts reviewed funded projects,
source documents, evidence, and normalized tags in one transaction. It never
creates or migrates the datateam-managed tables. The browser remains local-only,
never receives database credentials, and never writes to CNB tables directly.
If no proposed funder is valid, research, review, and import that canonical
funder before retrying the project import.

## Tracked reference bundle

`output/cnb_research/ef602f2c-f47d-4384-b079-5fdfde085ad4/research_bundle.json`
is the single tracked live-run output. It contains the European City Facility
(EUCF) Call 7 result produced on 2026-07-21 with Firecrawl and the configured
`gpt-5.6-terra` medium-reasoning model, then manually curated against its
official sources: 2 funding records, 1 application-form structure, 5 sources,
38 evidence records, 9 criteria, and 5 deliberately retained gaps. All other
generated run artifacts remain local and ignored.
