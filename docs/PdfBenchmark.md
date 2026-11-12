# PDF extraction benchmark

**Ticket:** CC-1124. Related: CC-1123 (benchmark contract), CC-1132 (first measurements, see [IngestionAccuracyBaseline.md](./IngestionAccuracyBaseline.md)).

A command that runs PDF inventories through the real GHGI import flow (upload, OCR, extraction, approve), compares the stored values with a Product answer key, and writes a report you can review in a PR. Use it before and after any change to the PDF import, the extraction prompt or the models.

- Command: `npx tsx scripts/pdf-benchmark.ts` from `app/`.
- Code: `app/src/backend/ingestion-benchmark/` (scoring, metrics, baseline, report, MLflow) and `app/scripts/pdf-benchmark/` (runner).
- Data: `app/benchmarks/pdf/` (`cases.json`, `baseline.json`, `prices.json`, `config.example.json`).
- Output: one folder per run in `docs/ingestion-accuracy-runs/`, plus a line in `docs/ingestion-accuracy-runs/INDEX.md`.

## Prerequisites

1. A local Postgres 16 that is migrated and seeded. The sequelize config has no port variable, so it must listen on 5432:

   ```bash
   docker run -d --name ia-pg -e POSTGRES_USER=citycatalyst -e POSTGRES_PASSWORD=local -e POSTGRES_DB=citycatalyst -p 127.0.0.1:5432:5432 postgres:16-alpine
   cd app
   export DATABASE_HOST=127.0.0.1 DATABASE_USER=citycatalyst DATABASE_PASSWORD=local DATABASE_NAME=citycatalyst DATABASE_USE_SSL=false
   npm run db:migrate && npm run db:seed
   ```

