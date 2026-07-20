# CNB Funding-Opportunity Research

This folder holds the offline research CLI and authoritative input manifests
for the Concept Note Builder funder-research pipeline. Generated review outputs
are written to the ignored `output/cnb_research/` folder. Reusable models,
orchestration, Firecrawl tools, and the production prompt stay in the standard
Climate Advisor application folders.

```text
scripts/cnb_research/
|-- files/       # Input manifests selected before each research run
`-- research_funding_opportunity.py

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

The configured model is `gpt-5.6-terra` with `medium` reasoning. The prompt is
kept in `prompts/cnb_funding_opportunity_research.md`; the Firecrawl integration
is kept in `service/app/tools/firecrawl.py`.

If `MLFLOW_ENABLED=true`, the command also uses the shared Climate Advisor
MLflow setup. It starts a run in `MLFLOW_EXPERIMENT_NAME`, activates the existing
OpenAI autologging, records run parameters and coverage metrics, and uploads
redacted copies of the bundle, metadata, review, and trace. MLflow is
best-effort: an unavailable tracking server does not prevent local output.

Each `<run_id>/` contains:

- `request.json`
- `run_metadata.json`
- `research_bundle.json`
- `review.md`
- `agent_trace.jsonl`
- `sources/<source_ref>.md`

`run_metadata.json` records the model, reasoning effort, prompt SHA-256, start
and completion times, duration, turn use, termination reason, and MLflow run ID
when one was created. The model receives the validated current filled object,
the code-generated `<missing_data>` priorities, and its remaining turn budget on
each checkpoint. One final no-tools turn performs the systematic gap audit.

## Retained live trials

- `1b519545-44c5-469d-8842-2e95143b7241`: Minnesota Solar on Public
  Buildings; 6 sources, 25 evidence records, 9 criteria, and 6 declared gaps.
- `2749dacc-cf53-4bab-9b49-749e86b6809c`: Minnesota Local Climate Action
  Grants; 3 sources, 19 evidence records, 4 criteria, and 19 declared gaps.

Both were executed on 2026-07-20 with Firecrawl and the configured
`gpt-5.6-terra` medium-reasoning model. Failed schema-debugging runs and the
superseded validation run are not retained.
