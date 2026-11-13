# PDF extraction benchmark

**Ticket:** CC-1124. Related: CC-1123 (benchmark contract), CC-1132 (first measurements).

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
| `--no-mlflow`                    | Skip MLflow even when it is configured.                                                                                                                                                                         |
| `--config path`                  | Use another local config.                                                                                                                                                                                       |

Exit codes: 0 ok, 1 regression or error, 2 configuration or selection error, 3 incomplete `--all` run (missing inputs or unfinished cases, no regression or error), 130 interrupted (Ctrl+C writes a partial report marked `interrupted` and does not update the baseline).

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

- **Header:** commit and branch (and a dirty flag), models, reasoning effort, prompt hash, input representation, test-set version, selection, MLflow link or the reason it was not logged.
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

## MLflow

Optional and best effort. When `MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME` and `MLFLOW_TRACKING_PASSWORD` are set and `--no-mlflow` is absent, each run is logged to the experiment `ghgi-pdf-benchmark` (created on first use) with the non-admin service account:

- One parent run per benchmark run: tags for commit, branch, models, prompt hash, test-set version and selection; metrics per block; `report.md` and `results.json` as artifacts.
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