2. `app/.env` with the LLM provider keys, the Mistral OCR key, and a bucket for the uploaded PDFs, as for a normal local run. The benchmark reads `LLM_MODEL`, `LLM_EXTRACTION_MODEL` and `LLM_EXTRACTION_REASONING_EFFORT` to label the run, and `MISTRAL_OCR_MODEL` for the OCR model name.
3. The PDFs and the answer keys on your machine. They are never committed. Copy `app/benchmarks/pdf/config.example.json` to `app/benchmarks/pdf/config.local.json` (git-ignored) and set:
   - `pdfDir`: one folder, or a list of folders searched in order.
   - `answerKeys`: path to `answer-keys.json` (see [Add a PDF and its key](#add-a-pdf-and-its-key)).
   - `outRoot`: where run folders go (default `../docs/ingestion-accuracy-runs`).
4. Optional, for MLflow: `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME`, `MLFLOW_TRACKING_PASSWORD` (see [MLflow](#mlflow)).

Never commit PDFs, OCR text, answer-key JSON, `app/.env` or `config.local.json`.

## Run

All commands run from `app/`.

```bash
# See every case: block, eligibility, last baseline date and forecast cost. No execution.
npx tsx scripts/pdf-benchmark.ts --list

# Check a selection and its forecast cost and time. No OCR or LLM call.
npx tsx scripts/pdf-benchmark.ts --cases C-004,C-010 --dry-run

# Run two cases, 3 attempts each.
npx tsx scripts/pdf-benchmark.ts --cases C-004,C-010

# Run the cases of one block that the current import is expected to handle
# (text tables, scored row by row).
npx tsx scripts/pdf-benchmark.ts --set validated --eligible --dry-run
npx tsx scripts/pdf-benchmark.ts --set validated --eligible

# Run and record the result as the new baseline for these cases.
npx tsx scripts/pdf-benchmark.ts --cases C-004,C-010 --update-baseline

# Rescore an earlier run with the current scorer and keys. No DB, LLM or OCR call.
npx tsx scripts/pdf-benchmark.ts --rescore ../docs/ingestion-accuracy-runs/2026-10-31-0417-34131e4ec/results.json
```

| Flag                             | Effect                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--cases C-004,C-010`            | Explicit case ids.                                                                                                        |
| `--set validated\|held-out\|dev` | All cases of one block. Exclusive with `--cases`; one of the two is required.                                             |
| `--eligible`                     | Keep cases with `textTables: true` that are not total-only. Combines with `--set`.                                        |
| `--runs N`                       | Attempts per case. Default 3. Any other value marks the run `exploratory`: it is reported but cannot update the baseline. |
| `--list`                         | Print the manifest.                                                                                                       |
| `--dry-run`                      | Resolve the selection, print the forecast, exit.                                                                          |
| `--update-baseline`              | After a run with 3 attempts per case, write the baseline entries for the cases in this run.                               |
| `--rescore <results.json>`       | Rescore a stored run. Writes a run folder marked `rescore`; never changes the baseline.                                   |
| `--no-mlflow`                    | Skip MLflow even when it is configured.                                                                                   |
| `--config path`                  | Use another local config.                                                                                                 |

Exit codes: 0 ok, 1 regression or error, 2 configuration or selection error, 130 interrupted (Ctrl+C writes a partial report marked `interrupted` and does not update the baseline).

A run fails before any paid call when a case id is unknown, when a PDF or key is missing locally, or when the selection has more than 10 files.

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
2. A run takes at most 10 files, so the 27 cases need three runs (for example, one per block or by slices of 10).
3. Commit the change to `app/benchmarks/pdf/baseline.json` together with the run folders that it points to. The next comparison reads the stored values from those folders.
4. After a change to the scorer (`score.ts`, `profiles.ts`, `tolerance.ts` or the metrics), refresh the baseline. The test-set version covers only the manifest entry and the key, so a scorer change does not mark the baseline stale on its own. Run `--rescore` on the baseline's run folders to see the effect first.

**Current baseline (11 Nov 2026).** It covers 14 of the 27 cases: C-015..C-019, C-021..C-024 and C-027..C-031. Read it as provisional:

- C-004..C-014 have no entry because their PDFs were not available locally. C-020 and C-025 are left out because every attempt returned zero rows: with failed attempts in the baseline, the gate would stop flagging new failures on them. All of these are reported as `no baseline`, so any failed attempt gives `error`.
- The entries come from the run folders `2026-11-09-1845-c0b125fe5` and `2026-11-09-2100-75c9e8a8f`. The 18:45 run predates the held-row fix, but the approve route refuses a run with undecided held rows, so the cases it scored had none and the fix does not change them. C-017 and C-022, which had held rows, come from the 21:00 run.
- The entries were recorded with prompt hash `3f1c1271e342`. Later `develop` changes to the extraction prompt (activity classes) change it, so the next run reports a different prompt hash.
- C-022..C-024 are total-only cases and store no recall (`null`). The gate compares recall only when both sides have it, so on these cases it checks pass/fail, 10x and failed attempts only.
- Stored verdicts carry only the fields the gate reads (pass/fail, recall, 10x, failure modes, cost). They lack the newer row metrics (`rowPrecision`, `valueAccuracy`, `classificationAccuracy`, notation keys, `distractorsStored`); a record from the current harness adds them.

Record these cases again from a commit on the merged harness once C-004..C-014 are available.

## Read the results

Open `report.md` in the run folder. It has:

- **Header:** commit and branch (and a dirty flag), models, reasoning effort, prompt hash, input representation, test-set version, selection, MLflow link or the reason it was not logged.
- **One section per block** (validated, held-out, dev), never merged: headline recall (failed attempts count as 0), cases with totals within tolerance, recall over scored attempts only, share of attempts that pass, attempts 10x or more off the expected total, the share of wrong totals that carried a warning, mean precision, value accuracy and classification accuracy over the cases scored row by row, notation keys recovered, and the cases that stored a distractor value.
- **Guardrails** and warnings returned by the import.
- **Regressions against the baseline.** Each case gets one verdict:
  - `regression`: the case passed in the baseline and fails now, recall drops by more than 5 points, or more attempts are 10x or more off than in the baseline.
  - `error`: some attempts did not reach `scored` and the baseline had no failed attempt for the case. A case with no usable baseline (none recorded, or `baseline stale`) also gets `error` when any attempt fails.
  - `over budget`: the cost is over 3x the forecast (the baseline usage scaled to the same number of attempts). It is reported but does not fail the run.
  - `incomplete`: an interrupted run did not finish every attempt of the case. The case is not checked for regressions or budget, but a failed attempt still gives `error`.

  The command exits with 1 when any case is `regression` or `error`.

- **Failure modes:** `scored`, `ocr_error`, `extraction_error`, `truncated`, `zero_rows`, `approve_error`, `readback_error`, `setup_error`.
- **Per case:** verdict, attempts passed, recall, precision, value accuracy, classification accuracy, notation keys (recovered/scored), distractors stored, total within tolerance, 10x count, cost, tokens, runtime per stage, and the tolerance rule used.
- **Notes:** cases on the legacy tolerance, row-scored cases whose `textTables` is still unknown in the manifest, cases left out of the baseline, held rows included at approve.

An attempt passes when it is `scored`, its total is within tolerance and it is not 10x off. A case passes when all 3 attempts pass.

`results.json` is the result of every attempt and the source for comparison and rescore. `cases/<id>/attempt-<n>/extracted-values.json` holds the values the import stored. OCR text is written to `cases/<id>/attempt-<n>/ocr.md` for local reading only; it is git-ignored.

`results.json` holds no answer-key content. In each score the key rows that were not found become `missingRowCount`, the stored distractors `distractorsStoredCount` and the stored groups that match no key row `unexpectedStoredCount`; the expected total and the difference to it (`expectedTotal`, `totalDiffPct`) are not written. Recall, precision, accuracies, counts, the stored total and `totalWithinTolerance` stay. Comparison and rescore recompute every score from the stored values and the local keys, so they never need those fields. To clean a run folder written before this rule: `npx tsx scripts/pdf-benchmark/redact-results.ts <run>/results.json <run>/report.md` (rewrites in place; no DB, LLM or OCR call).

## MLflow

Optional and best effort. When `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME` and `MLFLOW_TRACKING_PASSWORD` are set and `--no-mlflow` is absent, each run is logged to the experiment `ghgi-pdf-benchmark` (created on first use) with the non-admin service account:

- One parent run per benchmark run: tags for commit, branch, models, prompt hash, test-set version and selection; metrics per block; `report.md` and `results.json` as artifacts.
- One child run per case: case metrics, per-attempt metrics (step = attempt number), verdict, and `extracted-values.json` per attempt.
- PDFs, OCR text and answer keys are never uploaded. Metrics and `results.json` pass through the same redaction as the run folder, so no expected value (key row, expected total, difference to it, distractor) reaches MLflow.

The run's `INDEX.md` line links the MLflow run when it was logged.

Highlight stays on by default in the benchmark process, as in the app, so its traces and logs reach Highlight. Set `HIGHLIGHT_DISABLED=true` to turn it off. The Node SDK (`@highlight-run/node` 3.12.22) records outgoing `fetch` calls as spans with URL, method, status and body sizes. It records no request or response bodies and no headers: header capture needs `headersToSpanAttributes`, which the SDK does not set, and `networkRecording` in `app/src/lib/highlight.ts` is a browser option that the Node SDK ignores. So the MLflow `Authorization` header does not reach Highlight, and OCR/LLM payloads reach it only when the app logs them.

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
