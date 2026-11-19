# crva-mirco

Runs Mirco's standalone agentic PDF extraction pipeline (`pdf-extraction/` on branch `mr/pdf-taxonomy-extraction`) on the CRVA reports and scores it with the CC-1285 eval harness, against adapter v0 and our own agent (`../crva-agent/`). Mirco's code is used unchanged.

The comparison mixes model and pipeline: the pipeline uses agentic `gpt-6.1-sol`, while v0 and our own agent use `gpt-5.6-luna`. It does not isolate the effect of the agent.

## Files

- `inputs.ts`: builds the CRVA JSON Schema (Draft 2020-12, the 12 v0 fields, one array of items per field) and the user prompt from the constants in `src/backend/ingest/plugins/ccra/extract-crva-fields.ts`.
  - The item shapes are the v0 shapes, except A1.2a: `{author, title, year, used_for}`, because the gold keeps the title and v0's `{name, year}` lost it.
  - The user prompt is Mirco's default user prompt plus the v0 value rules, detail rules (keep the numbers, dates, causes and figure references the quote supports), granularity rules (one item per hazard × group or sector) and a field guide with what belongs in each field, what does not, and one example item. The examples come from the Buenos Aires gold, so Seattle is the hold-out.
- `convert.ts`: turns the pipeline's result into a CRVA draft bundle. The pipeline reports evidence per data leaf (`/C1.1a/0/hazard`); the converter groups leaves into one v0 value per item, keeps the longest quote that passes the v0 quote check against the harness OCR cache, then dedupes as v0 does. An A1.2a item becomes the v0 value `{name: "<author> — <title>", year}`; `used_for` is not kept. An item gets several quote tries and at most one drop, so its drop rate is not directly comparable with v0. Items whose outcomes are all `ambiguous` are not values; their count is saved as `mirco.ambiguousItems`. A `found` outcome on an empty field array (Mirco's validator requires one) is skipped, not dropped.
- `run-mirco.ts`: runs Mirco's Python client once and writes a harness run folder.

## Setup

1. Check out Mirco's branch in its own worktree, without changing it:

   ```bash
   git worktree add --detach .worktrees/mirco-pdf-extraction origin/mr/pdf-taxonomy-extraction
   cd .worktrees/mirco-pdf-extraction/pdf-extraction
   py -3.12 -m venv .venv
   .venv/Scripts/python.exe -m pip install -r requirements-dev.txt
   ```

2. In that folder, copy `.env.example` to `.env` and set `OPENAI_API_KEY` (Agents API and Files API permissions), `MISTRAL_API_KEY`, `EXTRACTION_MODEL=gpt-6.1-sol`, `EXTRACTION_REASONING_EFFORT=medium` and `MISTRAL_OCR_MODEL=mistral-ocr-4-1`. The `.env` is git-ignored; never commit it.
3. Start the service in `cmd.exe`: `run-demo.cmd` (serves `http://127.0.0.1:8080`).
4. OCR each report once for the quote check (see [`../crva-eval/README.md`](../crva-eval/README.md)), or reuse an existing `reports/crva-eval/<city>/ocr` cache.

## Running

From `app/`:

```bash
npx tsx scripts/crva-mirco/inputs.ts --mirco-dir <path to pdf-extraction>
npx tsx scripts/crva-mirco/run-mirco.ts --city buenos-aires --pdf <report.pdf> \
  --ocr reports/crva-eval/buenos-aires/ocr --mirco-dir <path to pdf-extraction> --ocr-mode off
```

- `--ocr-mode on|off`: turns Mistral OCR preprocessing in the pipeline on or off. The quote check always uses the harness OCR cache.
- Every run uses `--auto-repair --max-repairs 3`, the default system prompt and a client timeout of 7200 s (the client cancels the job at its deadline).
- The runner refuses an `--ocr` cache made from another PDF, then checks `/v1/config` (key set, `gpt-6.1-sol`, `medium`, Mistral key when OCR is on) and stops before any paid call if it fails.
- Output: `reports/crva-eval/<city>/mirco-ocr-<on|off>/<timestamp>/` with `client.log` (job ID), `result.json` (raw result), `run-1.json` (stats, bundle, job ID, usage, repair summary) and `runs.md`.

Score and compare as for adapter runs:

```bash
LLM_BASE_URL="" npx tsx scripts/crva-eval/score-run.ts --gold <gold.xlsx> --run <run dir>/run-1.json --city buenos-aires
npx tsx scripts/crva-eval/compare.ts --label v0 --dir <v0 run dir> --label mirco-off --dir <run dir> --label mirco-on --dir <run dir>
```

## Recovery

Never resubmit a job whose submission is uncertain: it may already be running and paid. With OCR on, the server keeps working after the client's 600 s upload timeout, so a missing job ID does not prove nothing was submitted. If the client stops, the runner prints the job ID from `client.log` when there is one. Poll `GET /v1/extractions/<id>` until it is `completed`, save `GET /v1/extractions/<id>/result` to a file, and convert it without a new submission:

```bash
npx tsx scripts/crva-mirco/run-mirco.ts --city buenos-aires --pdf <report.pdf> \
  --ocr reports/crva-eval/buenos-aires/ocr --ocr-mode off --result <saved result.json> [--job-id <id>] [--minutes <wall time>]
```

Delete the job with `DELETE /v1/extractions/<id>` once the result is saved.
