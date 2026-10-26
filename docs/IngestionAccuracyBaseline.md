# Ingestion accuracy baseline

**Status:** measured 2026-10-19 (first pass, `develop` `876eb4bba`) and 2026-10-26 (answer-key benchmark, `develop` `c409059ea`).

**Ticket:** CC-1132. Related: CC-950 (automated GHGI backtest), CC-951 (golden set), CC-960 (GHGI import rules), CC-1123 (PDF benchmark contract), CC-1008 (Auckland PDF fixes, PR #3289), CC-1080 (CAP test set), CC-1131 (CRVA adapter requirements), CC-953 and CC-989 (ingestion spine).

> When to use this file: before prioritising ingestion work for GHGI, CRVA or CAP, or when you need numbers for what the current import accepts and where it breaks. Rerun the benchmark after any change to the upload flow (see [How to rerun](#how-to-rerun)).

## Summary

- GHGI is the only module with a file extractor. For PDFs on `develop` it is not reliable.
- **6 of 11 PDF cases fail at the OCR step** before extraction starts (`malformed_response`: the structured-document step rejects images in the OCR output). A user sees a failed import.
- For the 5 cases that reach extraction, only 2% to 11% of the expected rows are stored correctly. The main reason is that the scope split is lost: scopes 1, 2 and 3 are summed into one scope-1 value. Ignoring scope, São Paulo matches 88% of rows and its total is within 1%.
- **No notation keys are imported from PDFs** (0 of 89 scored keys).
- Run-to-run variation is large: the total of the same file moves by up to about 40 percentage points.
- Structured Excel (eCRF) is much better: 3 Data Portal for Cities files went from 44% to 100% of rows after the fixes (measured by Product, not in this benchmark).
- CRVA has no file ingestion. CAP has no extractor for actions or targets. OCR alone reads text and tables of scanned CRVA documents, but maps and figures come back only as image placeholders.

## How it was measured

- **Test set:** the Product answer-key workbook (`GHGI_PDF_answer_keys`): 10 PDFs, 11 cases (Miami runs for 2019 and 2021, plus a synthetic scan), with row-level keys, distractor values, tolerances and matching rules. The workbook and the PDFs are not in the repository.
- **Code:** `develop` at `c409059ea`. PR #3289 (CC-1008 fixes) is not merged and is not included.
- **Stages:** each PDF is uploaded to the configured bucket, read by Mistral OCR (`mistral-ocr-latest`, `convertPdfUrlToMarkdown`, the same function the OCR job uses), and extracted with `gpt-4o-mini` (`LLM_MODEL`, the Dev deploy value, through OpenRouter) for the inventory year. The rows are stored in `waiting_for_approval` and imported through the real approve route into a throwaway Postgres. The imported values are read back from `InventoryValue`. 3 runs per case.
- **If OCR fails:** a user would see a failed import. To keep measuring the extraction, the script fetches the raw OCR text and continues; those rows are marked `productFlowFailsAtOcr` and are a diagnostic only.
- **Scoring:** `app/tests/ingestion-accuracy/score.ts` implements the workbook rules. A key row matches when the value is within the file tolerance and the GPC ref and scope are equal. Rows the source does not split are compared as sums. Several key rows with the same ref and scope are compared as one sum. "Value (not in total)" rows must be stored but stay out of the total. Notation keys count only when marked as scored. Because the app stores one value per GPC ref and scope, a "stored row" is one stored (ref, scope) group, not one extracted line item.
- **Metrics:** row recall, row precision, value accuracy (right number when the row is found), classification accuracy (right ref and scope when the number is found), total against the expected total, notation keys recovered, distractors stored. A diagnostic _subsector recall_ sums all scopes per subsector, to show how much is lost to the scope split alone.
- **Not the same as production:** a local database, the OCR job worker not started (the stages are called directly), a local setup of the app, and the OpenRouter model id. LLM and OCR cost per run was not recorded.

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
- PR #3289 changes exactly these results. A rerun after it merges is a follow-up.
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
   INGESTION_ACCURACY_RUN=1 INGESTION_ACCURACY_CONFIG=/path/to/config.json INGESTION_ACCURACY_OUT=/tmp/ingestion-accuracy \
   NODE_OPTIONS=--experimental-vm-modules NODE_ENV=test npx jest tests/ingestion-accuracy/measure-ghgi-import.jest.ts --runInBand --coverage=false
   ```

5. Read `results.json`: per run, the OCR stage, extracted rows, stored groups, the full score object (recall, precision, value and classification accuracy, notation keys, distractors, missing and unexpected rows) and whether the total was identical across runs. Test cities, inventories and bucket objects are removed at the end.

`score.ts` has its own unit tests (`score.jest.ts`) that run without a database. Do not commit the PDFs, the workbook or a config with real paths.
