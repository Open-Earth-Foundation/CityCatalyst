# Ingestion accuracy baseline

**Status:** latest run 2026-10-27 (22 PDF cases, `6206ca8b7`; see [Latest run](#latest-run-2026-10-27-22-cases)). Earlier: measured 2026-10-19 (first pass, `develop` `876eb4bba`) and 2026-10-26 (answer-key benchmark, `develop` `c409059ea`; rerun after the merge of PR #3289, `develop` `c141f52fa`).

**Ticket:** CC-1132. Related: CC-950 (automated GHGI backtest), CC-951 (golden set), CC-960 (GHGI import rules), CC-1123 (PDF benchmark contract), CC-1008 (Auckland PDF fixes, PR #3289), CC-1080 (CAP test set), CC-1131 (CRVA adapter requirements), CC-953 and CC-989 (ingestion spine).

> Visual summary for the team: [IngestionCoverageTable.md](./IngestionCoverageTable.md).
>
> When to use this file: before prioritising ingestion work for GHGI, CRVA or CAP, or when you need numbers for what the current import accepts and where it breaks. Rerun the benchmark after any change to the upload flow (see [How to rerun](#how-to-rerun)).

## Summary

- **Latest runs (2026-10-27 and 2026-10-28, 22 PDFs, 3 runs each):** no case fails at OCR any more. Keys for all 22 are validated. Over the 17 cases scored row by row: mean row recall 64%, precision 68%, value accuracy 68%, classification accuracy 90%. 11 of 22 cases reach about 90% to 100% of rows; 5 stay under 15%, 3 are non-GPC layouts scored on the total only, 2 return no rows. Details and links below. The bullets that follow describe the earlier 11-case runs.
- GHGI is the only module with a file extractor. For PDFs on `develop` it is not reliable.
- **6 of 11 PDF cases fail at the OCR step** before extraction starts (`malformed_response`: the structured-document step rejects images in the OCR output). A user sees a failed import.
- For the 5 cases that reach extraction, only 2% to 11% of the expected rows are stored correctly. The main reason is that the scope split is lost: scopes 1, 2 and 3 are summed into one scope-1 value. Ignoring scope, São Paulo matches 88% of rows and its total is within 1%.
- **No notation keys are imported from PDFs** (0 of 89 scored keys).
- Run-to-run variation is large: the total of the same file moves by up to about 40 percentage points.
- **PR #3289 (CC-1008) changes this a lot where it applies** (see [With PR #3289 applied](#with-pr-3289-applied)): Auckland, Buenos Aires and São Paulo go to 90% to 100% of rows, and 17 to 26 notation keys are recovered. But it fixes the OCR step for only 1 of the 6 failing cases, and it is worse on the chart-only and New York cases. It also used a different extraction model in this run, so code and model effects are mixed.
- **PR #3289 is now merged** and the benchmark was rerun on `develop` `c141f52fa` (see [After the merge of PR #3289](#after-the-merge-of-pr-3289)). The numbers confirm the run above: Auckland 100% of rows, São Paulo 96%, Buenos Aires 90%; 5 of 11 cases still fail at OCR.
- Structured Excel (eCRF) is much better: 3 Data Portal for Cities files went from 44% to 100% of rows after the fixes (measured by Product, not in this benchmark).
- CRVA has no file ingestion. CAP has no extractor for actions or targets. OCR alone reads text and tables of scanned CRVA documents, but maps and figures come back only as image placeholders.

## How it was measured

- **Test set:** the Product answer-key workbook (`GHGI_PDF_answer_keys`): 10 PDFs, 11 cases (Miami runs for 2019 and 2021, plus a synthetic scan), with row-level keys, distractor values, tolerances and matching rules. The workbook and the PDFs are not in the repository.
- **Code:** `develop` at `c409059ea` for the main results. PR #3289 (CC-1008 fixes) is not merged; it is measured separately below, as `c409059ea` plus the PR head `ae70bd5ef`.
- **Stages:** each PDF is uploaded to the configured bucket, read by Mistral OCR (`mistral-ocr-latest`, `convertPdfUrlToMarkdown`, the same function the OCR job uses), and extracted with `gpt-4o-mini` (`LLM_MODEL`, the Dev deploy value, through OpenRouter) for the inventory year. The rows are stored in `waiting_for_approval` and imported through the real approve route into a throwaway Postgres. The imported values are read back from `InventoryValue`. 3 runs per case.
- **If OCR fails:** a user would see a failed import. To keep measuring the extraction, the script fetches the raw OCR text and continues; those rows are marked `productFlowFailsAtOcr` and are a diagnostic only.
- **Scoring:** `app/tests/ingestion-accuracy/score.ts` implements the workbook rules. A key row matches when the value is within the file tolerance and the GPC ref and scope are equal. Rows the source does not split are compared as sums. Several key rows with the same ref and scope are compared as one sum. "Value (not in total)" rows must be stored but stay out of the total. Notation keys count only when marked as scored. Because the app stores one value per GPC ref and scope, a "stored row" is one stored (ref, scope) group, not one extracted line item.
- **Metrics:** row recall, row precision, value accuracy (right number when the row is found), classification accuracy (right ref and scope when the number is found), total against the expected total, notation keys recovered, distractors stored. A diagnostic _subsector recall_ sums all scopes per subsector, to show how much is lost to the scope split alone.
- **Not the same as production:** a local database, the OCR job worker not started (the stages are called directly), a local setup of the app, and the OpenRouter model id. LLM and OCR cost per run was not recorded in the earlier runs; since 2026-10-27 every run records it.

## Support map

What each module accepts today, from the code on `develop`.

| Module | Excel                                                                | Text PDF                    | Scanned PDF                                   | Map                      | Photo         | Table in a document               |
| ------ | -------------------------------------------------------------------- | --------------------------- | --------------------------------------------- | ------------------------ | ------------- | --------------------------------- |
| GHGI   | supported, measured by Product (100% of rows on 3 files after fixes) | supported, measured (below) | same OCR path, measured on one synthetic scan | not supported            | not supported | PDF supported; Word not supported |
| CRVA   | not supported                                                        | not supported               | not supported                                 | not supported            | not supported | not supported                     |
| CAP    | not supported                                                        | proxy, not tested           | proxy, not tested                             | proxy (weak), not tested | not supported | proxy, not tested                 |

- **GHGI:** `FileValidatorService` accepts `xlsx`, `csv` and `pdf` by extension. PDFs go through Mistral OCR (tables as Markdown, images not returned) and `InventoryExtractionService`. Images inside PDFs are dropped.
- **CRVA:** `app/src/backend/ccra/` only calls the CCRA API. Rapid CRVA is a draft proposal (`docs/RapidCRVAAgenticFlowArchitecture.md`).
- **CAP:** no extraction of actions or targets. The Concept Note upload accepts PDF or Markdown only. "Proxy" means only the generic PDF-to-text path can be checked.
- **Upload limit:** 20 MiB per file. Two of the three scanned CRVA documents received (43.2 MB and 36.3 MB) exceed it and would be rejected before OCR.
- **Ingestion spine** (CC-953, CC-989): not on `develop`, so not measured.

## Results: GHGI PDFs (answer-key benchmark, 3 runs per case)

Recall and precision are means over the runs that reached the import step. "n/a" means the import never completed.

| Case                                        | OCR step         | Row recall | Subsector recall | Total vs expected (3 runs)                  | Notes                                                                                                      |
| ------------------------------------------- | ---------------- | ---------- | ---------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| C-008 Auckland 2021                         | fails (logo)     | 0%         | 0%               | -82.7% in all runs                          | Same bug as CC-1008; scopes 2 and 3 empty; 0 of 23 notation keys                                           |
| C-004 Philadelphia 2022                     | fails (image id) | 0%         | 0%               | -49.6% / -10.4% / -49.6%                    | Stored values are round numbers (3,100,000; 3,900,000)                                                     |
| C-010 Toronto 2020                          | fails (image id) | 0%         | 0%               | -7.6% / +23.0% / +33.8%                     | Two runs took about 145 s                                                                                  |
| C-009 Toronto 2019 (numbers only in charts) | ok               | 8%         | 0%               | +26.6% / +18.1% / -0.1%                     | 0 of 5 notation keys                                                                                       |
| C-006 Seattle 2022 (not GPC)                | ok               | 4%         | 6%               | +20.8% / +42.7% (1 of 3 runs: invalid JSON) | Non-GPC categories                                                                                         |
| C-005 New York City 2015                    | ok               | 2%         | 4%               | -59.5% / -58.8% / -86.0%                    | 0 of 2 notation keys                                                                                       |
| C-007a Miami 2021                           | fails (image id) | n/a        | n/a              | n/a                                         | Extraction returns 0 rows in all runs: import fails                                                        |
| C-007b Miami 2019 (same file)               | fails (image id) | 0%         | 0%               | +87.8% / +60.6% / +104.1%                   | The same file gives rows for 2019 and none for 2021                                                        |
| C-007s Miami 2021, synthetic scan           | fails (image id) | n/a        | n/a              | n/a                                         | Same failure as the text file, so the scan itself is not the cause                                         |
| C-013 Buenos Aires 2022 (Spanish)           | ok               | 5%         | 26%              | +137% / +146% / +136%                       | The 6.68 Mt of grid energy (I.4.4) is stored under I.4.1 and counted in the total; 0 of 24 notation keys   |
| C-014 São Paulo 2022 (Portuguese)           | ok               | 11%        | 88%              | +0.7% / +0.6% / +0.6%                       | Right total, scopes summed into scope 1 (residential 1,460,613 = 980,966 + 479,647); 0 of 32 notation keys |

Failure modes, in order of impact:

1. **OCR step rejects the document (6 of 11 cases).** `StructuredDocumentArtifact` throws `malformed_response` ("references missing image …" or "image id does not match its markdown reference"). The job retries 3 times and the import ends `FAILED`. The Auckland logo case is addressed in PR #3289; the "image id does not match" variant was not checked against that PR.
2. **Scope split lost.** Values for scopes 1, 2 and 3 are stored as one scope-1 value, so rows match only when ignoring scope.
3. **Notation keys are not imported from PDFs** (0 of 89 scored).
4. **Wrong reference for some rows**, for example grid energy stored as I.4.1 instead of I.4.4, which then counts in the total.
5. **Instability.** Totals move by 10 to 40 points between runs of the same file. One extraction returned invalid JSON.
6. **Empty extraction.** Miami 2021 returns no rows in the text file and in the scan.

### First pass on two reports (2026-10-19, `develop` `876eb4bba`)

The two reports were also run once through the real browser flow (login, onboarding, inventory, upload, import, review).

- **Masterton 2022** (published gross 785,873 t): import completed, 799,681 t (+1.8%), all on scope 1. Script runs: +2.1% / +3.3% / +9.6%. The review screen shows the row count but does not compare the total with the document, so a wrong total completes without a warning.
- **Auckland 2021:** the import fails after about 6.5 minutes (3 attempts).
- **CSV** (CityCatalyst export of the inflated Auckland import): 32,981,169 t in all runs, the plain sum of the 46 file rows, which include subtotal and TOTAL rows. No guard against counting them twice.

## With PR #3289 applied

Same 11 cases, same scorer, same 3 runs, on `c409059ea` merged with the head of PR #3289 (`ae70bd5ef`). The PR code uses `LLM_EXTRACTION_MODEL`, set here to `gpt-5.6-luna` as the Dev deploy sets it, so this run changes the code **and** the extraction model together (the run above used `gpt-4o-mini`). It also extracts page by page, so a run takes 70 to 200 s instead of 15 to 40 s. Recall and precision are means over the runs that reached the import step.

| Case                             | OCR step         | Row recall before → after | Notation keys before → after | Total vs expected, after         |
| -------------------------------- | ---------------- | ------------------------- | ---------------------------- | -------------------------------- |
| C-008 Auckland 2021              | fails → **ok**   | 0% → **100%**             | 0/23 → 17/23                 | 0.0% in all runs (31 of 31 rows) |
| C-004 Philadelphia 2022          | fails (image id) | 0% → 8% (diagnostic)      | n/a                          | -6.7% / -5.6% / -49.1%           |
| C-010 Toronto 2020               | fails (image id) | 0% → n/a                  | n/a                          | 0 rows extracted: import fails   |
| C-009 Toronto 2019 (charts only) | ok               | 8% → **0%**               | 0/5 → 0/5                    | -68.6% in all runs               |
| C-006 Seattle 2022 (not GPC)     | ok               | 4% → 8%                   | n/a                          | -2.3% / -49.6% / 0.0%            |
| C-005 New York City 2015         | ok               | 2% → **0%**               | 0/2 → 0/2                    | 0.0% / -94.4% / +5757.9%         |
| C-007a/b/s Miami                 | fails (image id) | n/a                       | n/a                          | 0 rows extracted: import fails   |
| C-013 Buenos Aires 2022          | ok               | 5% → **90%**              | 0/24 → 18/24                 | -5.2% in all runs                |
| C-014 São Paulo 2022             | ok               | 11% → **96%**             | 0/32 → 25 to 26/32           | 0.0% in all runs                 |

- **Fixed:** the Auckland logo case. Auckland, Buenos Aires and São Paulo now score 90% to 100% on rows, 96% to 100% on precision, and recover most notation keys. The totals are stable across runs.
- **Not fixed:** "image id does not match its markdown reference" still fails the OCR step for Philadelphia, Toronto 2020 and the three Miami cases (5 of 11 cases still fail).
- **Worse:** Toronto 2019 (numbers only in charts) and New York City. New York stores the grand total as a row in one run and an absurd +5757.9% in another.
- **Slower:** 3 to 5 times longer per run, with about 7 times more LLM calls.
- **Cannot separate code from model:** to see what the code does alone, rerun the PR with `LLM_EXTRACTION_MODEL` unset (it falls back to `gpt-4o-mini`).

## After the merge of PR #3289

Same 11 cases, same scorer, same 3 runs, on `develop` `c141f52fa` (PR #3289 merged 2026-10-26). Extraction model `gpt-5.6-luna` (`LLM_EXTRACTION_MODEL`, as the Dev deploy sets it); OCR `mistral-ocr-latest`. The whole battery took about 31 minutes. Recall is the mean over runs that reached the import step.

| Case                             | OCR step         | Row recall (mean, range)             | Notation keys | Total vs expected         |
| -------------------------------- | ---------------- | ------------------------------------ | ------------- | ------------------------- |
| C-008 Auckland 2021              | ok               | 100% in all runs                     | 17/23         | 0.0% in all runs          |
| C-014 São Paulo 2022             | ok               | 95.5% in all runs                    | 25 to 26/32   | 0.0% in all runs          |
| C-013 Buenos Aires 2022          | ok               | 89.5% in all runs                    | 18/24         | -5.2% in all runs         |
| C-006 Seattle 2022 (not GPC)     | ok               | mean 3.8% (0 to 11.4%)               | n/a           | -50.8% / 0.0% / -49.6%    |
| C-009 Toronto 2019 (charts only) | ok               | mean 6.2% (0 to 12.5%; 1 run fails)  | 0/5           | -39.7% / -62.2%           |
| C-005 New York City 2015         | ok               | 0% in all runs                       | 0/2           | +5370.6% / -93.6% / -100% |
| C-004 Philadelphia 2022          | fails (image id) | mean 8.3% (5.0 to 10.0%; diagnostic) | n/a           | -6.8% / -98.4% / -7.0%    |
| C-010 Toronto 2020               | fails (image id) | import fails, 0 rows                 | n/a           | n/a                       |
| C-007a/b/s Miami                 | fails (image id) | import fails, 0 rows                 | n/a           | n/a                       |

- **Confirmed:** the merged code gives the same picture as the pre-merge run of the PR. Auckland, São Paulo and Buenos Aires are at 90% to 100% of rows with stable totals.
- **Still failing:** "image id does not match its markdown reference" fails the OCR step for 5 of 11 cases.
- **Weak:** Seattle, Toronto 2019 and New York stay below 15% of rows; New York stores the grand total as a row in some runs.
- **Time:** 27 to 165 s per run.
- **Not done:** a run with `LLM_EXTRACTION_MODEL` unset, so code and model effects are still mixed against the first benchmark.
- Raw results are not in the repository.

## Latest runs (22 cases)

22 PDFs, 3 runs each. C-004 to C-014 ran on 2026-10-27 on `6206ca8b7` (`develop` with PR #3289 and the OCR fix of PR #3348): about 98 minutes, US$5.68 (1,364 LLM calls, 9.4M input and 1.9M output tokens, 779 OCR pages). C-015 to C-025 (11 PDFs from C40/GCoM) first ran with draft keys; after Product validated the keys they were rerun on 2026-10-28 on `8cc1457ef`: about 70 minutes, US$3.45 (776 LLM calls, 5.4M input and 1.3M output tokens, 427 OCR pages). The table below uses the first run for C-004 to C-014 and the rerun for C-015 to C-025. Extraction model `openai/gpt-5.6-luna`, OCR `mistral-ocr-latest`. The OCR price per page is an estimate.

Scorer changes before the rerun (commit `8cc1457ef`): keys may use subsector refs such as `I.1`, which match any `I.1.x` ref; C-022 to C-025 (not GPC layouts) are scored on the total only; numbers like `3.505.046` are parsed as thousands in the distractor lists. The run report now marks a total within tolerance only when every run is within it.

Evidence is in the run folders `docs/ingestion-accuracy-runs/2026-10-27-2058-6206ca8b7/` and `docs/ingestion-accuracy-runs/2026-10-28-1445-8cc1457ef/` on the PR branch: `report.md` (per-case table), `results.json`, and per case the answer key and the stored values. The PDFs are not published. The module x input view is in [IngestionCoverageTable.md](./IngestionCoverageTable.md).

| Group | Cases | Mean row recall |
| --- | --- | --- |
| About 90% to 100% | Auckland, Toronto 2020, Miami (3 cases), Sao Paulo, Rosario, Curitiba, Santiago, Buenos Aires, Mersin | 88% to 100% |
| 15% to 40% | Philadelphia | 38% |
| Under 15% | Phoenix, Toronto 2019, Seattle, New York, Peñalolén | 0% to 9% |
| Total only (not GPC) | Madrid (-0.1%), Kyoto (-3.3%), Coimbatore (+0.1%) | n/a |
| No rows | Guadalajara, Münster | n/a |

- **OCR step:** passes on all 22 files.
- **Wrong reference or scope:** New York stores plausible values under other GPC refs or scopes, so no row matches the key.
- **Wrong column:** Peñalolén stores the regional totals (Tabla 7) instead of the comuna column (Tabla 10). The key is correct.
- **Unit scaling:** Philadelphia (+33333%) and Phoenix (+67740%, 2 of 3 runs) have totals about 1000 times too large because the model scales "MT CO2e" by 1000 in some runs (diagnosis in the CC-1132 Vault task).
- **Run-to-run variance:** Mersin reached 100% of rows in 2 runs and 63% in the third (total -27.6%); Rosario, Phoenix and Toronto 2019 also vary.
- **Empty extraction:** Guadalajara and Münster return no rows; the runs end `failed`.
- **Not measured:** whether the flow warns the user. The harness stores the final status and rows, not the warnings.

## Results: structured Excel (eCRF), measured by Product

Test of 6 and 14 October 2026 on 3 Data Portal for Cities eCRF files (Mexico City 2016, Melbourne 2022, Buenos Aires 2022), compared row by row: 124 of 280 rows correct before the fixes (44%), 280 of 280 after (100% at subcategory level, totals match the source). Not rerun here.

## Results: scanned CRVA documents (OCR only)

Three documents received as image-only scans (no text layer): Madrid 2015 (48 pages, 11.0 MB), Buenos Aires 2020 (185 pages, 43.2 MB), Seattle 2023 (137 pages, 36.3 MB). There is no CRVA extractor, so this only checks what OCR alone returns.

- Mistral OCR processed all three (8.5 s, 32.3 s and 17.9 s), called directly because two files exceed the upload limit.
- Text and tables are read well. On a sampled Madrid table page (22 rows, 4 columns) every cell matched the page image. Merged label cells ("Exposición", "Sensibilidad") attach to one row only.
- Maps and figures come back as image placeholders with the caption text, with no content from inside the figure.
- The scans are clean renderings (no skew or noise), so these results are optimistic for real scans.
- Only Madrid fits the 20 MiB upload limit.

## Limits

- The key set is 10 PDFs, mostly English text PDFs from North America. Scanned PDFs are covered by one synthetic scan; real scans are still missing.
- One model, 3 runs per case. These are snapshots, not rates.
- Scope for each stored value is taken from the taxonomy entry it was stored under.
- PR #3289 was measured as a local merge with `c409059ea`; the PR still has changes requested, so its numbers can change. Develop moved on after `c409059ea`.
- The CRVA check is OCR only and was verified on one table page by eye; a comparison against the original text layers needs the original PDFs.

## How to rerun

Needs a throwaway Postgres 16 migrated and seeded (the sequelize config has no port variable, so it has to listen on 5432), a bucket for PDFs, and the LLM and Mistral keys in `app/.env`.

1. Start the database and load the schema:

   ```bash
   docker run -d --name ia-pg -e POSTGRES_USER=citycatalyst -e POSTGRES_PASSWORD=local -e POSTGRES_DB=citycatalyst -p 127.0.0.1:5432:5432 postgres:16-alpine
   cd app
   export DATABASE_HOST=127.0.0.1 DATABASE_USER=citycatalyst DATABASE_PASSWORD=local DATABASE_NAME=citycatalyst DATABASE_USE_SSL=false
   npm run db:migrate && npm run db:seed
   ```

2. Convert the Product workbook to JSON:

   ```bash
   npx tsx tests/ingestion-accuracy/export-answer-keys.ts /path/to/GHGI_PDF_answer_keys.xlsx /path/to/answer-keys.json
   ```

3. Copy `app/tests/ingestion-accuracy/config.example.json`, set `answerKeys` and one entry per case (`id` is the key file id, for example `C-014`, and `path` is the PDF).
4. Run the script (the test is skipped without `INGESTION_ACCURACY_RUN=1`):

   ```bash
   INGESTION_ACCURACY_RUN=1 INGESTION_ACCURACY_CONFIG=/path/to/config.json INGESTION_ACCURACY_OUT=../docs/ingestion-accuracy-runs \
   NODE_OPTIONS=--experimental-vm-modules NODE_ENV=test npx jest tests/ingestion-accuracy/measure-ghgi-import.jest.ts --runInBand --coverage=false
   ```

5. Every run writes a folder `docs/ingestion-accuracy-runs/<date>-<time>-<sha>/` and appends a line to `docs/ingestion-accuracy-runs/INDEX.md`, so anyone can read the outcome from the PR without running anything:
   - `report.md`: summary, one row per case (OCR, recall, precision, value and classification accuracy, notation keys, total vs key, stability, time) and the change in points vs the previous run folder.
   - `results.json`: the full output.
   - `cases/<id>/answer-key.json`, `extracted-values.json` and, when the config has `"publishInputs": true`, `original.<ext>`. Leave `publishInputs` off for documents that must not be published.

   - Cost: every run also records LLM calls and input/output tokens (read from the product's own LLM log lines) and the OCR pages per file, and the report shows totals and a per-case column. For a dollar figure add `"prices": {"llmInputPerMTok": ..., "llmOutputPerMTok": ..., "ocrPerPage": ...}` (USD) to the config; without all three the report shows tokens and pages and "n/a" for dollars. OCR is counted once per file because its runs share the text.

   Run folders stay on the PR branch for review and are removed before merging into `develop`.
6. Read `results.json`: per run, the OCR stage, extracted rows, stored groups, the full score object (recall, precision, value and classification accuracy, notation keys, distractors, missing and unexpected rows) and whether the total was identical across runs. Test cities, inventories and bucket objects are removed at the end.

`score.ts` has its own unit tests (`score.jest.ts`) that run without a database. Do not commit the PDFs, the workbook or a config with real paths.
