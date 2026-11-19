# PDF extraction benchmark

**Ticket:** CC-1124. Related: CC-1123 (benchmark contract), CC-1132 (first measurements).

A command that runs PDF inventories through the real GHGI import flow (upload, OCR, extraction, approve), compares the stored values with a Product answer key, and writes a report you can review in a PR. Use it before and after any change to the PDF import, the extraction prompt or the models.

- Command: `npx tsx scripts/pdf-benchmark.ts` from `app/`.
- Code: `app/src/backend/ingestion-benchmark/` (scoring, metrics, baseline, report, MLflow) and `app/scripts/pdf-benchmark/` (runner).
- Data: `app/benchmarks/pdf/` (`cases.json`, `baseline.json`, `prices.json`, `config.example.json`, `schemas/`).
- `prices.json` holds the built-in model prices (by model name), plus `models` (USD per million tokens, with `source` and `date`) and `vendors` (USD per page or credit, with `source` and `date`) that price the envelopes of an external pipeline.
- Output: one folder per run in `docs/ingestion-accuracy-runs/`, plus a line in `docs/ingestion-accuracy-runs/INDEX.md`. The folder is named `<date>-<HHMM>-<commit>`, with `-<study>` added for an [external pipeline](#external-pipelines) run. A run never overwrites a folder: if the name exists (two runs finishing in the same minute), it adds `-2`, `-3` and so on.

## Prerequisites

1. A local Postgres 16 that is migrated and seeded. The sequelize config has no port variable, so it must listen on 5432:

   ```bash
   docker run -d --name ia-pg -e POSTGRES_USER=citycatalyst -e POSTGRES_PASSWORD=local -e POSTGRES_DB=citycatalyst -p 127.0.0.1:5432:5432 postgres:16-alpine
   cd app
   export DATABASE_HOST=127.0.0.1 DATABASE_USER=citycatalyst DATABASE_PASSWORD=local DATABASE_NAME=citycatalyst DATABASE_USE_SSL=false
   npm run db:migrate && npm run db:seed
   ```

2. `app/.env` with the LLM provider keys, the Mistral OCR key, and a bucket for the uploaded PDFs, as for a normal local run. The benchmark labels the run with the model and reasoning effort the application uses for PDF extraction: the `pdf_extraction` entry of `app/llm_config.yaml` (or `LLM_CONFIG_PATH`), prefixed with `LLM_PROVIDER` (default `openai`), which is also the key it looks up in `benchmarks/pdf/prices.json`. It reads `MISTRAL_OCR_MODEL` for the OCR model name.
3. The PDFs and the answer keys on your machine. They are never committed. Copy `app/benchmarks/pdf/config.example.json` to `app/benchmarks/pdf/config.local.json` (git-ignored) and set:
   - `pdfDir`: one folder, or a list of folders searched in order.
   - `answerKeys`: path to `answer-keys.json` (see [Add a PDF and its key](#add-a-pdf-and-its-key)).
   - `outRoot`: where run folders go (default `../docs/ingestion-accuracy-runs`).
   - `allowedVendors`: vendors the generators may send PDFs to (`mistral`, `reducto`, `llamacloud`). Empty by default; see [Generators](#generators).
4. Optional, for MLflow: `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME`, `MLFLOW_TRACKING_PASSWORD` (see [MLflow](#mlflow)).

Never commit PDFs, OCR text, answer-key JSON, `app/.env` or `config.local.json`.

## Run

All commands run from `app/`.

```bash
# See every case: block, eligibility, last baseline date and forecast cost. No execution.
npx tsx scripts/pdf-benchmark.ts --list

# Check a selection and its forecast cost and time. No OCR or LLM call.
npx tsx scripts/pdf-benchmark.ts --cases C-004,C-010 --dry-run

# Run every case in the manifest, in groups of at most 10, with one report.
npx tsx scripts/pdf-benchmark.ts --all --dry-run
npx tsx scripts/pdf-benchmark.ts --all

# Run two cases, 3 attempts each.
npx tsx scripts/pdf-benchmark.ts --cases C-004,C-010

# Run the cases of one block that the current import is expected to handle
# (text tables, scored row by row). Exits 2 while no case has textTables: true.
npx tsx scripts/pdf-benchmark.ts --set validated --eligible --dry-run
npx tsx scripts/pdf-benchmark.ts --set validated --eligible

# Run and record the result as the new baseline for these cases.
npx tsx scripts/pdf-benchmark.ts --cases C-004,C-010 --update-baseline

# Rescore an earlier run with the current scorer and keys. No DB, LLM or OCR call.
npx tsx scripts/pdf-benchmark.ts --rescore ../docs/ingestion-accuracy-runs/<run-folder>/results.json
```

| Flag                             | Effect                                                                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--cases C-004,C-010`            | Explicit case ids.                                                                                                                                                                                              |
| `--set validated\|held-out\|dev` | All cases of one block. `--cases`, `--set` or `--all` is required, only one.                                                                                                                                    |
| `--eligible`                     | Keep cases with `textTables: true` that are not total-only. Combines with `--set`.                                                                                                                              |
| `--all`                          | Every case in the manifest, run in groups of at most 10 files with one report. Exclusive with `--cases` and `--set`. Cases whose PDF or key is missing locally are left out and the run is marked `incomplete`. |
| `--runs N`                       | Attempts per case. Default 3. Any other value marks the run `exploratory`: it is reported but cannot update the baseline.                                                                                       |
| `--list`                         | Print the manifest.                                                                                                                                                                                             |
| `--dry-run`                      | Resolve the selection, print the forecast, exit.                                                                                                                                                                |
| `--update-baseline`              | After a run with 3 attempts per case, write the baseline entries for the cases in this run.                                                                                                                     |
| `--rescore <results.json>`       | Rescore a stored run. Writes a run folder marked `rescore`; never changes the baseline.                                                                                                                         |
| `--pipeline precomputed`         | Score rows made by an external pipeline instead of running the built-in one. Needs `--rows-dir`. Always `exploratory`. See [External pipelines](#external-pipelines).                                           |
| `--rows-dir <folder>`            | The folder with the pipeline's `manifest.json` and result files. Only with `--pipeline precomputed`; alone it exits 2 ("--rows-dir needs --pipeline precomputed").                                                                                                            |
| `--no-mlflow`                    | Skip MLflow even when it is configured.                                                                                                                                                                         |
| `--config path`                  | Use another local config.                                                                                                                                                                                       |

Exit codes: 0 ok, 1 regression or error, 2 configuration or selection error (also `--update-baseline` with `--pipeline`), 3 incomplete run (an `--all` run with missing inputs or unfinished cases, or a `--pipeline precomputed` run with a case that has no envelope; no regression or error), 130 interrupted (Ctrl+C writes a partial report marked `interrupted` and does not update the baseline).

With `--all`, a missing PDF or key does not stop the run: the case is left out and the report and INDEX line are marked `incomplete`, with the missing and unfinished cases listed. Otherwise, a run fails before any paid call when the selection is empty (for example `--eligible` while no case has `textTables: true`), when a case id is unknown, when a PDF or key is missing locally, or when the selection has more than 10 files.

## Add a PDF and its key

1. Add or update the case in the Product workbook (`GHGI_PDF_answer_keys`).
2. Export the workbook to JSON:

   ```bash
   npx tsx scripts/pdf-benchmark/export-answer-keys.ts /path/to/GHGI_PDF_answer_keys.xlsx /path/to/answer-keys.json
   ```

3. Add the case to `app/benchmarks/pdf/cases.json`: `id` (same as the key id), `city`, `country`, `year`, `block` (`validated`, `held-out` or `dev`), `totalOnly`, `textTables` (`null` while unknown), `fileName`, optional `notes`. Held-out cases are kept out of rule writing; do not tune the import on them.
4. Put the PDF in a folder listed in `pdfDir`.
5. Run `--cases <id> --dry-run`, then one real run: `--cases <id>`.

Changing a key or a manifest entry changes the case's test-set version. The next comparison rescores the baseline's stored values with the new key; if those values cannot be read or rescored, the case is reported as `baseline stale: <cause>` and is not compared.

## Update the baseline

Update it when a change is meant to move the numbers (a merged fix, a new model) and you have reviewed the run. Do not update it to hide a regression.

1. Run the cases with the default 3 attempts and `--update-baseline`. Only cases in the run that finished 3 attempts are written; other cases are untouched. Exploratory and interrupted runs never write.
2. Use `--all --update-baseline` to record every case in one run (in groups of 10). A selection with `--cases` or `--set` still takes at most 10 files.
3. Commit the change to `app/benchmarks/pdf/baseline.json` together with the run folders that it points to. The next comparison reads the stored values from those folders.
4. After a change to the scorer (`score.ts`, `profiles.ts`, `tolerance.ts` or the metrics), raise `SCORER_VERSION` in `score.ts`. Each baseline entry records the scorer version it was computed with; an entry from another version is rescored from its run folder, so the baseline and the new run are scored by the same rules. If that rescore cannot complete (run folder or case missing, file unreadable), the case is reported as `baseline stale: <cause>` and is not compared, so results scored under different rules are never compared. The run header shows the scorer version. Run `--rescore` on the baseline's run folders to see the effect first.

**Current baseline.** `baseline.json` starts empty: every case is reported as `no baseline` until a run records it.

## Read the results

Open `report.md` in the run folder. It has:

- **Header:** commit and branch (and a dirty flag), models, reasoning effort, prompt hash, input representation, test-set version, selection, MLflow link or the reason it was not logged. A precomputed pipeline run shows its `Pipeline:` line and `Exploratory: pipeline` instead of the model, prompt hash and input representation, and adds a `Pipeline notes` table per attempt (unknown row roles, dropped rows, lost rows, reported totals, scope basis; unscored). Its INDEX line carries `pipeline=precomputed:<study>`. In a pipeline run the per-case tokens come from the envelope `usage` (n/a when absent), a run with no envelope cost shows cost n/a, the report cuts `total_basis` at 200 characters (`results.json` keeps it whole), and `results.json` has no `ocrModel` or `reasoningEffort`. `appendIndexLine` accepts an INDEX.md saved with CRLF and rewrites it with LF.
- **One section per block** (validated, held-out, dev), never merged: headline recall (failed attempts count as 0), cases with totals within tolerance, recall over scored attempts only, a provisional recall over the row-scored cases whose `textTables` is still unknown (until Product classifies them), share of attempts that pass, attempts 10x or more off the expected total, the share of wrong totals that carried a warning, mean precision, value accuracy and classification accuracy over the cases scored row by row, notation keys recovered, and the cases that stored a distractor value.
- **Guardrails** and warnings returned by the import.
- **Change from the baseline:** per block, the baseline score, the new score and the difference (headline recall, provisional recall, attempts passing, cases with every total within tolerance), then one row per case. Only cases with a baseline count, on both sides; the section says which cases and attempts each score uses.
- **Regressions against the baseline.** Each case gets one verdict:
  - `regression`: the case passed in the baseline and fails now; its recall drops by more than 5 points and below the worst baseline attempt; no attempt passes where the baseline had one; every attempt's total is out of tolerance and further off than the worst baseline attempt (a total within the accepted tolerance never counts, even when the baseline was more exact; the total check is the only quality check on total-only cases); or at least 2 more attempts are 10x or more off than in the baseline. Attempts of one case vary by more than 5 points, so the recall check uses the baseline's own spread rather than a fixed drop. Baseline entries recorded without per-attempt recall are rescored from their run folder to recover it.
  - `error`: an attempt failed in the runner (`approve_error`, `readback_error`, `ocr_error`, `setup_error`), whatever the baseline holds; or a model failure (`extraction_error`, `truncated`, `zero_rows`) appears and the baseline had no model failure for the case. A baseline whose model returned zero rows therefore does not hide a later approve failure. A case with no usable baseline (none recorded, or `baseline stale`) also gets `error` when any attempt fails.
  - `over budget`: the cost is over 3x the forecast (the baseline usage scaled to the same number of attempts). It is reported but does not fail the run.
  - `incomplete`: an interrupted run did not finish every attempt of the case. The case is not checked for regressions or budget, but a failed attempt still gives `error`.

  The command exits with 1 when any case is `regression` or `error`.

- **Failure modes:** `scored`, `ocr_error`, `extraction_error`, `truncated`, `zero_rows`, `approve_error`, `readback_error`, `setup_error`.
- **Per case:** verdict, attempts passed, recall, precision, value accuracy, classification accuracy, notation keys (recovered/scored), distractors stored, total within tolerance, 10x count, cost, tokens, runtime per stage, and the tolerance rule used.
- **Notes:** cases on the legacy tolerance, row-scored cases whose `textTables` is still unknown in the manifest, cases whose application total is off but would be within tolerance after removing the GPC-excluded references the app does not flag yet (CC-1201), cases left out of the baseline, held rows included at approve.

  The runner includes every row the import review holds back, whatever its issue (a reference conflict gets the scope the catalogue expects). A reviewer might skip some of them, such as `direction-unconfirmed` rows. The scores therefore measure what the model extracted, not what a reviewed import would store.

An attempt passes when it is `scored`, its total is within tolerance and it is not 10x off. The total is the application's own: every stored value it does not omit from the total. The benchmark does not remove anything more. GPC keeps more references out of BASIC and BASIC+ than the app flags today (CC-1201); the adjusted total that removes them is a diagnostic in `results.json` and the Notes, never a pass. A case passes when all 3 attempts pass.

`results.json` is the result of every attempt and the source for comparison and rescore. `cases/<id>/attempt-<n>/extracted-values.json` holds the values the import stored. OCR text is written to `cases/<id>/attempt-<n>/ocr.md` for local reading only; it is git-ignored.

`results.json` holds no answer-key content. In each score the key rows that were not found become `missingRowCount`, the stored distractors `distractorsStoredCount` and the stored groups that match no key row `unexpectedStoredCount`; the expected total and the difference to it (`expectedTotal`, `totalDiffPct`) are not written. Recall, precision, accuracies, counts, the stored total and `totalWithinTolerance` stay. Comparison and rescore recompute every score from the stored values and the local keys, so they never need those fields. To clean a run folder written before this rule: `npx tsx scripts/pdf-benchmark/redact-results.ts <run>/results.json <run>/report.md` (rewrites in place; no DB, LLM or OCR call).

## External pipelines

Purpose: score the output of a whole extraction pipeline that is not the built-in one (a vendor API, another team's pipeline) with the same key and the same scorer. The rows go through the real approve step, so the result is what the app would store. Only approve, read-back and scoring are shared: no OCR and no LLM call of the built-in import run.

```bash
npx tsx scripts/pdf-benchmark.ts --cases C-015,C-016 --pipeline precomputed --rows-dir <folder> --dry-run
npx tsx scripts/pdf-benchmark.ts --cases C-015,C-016 --pipeline precomputed --rows-dir <folder>
```

`--pipeline precomputed` needs `--rows-dir`. The run reads one envelope per case and attempt, uploads the PDF, stores the mapped rows on the imported file, approves, reads back and scores. A pipeline run is always `exploratory` (reason `pipeline`), never updates the baseline and is not compared with it. `--update-baseline` with `--pipeline` exits 2. A case with no envelope runs as `setup_error`, and the run is marked `incomplete` and exits 3, even without `--all`. An envelope that cannot be read fails only that attempt: a field that breaks the envelope schema or a status other than `completed` is an `extraction_error` (the pipeline wrote it badly); a missing entry, duplicate, missing file or hash mismatch is a `setup_error`. Either way nothing is uploaded. A pipeline run is not compared with the built-in baseline or budgeted against its forecast; an `approve_error` from the pipeline rows counts as the pipeline's own failure (verdict `error`, "failed" rather than "failed in the runner"), while readback, OCR and setup failures stay the runner's.

### Folder layout

```text
<rows-dir>/
  manifest.json                         study, stage, entries[]
  results/<caseId>-attempt-<n>.json     one envelope per case and attempt
```

Each entry of `manifest.json` has `case_id`, `attempt`, `file` (relative to the folder) and `sha256` of the file. A file that is missing, outside the folder or whose hash differs fails the attempt. `study` and `stage` label the run (`Pipeline:` line, INDEX `pipeline=precomputed:<study>`).

### What the runner reads

From each envelope the runner reads only: `result.data`, `usage`, `execution_status`, `cost_usd`, `mode` and `version`. The pipeline id is always `precomputed`; the envelope `pipeline` field is not read. `result.data` is checked against `app/benchmarks/pdf/schemas/ghgi-envelope.schema.json` (reporting year, reported totals, `total_kind`, and per row `source_label`, `gpc_ref`, `scope`, `emissions_tco2e`, `notation_key`, `row_role`, `total_inclusion`, `scope_basis`). Everything else is never read, copied or written. That includes `benchmark` and `repair`, which can hold expected values, and any other field. Error messages name the case, attempt, file and field, never a value.

### How rows are mapped

The mapping is field by field, with no repair or guessing.

- `row_role` `emission`, `removal` and `notation` become rows. `information` rows are dropped and counted. Any other role is skipped and counted under `unknownRowRoles`.
- A `notation` row has no value; its `notation_key` is kept in canonical form.
- `total_inclusion: excluded` is counted as `excludedNotCarried`. Approve cannot carry it (the omit-from-total flag comes only from fixed GPC references), so the row is still imported and counts in the application total.
- Approve drops some mapped rows. A parent reference such as `I.3` with `scope: null` is dropped as `gpc-reference-unknown`; a row with neither a value nor a notation key is dropped too. The report lists them as lost rows, by import issue code, in the Pipeline notes. `unexplained` or `notSkipped` marks a mismatch between the rows approve skipped and the issues it reported.

The Pipeline notes table shows these counts per attempt, with the reported totals, scope basis and cost. It is not scored.

### Cost

In order: the envelope's `cost_usd` (`envelope`); else its tokens at the price of a model in `prices.json` `models` (`tokens`), found by the envelope `version` or by `<model>.input_tokens` keys in `usage`; else `n/a`. The built-in `prices.json` entries are not used for a pipeline run. The generators write `cost_usd` from `prices.json` `vendors`: a price per page (and per credit for LlamaExtract) with the `source` URL and `date` it was read. A missing price gives `n/a`, never a guess.

### Score variant

The standard score is the headline. A pipeline can report an unsplit subsector (`I.3`, no scope) where the key has children; approve drops that row, so the standard score never sees it. The report adds a labelled variant, "parent refs (Mirco)", beside the standard score, per block and per case. It adds back the parent rows approve dropped, written as `<ref>.x` (Mirco's `scoringReference`). `I.3.x` matches a key row written `I.3` or `I.3.x` only, never a scoped child such as `I.3.1`. If the pipeline gave the children too and approve stored them, the variant counts that amount twice: see the "Of which children were stored too" column. Read the variant as an upper bound for that pipeline, not as a result. `SCORER_VERSION` is unchanged.

### Generators

Three scripts create a rows folder from a vendor API. Each sends the case PDFs to the vendor, writes the envelopes and `manifest.json`, and prints a line per attempt (rows, pages, cost).

```bash
# Mistral OCR with a document annotation. --model is an exact id; "-latest" aliases are refused.
npx tsx scripts/pdf-benchmark/generators/mistral-annotations.ts --model mistral-ocr-4-1 --cases C-015,C-016 --runs 3 [--ranges whole|8] --out benchmarks/pdf/generated/mistral-<date>

# Reducto Deep Extract with citations.
npx tsx scripts/pdf-benchmark/generators/reducto.ts --cases C-018 --runs 1 --out benchmarks/pdf/generated/reducto-<date>

# LlamaExtract Agentic Plus.
npx tsx scripts/pdf-benchmark/generators/llamaextract.ts --cases C-018 --runs 1 --out benchmarks/pdf/generated/llamaextract-<date>
```

Then score the folder with `--pipeline precomputed --rows-dir <out>`.

- `--cases` and `--out` are required; `--runs` defaults to 1 and is at most 3 (3 attempts per case; more exits before any key is loaded or call made); `--config` selects another local config. Reducto and LlamaExtract have a fixed model and mode and refuse `--model` and `--ranges`.
- Mistral `--ranges whole` (default) makes one call over the whole document. `--ranges 8` makes one call per 8 pages and joins the rows without removing duplicates, so a table that two ranges both read counts twice. It is a fallback for a document the API refuses whole.
- Sending a PDF to a vendor needs clearance: the vendor (`mistral`, `reducto` or `llamacloud`) must be in `allowedVendors` of `config.local.json`. The example config has `"allowedVendors": []`, so nothing is sent until you add one. Held-out cases are never sent.
- The keys are `MISTRAL_API_KEY`, `REDUCTO_API_KEY` and `LLAMA_CLOUD_API_KEY`. They are taken from the environment, else loaded with Next.js `loadEnvConfig` from `app/`, which reads `.env`, `.env.local` and the `.env.<NODE_ENV>` file (for example `.env.production`). A key goes only into a request header and is removed from the saved raw answers.
- The raw vendor answers go to `<out>/raw/` and contain document text. Use a folder under `app/benchmarks/pdf/generated/`: it is git-ignored. Do not commit them.
- Retries: an upload or a GET is retried once on 429, 5xx or timeout. A call that starts a paid job (Mistral `POST /v1/ocr`, Reducto `POST /extract_async`, LlamaExtract `POST /api/v2/extract`) is retried once, only on 429 or 503, because a timeout or another 5xx may come after the vendor accepted it and a second request would be billed again.
- LlamaExtract refuses a `system_prompt` over 10,000 characters and a schema description over 16,000; the built-in instructions are about 26,000. The generator sends the role, task and input sections as the `system_prompt`, and the output rules and taxonomy in the schema description. It leaves out `<example_output>` only. This layout is recorded in `manifest.json` (`instructions`) and in each raw answer.
- A folder holds one vendor, model, mode and instruction layout. The generator refuses to add to a folder made with another one; use another `--out`. Running it again for a case and attempt replaces that envelope.
- A failed vendor call writes an envelope with `execution_status: failed` and no rows, with whatever usage and cost the call recorded, so the attempt is scored as `extraction_error`. The generator exits 1 if any attempt failed.

### Limits

- Vendor calls are paid and slow (minutes per document). Check `prices.json` and run a small selection first.
- The result depends on the instructions the generator sends and on a vendor model that can change; the envelope `version` records what ran.
- Approve cannot carry `total_inclusion` or scope for parent references, so some correct pipeline output is lost (see the Pipeline notes and the score variant).
- No baseline, no regression verdict and no comparison with the built-in import: read the report side by side.

## MLflow

Optional and best effort. When `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME` and `MLFLOW_TRACKING_PASSWORD` are set and `--no-mlflow` is absent, each run is logged to the experiment `ghgi-pdf-benchmark` (created on first use) with the non-admin service account:

- One parent run per benchmark run: tags for commit, branch, models, prompt hash, test-set version and selection (a precomputed run adds `pipeline`, `pipeline_study`, `pipeline_stage` and, when the envelope has them, `pipeline_mode` and `pipeline_version`, and has no `extraction_model`, `ocr_model` or `reasoning_effort` tag); metrics per block; `report.md` and `results.json` as artifacts.
- One child run per case: case metrics, per-attempt metrics (step = attempt number), verdict, and `extracted-values.json` per attempt.
- PDFs, OCR text and answer keys are never uploaded. Metrics and `results.json` pass through the same redaction as the run folder, so no expected value (key row, expected total, difference to it, distractor) reaches MLflow.

The run's `INDEX.md` line links the MLflow run when it was logged.

Highlight stays on by default in the benchmark process, as in the app, so its traces and logs reach Highlight. Set `HIGHLIGHT_DISABLED=true` to turn it off; the app ignores it when `NODE_ENV` is `production`. The Node SDK (`@highlight-run/node` 3.12.22) records outgoing `fetch` calls as spans with URL, method, status and body sizes. It records no request or response bodies and no headers: header capture needs `headersToSpanAttributes`, which the SDK does not set, and `networkRecording` in `app/src/lib/highlight.ts` is a browser option that the Node SDK ignores. So the MLflow `Authorization` header does not reach Highlight, and OCR/LLM payloads reach it only when the app logs them.

If MLflow fails, the run continues and the report says `MLflow: not logged` with the reason. A rescore is not logged.

## Limits

- **Local stack.** The benchmark needs a local database, bucket, LLM and OCR keys. It is not a CI job.
- **At most 10 files per run.** Larger selections fail before any call.
- **3 attempts per case by default.** Other values are exploratory and cannot update the baseline.
- **Cost and time.** The 27 cases with 3 attempts cost about US$7 and take about 3 hours in total (31 Oct 2026, `gpt-5.6-luna` and Mistral OCR). `--dry-run` and `--list` forecast the cost from the baseline's usage; a case without a baseline or a model without a price in `prices.json` shows `n/a`.
- **Warning metric.** The import flow does not return warnings yet, so "wrong totals that carried a warning" stays at 0% until it does.
- **Legacy tolerance.** Keys without a printed unit and precision keep the earlier tolerance (half a tonne of slack); the report lists the cases that still use it.
- **Total-only cases** (non-GPC layouts, or keys with no scored rows) are scored on the total, not row by row, and do not count toward headline recall.
- **No expected values in git or MLflow.** The answer keys stay local until Product confirms they can be shared; reviewers read the report and `results.json`, which carry recall, counts and tolerance flags but no key row, expected total or difference to it.
