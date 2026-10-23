# Ingestion accuracy baseline

**Status:** first measurement, 2026-10-19. Measured on `develop` at commit `876eb4bba`. No ingestion code changed between that commit and `82dd9e4af`, so the results still describe `develop` when this page was written.

**Ticket:** CC-1132. Related: CC-950 (automated GHGI backtest), CC-951 (GHGI golden set), CC-960 (GHGI import rules), CC-1008 (Auckland PDF fixes, PR #3289), CC-1080 (CAP test set), CC-1131 (CRVA adapter requirements), CC-953 and CC-989 (ingestion spine).

> When to use this file: before prioritising ingestion work for GHGI, CRVA or CAP, or when you need numbers for what the current import accepts and where it breaks. Rerun the measurement after any change to the upload flow (see [How to rerun](#how-to-rerun)).

## Summary

- GHGI is the only module with a real file extractor. For PDFs on `develop` it is not reliable: one report fails at OCR, the other lands 2% to 10% over its published total depending on the run, with everything on scope 1.
- Excel, scanned PDF, map and photo have no measured accuracy yet. Maps, photos and Word files are rejected by the GHGI import.
- CRVA has no file ingestion. CAP has no extractor for actions or targets, only the generic Concept Note PDF-to-text upload.
- The review screen shows a row count but does not compare the imported total with the document total, so a wrong total completes without a warning.

## How it was measured

- **Code:** `develop` at `876eb4bba`. PR #3289 (CC-1008 fixes: scope-aware extraction, page selection, OCR placeholder handling) was not merged and is not included.
- **Real user flow, once per PDF:** the app ran locally against a throwaway Postgres 16 (migrated and seeded). In a browser: login, create the city in the onboarding wizard, create a GPC BASIC / AR6 inventory for the report year, upload the PDF, Extract with AI, mapping, review, Import. OCR and extraction ran through the PDF OCR cron route, called once a minute like the Dev CronJob (`k8s/cc-process-pdf-ocr-jobs.yml`). The imported values were read back from the database.
- **Script, 3 runs per file:** `app/tests/ingestion-accuracy/measure-ghgi-import.jest.ts` does the same stages without the UI and reports total, scope split and stability. The CSV was run only this way.
- **Models:** Mistral `mistral-ocr-latest` for OCR and `gpt-4o-mini` for extraction (`LLM_MODEL`, also the Dev deploy value), called through OpenRouter instead of OpenAI direct.
- **Baseline:** the published total of each report. There are no row-level answer keys yet, so row recall, row precision and classification accuracy are not computed. The CC-950 metrics should replace this once the CC-951 golden set exists.
- **Not the same as production:** a local Next dev server, the OCR cron driven from a shell loop, a local database, and the OpenRouter model id. The test user, organization, project and the GHG Inventories module were created directly in SQL. PDFs were stored in the Dev bucket under a test prefix and deleted afterwards.

## Support map

What each module accepts today, from the code on `develop`.

| Module | Excel                 | Text PDF                    | Scanned PDF                           | Map                      | Photo         | Table in a document               |
| ------ | --------------------- | --------------------------- | ------------------------------------- | ------------------------ | ------------- | --------------------------------- |
| GHGI   | supported, not tested | supported, measured (below) | same OCR path as text PDF, not tested | not supported            | not supported | PDF supported; Word not supported |
| CRVA   | not supported         | not supported               | not supported                         | not supported            | not supported | not supported                     |
| CAP    | not supported         | proxy, not tested           | proxy, not tested                     | proxy (weak), not tested | not supported | proxy, not tested                 |

- **GHGI:** `FileValidatorService` accepts `xlsx`, `csv` and `pdf` by file extension (`app/src/backend/FileValidatorService.ts`). Spreadsheets go through `FileParserService` and `FormatAdapterService`. PDFs go through Mistral OCR (`MistralOcrService`, tables as Markdown, images not returned) and `InventoryExtractionService`. Images inside PDFs are dropped.
- **CRVA:** `app/src/backend/ccra/` only calls the CCRA API. Rapid CRVA is a draft proposal (`docs/RapidCRVAAgenticFlowArchitecture.md`).
- **CAP:** no extraction of actions or targets. The Concept Note upload accepts PDF or Markdown only (`app/src/app/api/v1/concept-notes/[runId]/uploads/route.ts`). "Proxy" means only the generic PDF-to-text path could be checked.
- **Ingestion spine** (CC-953, CC-989): not on `develop`, so not measured.

## Results

### GHGI, text PDF (table inside a document)

| File                                       | Real flow (1 run)                                                                                                | Script (3 runs)                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Masterton 2022 (published gross 785,873 t) | Import completed in about 2 min: 48 rows extracted, 9 value rows stored, total 799,681 t (+1.8%), all on scope 1 | 802,637 / 811,939 / 860,964 t (+2.1% / +3.3% / +9.6%); a fourth run with the committed script: 831,613 t (+5.8%) |
| Auckland 2021 (published 9,559,215 t)      | Import fails after about 6.5 min and 3 OCR attempts: "Extraction failed: malformed_response". No data            | Extraction on the raw OCR text: about 1.66M t (-82.7%), scopes 2 and 3 empty                                     |

Failure points:

- **Auckland:** OCR returns the page 1 logo as `![LOGO](Auckland Council …)`. `StructuredDocumentArtifact` reads it as a missing image and throws `malformed_response`, which is retried 3 times and then fails the import. Same bug as in CC-1008, still on `develop`.
- **Scope:** neither report gets a scope split. All values land on scope 1.
- **Stability:** the Masterton total moves 2% to 10% between runs.
- **No warning:** the review screen shows the row count and a note that 2 rows (V.1, IV.1) are outside GPC BASIC. It does not compare the total with the document, so the import completes with a wrong total.

### GHGI, CSV

One file, a CityCatalyst export of the inflated Auckland import. Through the upload and approve routes, 3 runs: 32,981,169 t every time, the plain sum of the 46 rows in the file. The file holds 15 "Subsector total" rows and a TOTAL row, so emissions are counted more than once, and the import has no guard against it. This is a weak reference: an export of a bad import, not a real city layout.

### Not measured

- **GHGI Excel and scanned PDF:** no files available. CC-944 (manual test) reported that a Buenos Aires XLSX imported 46 of 85 rows.
- **CRVA and CAP:** nothing to measure; no files received for the proxy check yet.

## Limits

- Three files, one model, one real-flow run per PDF. These are snapshots, not rates.
- One browser run was discarded because the wrong inventory year was selected; it was redone.
- The CSV was not run through the browser.
- PR #3289 changes exactly these PDF results. A rerun after it merges is a follow-up.
- LLM and OCR cost per run was not recorded.

## How to rerun

Needs a throwaway Postgres 16 migrated and seeded (the sequelize config has no port variable, so it has to listen on 5432), a bucket for PDFs, and the LLM and Mistral keys in `app/.env`.

1. Start the database and load the schema:

   ```bash
   docker run -d --name ia-pg -e POSTGRES_USER=citycatalyst -e POSTGRES_PASSWORD=local -e POSTGRES_DB=citycatalyst -p 127.0.0.1:5432:5432 postgres:16-alpine
   cd app
   export DATABASE_HOST=127.0.0.1 DATABASE_USER=citycatalyst DATABASE_PASSWORD=local DATABASE_NAME=citycatalyst DATABASE_USE_SSL=false
   npm run db:migrate && npm run db:seed
   ```

2. Copy `app/tests/ingestion-accuracy/config.example.json`, set the file paths, report years and published totals.
3. Run the script (the test is skipped without `INGESTION_ACCURACY_RUN=1`):

   ```bash
   INGESTION_ACCURACY_RUN=1 INGESTION_ACCURACY_CONFIG=/path/to/config.json INGESTION_ACCURACY_OUT=/tmp/ingestion-accuracy \
   NODE_OPTIONS=--experimental-vm-modules NODE_ENV=test npx jest tests/ingestion-accuracy --runInBand --coverage=false
   ```

4. Read `results.json` in the output folder: OCR stage, extracted rows, stored value rows, total and scope split against the reference, and whether the total was identical across runs. Test cities, inventories and bucket objects are removed at the end.

Do not commit the reports or the config with real paths. Keep customer or city files out of the repository.
