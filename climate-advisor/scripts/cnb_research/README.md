# CNB Funding-Opportunity Research

This folder holds the offline research CLI and authoritative input manifests
for the Concept Note Builder funder-research pipeline. Generated review outputs
are written to the ignored `output/cnb_research/` folder. Reusable models,
orchestration, Firecrawl tools, and the production prompt stay in the standard
Climate Advisor application folders.

```text
scripts/cnb_research/
|-- files/                         # Input manifests selected before each run
|-- research_funding_opportunity.py
|-- review.html                    # Static human-review workspace
|-- review.css
`-- review.js

output/cnb_research/
`-- <run_id>/    # Generated local review artifacts; ignored by Git
```

From `climate-advisor/`:

```powershell
uv run python -m scripts.cnb_research.research_funding_opportunity `
  --input scripts/cnb_research/files/solar_on_public_buildings.json `
  --output output/cnb_research
```

The command loads `OPENAI_API_KEY` and `FIRECRAWL_API_KEY` from the local
environment, uses the model and prompt configured in `llm_config.yaml`, and
writes only local artifacts. It has no database dependency or database tool.
An input manifest may include a validated `current_filled_object` to continue
from an existing partial dossier; otherwise the runtime creates a seed-only
object before the first model turn.

New bundles use schema version `1.2`. Funding links, financial amounts, and
pipeline entries share one optional integer `calendar_year`; they do not expose
fiscal-year labels or a separate award-year field.

The configured model is `gpt-5.6-terra` with `medium` reasoning. The prompt is
kept in `prompts/cnb_funding_opportunity_research.md`; the Firecrawl integration
is kept in `service/app/tools/firecrawl.py`.

If `MLFLOW_ENABLED=true`, the command also uses the shared Climate Advisor
MLflow setup. It starts a run in `MLFLOW_EXPERIMENT_NAME`, activates the existing
OpenAI autologging, records run parameters and coverage metrics, and uploads
redacted copies of the bundle, review, and trace. MLflow is
best-effort: an unavailable tracking server does not prevent local output.

Each `<run_id>/` contains:

- `research_bundle.json`
- `review.md`
- `agent_trace.jsonl`
- `sources/<source_ref>.md`

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
field's mapped evidence, gaps, and conflicts alongside the review controls.
Technical `*_ref` and `*_reference` fields remain preserved in the saved object
but are not displayed, editable, selectable, or included in visible field counts.
Monetary inputs use thousands separators for readability, accept grouped or
ungrouped decimal values, and retain numeric meaning in the saved update.

`Save update` downloads `<run_id>.review-update.json`. The update contains
source-bundle hashes when browser crypto is available,
the review decision and notes, every field decision, and the selected edited
`reviewed_opportunity`. It does not modify the source bundle and makes no API or
database request. Save the file beside the source run artifacts when it should
travel with that run.

Database persistence is intentionally not implemented. A future authenticated
server endpoint can accept the saved review-update contract after explicit user
confirmation; the browser must never receive database credentials or write to
CNB tables directly.

## Retained live trials

- `9023c3d6-8581-4e7b-91d1-b65db544559b`: European City Facility (EUCF)
  Call 7 confirmation run; 8 sources, 26 evidence records, 10 criteria, and 11
  declared gaps. This run also confirmed that `research_bundle.json` is the
  only generated JSON review artifact.
- `1b519545-44c5-469d-8842-2e95143b7241`: Minnesota Solar on Public
  Buildings; 6 sources, 25 evidence records, 9 criteria, and 6 declared gaps.
- `2749dacc-cf53-4bab-9b49-749e86b6809c`: Minnesota Local Climate Action
  Grants; 3 sources, 19 evidence records, 4 criteria, and 19 declared gaps.

The Minnesota trials were executed on 2026-07-20 and the EUCF confirmation on
2026-07-21, all with Firecrawl and the configured `gpt-5.6-terra`
medium-reasoning model. Failed schema-debugging runs and superseded validation
runs are not retained.
