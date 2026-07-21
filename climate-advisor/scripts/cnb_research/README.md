# CNB Funding-Opportunity Research

This folder holds the offline research CLI for the Concept Note Builder
funder-research pipeline. The CLI accepts a caller-supplied input manifest and
writes review outputs under `output/cnb_research/`. Generated runs are ignored
by Git except for the retained EUCF reference bundle described below. Reusable
models, orchestration, Firecrawl tools, and the production prompt stay in the
standard Climate Advisor application folders.

```text
scripts/cnb_research/
|-- research_funding_opportunity.py
|-- review.html                    # Static human-review workspace
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

The command loads `OPENAI_API_KEY` and `FIRECRAWL_API_KEY` from the local
environment, uses the model and prompt configured in `llm_config.yaml`, and
writes only local artifacts. It has no database dependency or database tool.
An input manifest may include a validated `current_filled_object` to continue
from an existing partial dossier; otherwise the runtime creates a seed-only
object before the first model turn. `max_turns` is optional and defaults to 15;
callers may still supply a different positive limit for a deliberately shorter
or longer run.

New bundles use schema version `2.0`. They contain one funder and one shared
`funding_records` collection, with `is_opportunity` distinguishing the program
from funded projects. Project interventions and award information stay in the
same funded-project row. Templates and criteria link to the opportunity record.

The configured model is `gpt-5.6-terra` with `medium` reasoning. The prompt is
kept in `prompts/cnb_funding_opportunity_research.md`; the Firecrawl integration
is kept in `service/app/tools/firecrawl.py`.

If `MLFLOW_ENABLED=true`, the command also uses the shared Climate Advisor
MLflow setup. It starts a run in `MLFLOW_EXPERIMENT_NAME`, activates the existing
OpenAI autologging, records run parameters and coverage metrics, and uploads
redacted copies of the bundle, review, and trace plus the exact Markdown source
snapshots under `sources/`. One parent workflow trace contains the OpenAI model
spans and Firecrawl tool spans, including failed calls that the workflow handles
and retries. Every run is tagged
`module=concept_note_builder` and
`workflow=cnb_funding_opportunity_research`. MLflow is
best-effort: an unavailable tracking server does not prevent local output.

Each `<run_id>/` contains:

- `research_bundle.json`
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

`research_bundle.json` is the only JSON file to open for review. It embeds the
original request and run metadata, including the model, reasoning effort,
prompt SHA-256, timing, turn use, termination reason, and MLflow run ID. The
model receives the validated current filled object, the code-generated
`<missing_data>` priorities, and its remaining turn budget on each checkpoint.
One final no-tools turn performs the systematic gap audit.

## Review the result

Open `scripts/cnb_research/review.html` directly in a browser, or serve the
project folder locally if the browser limits local files:

```powershell
uv run python -m http.server 8080
```

Then visit
`http://localhost:8080/scripts/cnb_research/review.html`, choose a generated
`research_bundle.json`, and review the dossier. Each top-level section can be
collapsed, as can nested objects and individual records. Every disclosure shows
an explicit `Expand` or `Collapse` action. Every leaf field can be edited and
included or excluded. The entire right panel—including evidence, review status,
reviewer, and notes—is hidden until a field is selected, then reveals that
field's mapped evidence, gaps, and conflicts alongside the review controls. Use
the panel's `Close` action to return to the full-width editor.
Technical `*_ref` and `*_reference` fields remain preserved in the saved object
but are not displayed, editable, selectable, or included in visible field counts.
Monetary inputs use thousands separators for readability, accept grouped or
ungrouped decimal values, and retain numeric meaning in the saved update.

Evidence, gaps, and conflicts whose target paths do not map to an editable
dossier field remain visible with human-readable labels in a `Needs follow-up`
section; their technical target paths stay hidden from reviewers.

`Save update` downloads `<run_id>.review-update.json`. The update contains
source-bundle hashes when browser crypto is available,
the review decision and notes, every field decision, and the selected edited
`reviewed_reference_data`. It does not modify the source bundle and makes no API
or database request. Save the file beside the source run artifacts when it
should travel with that run.

Database persistence is intentionally not implemented. A future authenticated
server endpoint can accept the saved review-update contract after explicit user
confirmation; the browser must never receive database credentials or write to
CNB tables directly.

## Tracked reference bundle

`output/cnb_research/ef602f2c-f47d-4384-b079-5fdfde085ad4/research_bundle.json`
is the single tracked live-run output. It contains the European City Facility
(EUCF) Call 7 result produced on 2026-07-21 with Firecrawl and the configured
`gpt-5.6-terra` medium-reasoning model, then manually curated against its
official sources: 2 funding records, 1 application-form structure, 5 sources,
38 evidence records, 9 criteria, and 5 deliberately retained gaps. All other
generated run artifacts remain local and ignored.
