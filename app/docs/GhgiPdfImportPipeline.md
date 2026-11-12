# GHGI PDF import pipeline

## One-line intent

Turn a city's GHG inventory report (PDF) into reviewed `InventoryValue` rows: Mistral OCR makes Markdown, an LLM extracts table rows, deterministic code checks and reconciles them, and the user approves them.

## Scope

This document covers the PDF path of the GHGI import wizard: upload, OCR, LLM extraction, post-processing, review and commit. It does not cover:

- eCRF and near-eCRF spreadsheets (Path A and Adapter D). They commit through the ingest runner, see [IngestSpineModuleInteraction.md](./IngestSpineModuleInteraction.md).
- Tabular files that need AI column mapping (Path B, `AIInterpretationService`).
- Concept Note Builder PDFs. They share the OCR queue but not the extraction.

## Pipeline at a glance

```mermaid
flowchart TD
  U[User uploads PDF] --> S3[(S3: imports/...)]
  S3 --> Q[PdfOcrJob row, status queued]
  Q -->|K8s CronJob, every minute| OCR[Mistral OCR]
  OCR --> MD[(S3: pdf-ocr/results/.../combined_markdown.md)]
  MD --> X[LLM extraction: InventoryExtractionService]
  X --> P[Post-processing: units, years, totals, duplicates, GPC references]
  P --> R[(ImportedInventoryFile.mappingConfiguration.rows + extractionSummary)]
  R --> V[Review screen: user decides held rows]
  V -->|approve| C[InventoryImportService.importECRFData]
  C --> DB[(InventoryValue / ActivityValue)]
```

Status of `ImportedInventoryFile.importStatus` from the extract request on: `extracting` (OCR and extraction) → `waiting_for_approval` or `failed` → `importing` (after approval) → `completed` or `failed`.

## Stage 1: upload and OCR queue

| Step                                                                                                                                                                                                                                      | Where                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Upload. PDF requires S3. Max 20 MiB (`INVENTORY_IMPORT_MAX_FILE_SIZE_MB`).                                                                                                                                                                | `POST /api/v1/city/{city}/inventory/{inventory}/import`, `InventoryFileStorageService`     |
| Queue OCR. Creates a `PdfOcrJob` (`sourceType = inventory_import`, `annotationMode = none`). Status becomes `extracting`.                                                                                                                 | `POST .../import/{importedFileId}/extract`, `enqueueInventoryPdfOcr` in `PdfOcrService.ts` |
| Worker. A Kubernetes CronJob calls the cron route every minute with `CC_CRON_JOB_API_KEY`. Postgres is the queue (no SQS). Jobs are claimed with `SELECT ... FOR UPDATE SKIP LOCKED` and a lease, so two pods never process the same job. | `k8s/cc-process-pdf-ocr-jobs.yml`, `/api/v1/cron/process-pdf-ocr-jobs`, `PdfOcrService.ts` |

## Stage 2: OCR (PDF to Markdown)

- `MistralOcrService.convertPdfUrlToMarkdown` sends a presigned S3 URL to Mistral OCR (`MISTRAL_OCR_MODEL`, default `mistral-ocr-latest`) with `table_format: "markdown"`.
- Tables come back as separate Markdown blocks. The service puts each table back into its page.
- Every page starts with `<!-- page: N -->`. Extraction uses these markers to work page by page.
- The Markdown is stored in the same bucket at `pdf-ocr/results/{source_type}/{source_id}/{attempt}/combined_markdown.md`.
- Retries: up to `PDF_OCR_MAX_ATTEMPTS` (default 3), delays of 1 and 5 minutes.
- Scanned PDFs work because Mistral OCR reads images. There is no separate pdftotext step for inventory imports.

## Stage 3: LLM extraction

Entry point: `extractInventoryRowsFromStoredMarkdown` in `PdfOcrService.ts` loads the Markdown and the inventory year, then calls `extractInventoryFromDocument` in `InventoryExtractionService.ts`. The inventory year is passed as `targetYear`.

### Model and call settings

- Model role `pdf_extraction` in `app/llm_config.yaml` (currently `gpt-5.6-luna`). A weaker model (`gpt-4o-mini`) dropped columns of dense GPC tables (CC-1008).
- Provider through `app/src/backend/llm` (OpenAI adapter; `OPENAI_API_KEY`, optional `LLM_PROVIDER`, `LLM_BASE_URL`). Timeout 180 s, 3 transport retries.
- Structured output: strict JSON schema (`extraction-response-schema.ts`). If the provider rejects the schema, the whole extraction switches to JSON mode once.
- `maxTokens: 16000`. A response cut off at the token limit (`finishReason === "length"`) is treated as unusable and retried once. It is never imported in part.

### Prompt

`SYSTEM_PROMPT` in `InventoryExtractionService.ts` is generated from the GPC taxonomy at startup:

- the sector → sub-sector hierarchy (`gpc-reference-table.json`);
- every valid GPC reference with its scope, waste direction (III.x.1/2/3) and, for AFOLU, the activities;
- a dictionary of report terms → canonical names (`gpc-name-mappings.json`).

The prompt asks for one row per line item, at the most granular level the document gives. Main rules:

- Every row gets a `rowType`: `line_item`, `subtotal` or `total`. Only line items are imported. Subtotals and totals are kept to check the sum.
- Scope 1/2/3 columns give one row each. BASIC, BASIC+, Total and Net columns are never line items.
- Notation keys (NO, NE, IE, C) become rows with `totalCO2e = null`.
- Convert to tonnes when the document states the unit, and report the unit.
- Copy the GPC reference when the document prints it (`refSource = "document"`), else choose one (`refSource = "inferred"`).
- `activityClass` says what the row measures (`fuel_combustion`, `grid_energy`, `td_losses`, `grid_supply`, `industrial_process`, `product_use`, `other`). Code derives scope and reference from it later.
- For III.x.3 (waste from outside the city), a verbatim quote in `directionEvidence`.
- Skip duplicate tables, tables of other years, comparisons with earlier inventories, per-capita and per-gas tables.
- The user message adds a year instruction when `targetYear` is set.

A simple guard rejects documents that start with instruction-like text (prompt injection).

### Extraction strategy: pages first, chunks as fallback

```mermaid
flowchart TD
  A[Markdown] --> B{Page markers and 1..150 candidate pages?}
  B -- yes --> C[One LLM call per candidate page, 3 in parallel]
  C --> D[Finalize each page]
  D --> E[selectReconciledPages: find the run of pages whose sum matches a reported total]
  E -- reconciled --> F[Rows from the selected pages]
  E -- fallback --> G[Whole-document extraction in chunks]
  B -- no --> G
  G --> H[Finalize all rows]
```

**Page path** (default for OCR output):

1. Split on `<!-- page: N -->`. A page is a candidate when it has at least 8 numbers of 3+ digits.
2. One LLM call per candidate page (`LLM_CHUNK_CONCURRENCY`, default 3, max 8). A failed page is skipped and listed in `summary.failedPages`. The import fails only when every page fails.
3. When a page has GPC rows (scope and reference), prints its own grand total, and its rows miss that total by more than 1%, the page is extracted once more and the closer answer is kept.
4. `selectPages` looks for runs of 1 to 6 consecutive pages whose line items add up to a reported grand total (or a net total, gross minus forestry removals) within 10%. A page joins a run only when it brings the sum closer. Pages with notation keys only can join without changing the sum.
5. Ranking: runs with GPC rows (scope and reference) that reconcile within 1% first, then more GPC rows, then the closer sum. A run that reaches the net total beats one that reaches only the gross total.
6. If the best run is only within 10% but the whole document is within 1%, all pages are used.
7. If no run is found (`pageSelection = "fallback"`), the per-page rows are discarded and the document is extracted again in chunks. Per-page rows without reconciliation were noisier than chunk results in CC-1008 runs.

**Chunk path** (no page markers, more than 150 candidate pages, or page fallback):

- Up to 50,000 characters: one call. Above: chunks of 40,000 characters with 4,000 overlap, merged and de-duplicated.

### Year handling

- With a target year: when any line item names a year, rows of other years (`other_year`) and rows without a year (`missing_year`) are dropped.
- When no line item names a year, the target year is assumed (`summary.yearAssumed = true`). On the page path, a run must then reconcile within 1%, because the wrong table cannot be told apart by year.
- When every line item was dropped for its year, the import fails with "Inventory not found for the target year".

## Stage 4: post-processing (deterministic)

All in `InventoryExtractionService.ts` unless noted.

| Step                   | Function                                                         | What it does                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse and normalize    | `parseExtractionResponse`, `normalizeRows`                       | Reads the JSON, parses numbers ("48,000" → 48000), normalizes scope ("Scope 1" → "1"), keeps only known notation keys and valid activity classes.                                                                                                                                                                                      |
| Canonical reference    | `canonicalGpcRefNo`                                              | Keeps a reference only when it exists in the taxonomy. "I.1" with scope 2 becomes I.1.2. Placeholders like "III.X.1" are dropped.                                                                                                                                                                                                      |
| Fill missing reference | `fillMissingGpcRefNo`, `util/GHGI/gpc-ref-resolver.ts`           | Resolves a reference from sector, sub-sector, category and scope.                                                                                                                                                                                                                                                                      |
| Units                  | `tonnesMultiplier`                                               | kt and Gg × 1,000; Mt × 1,000,000. "MT" in capitals is ambiguous and dropped (`unsupported_unit`), as are kg, lb, %, per-capita.                                                                                                                                                                                                       |
| Totals out of the rows | `finalizeExtractedRows`, `sumLabelLevel`                         | Rows typed or labelled as totals go to `summary.reportedTotals`. A "Total" column read as a line item (no scope, equal to the scoped rows of its sub-sector) is moved there too (`findHiddenRowTotals`). A "total" equal to one sector's line items is demoted to subtotal (`isSectorTotal`).                                          |
| Duplicates             | `repeatKey`                                                      | Same year, reference or sub-sector, scope, activity, category and notation key: kept once.                                                                                                                                                                                                                                             |
| Provenance check       | `verifyRowProvenance`                                            | `refSource = "document"` stands only when the reference is printed on the row's own line, next to its value or notation key. Otherwise it becomes `inferred`. The III.x.3 quote is checked against the text (`directionEvidenceFound`). Neither check confirms a row by itself.                                                        |
| Activity-class rules   | `applyActivityClassRules` in `util/GHGI/activity-class-rules.ts` | For rows whose reference is not printed: `grid_energy` → scope 2 of its own sub-sector (else I.6.2); `td_losses` → scope 3 (stationary energy only, else I.6.3); `industrial_process` → IV.1 and `product_use` → IV.2, scope 1; `grid_supply` → I.4.4 when on energy industries. A changed scope is marked `scopeSource = "inferred"`. |
| Removals check         | `withOrphanRemovals`                                             | When the document reports forestry removals but no V.2 line item was extracted, `summary.orphanRemovals` lets the review warn that the sum leaves them out.                                                                                                                                                                            |
| Sum                    | `sumImported`                                                    | Sum of line items in tonnes, without references left out of BASIC totals (I.4.4, III.x.3, VI.1, see `util/GHGI/reported-totals.ts`).                                                                                                                                                                                                   |

The result is stored on `ImportedInventoryFile.mappingConfiguration`:

- `rows`: `ExtractedRow[]` (type in `InventoryExtractionService.ts`);
- `extractionSummary`: `ExtractionSummary` (type in `util/GHGI/extraction-summary.ts`): reported totals, dropped-row counts per reason, imported sum, year assumption, page selection, failed pages, orphan removals.

If no row is left, the import is `failed` with a reason key from `zeroRowReason`, and the summary is kept for diagnosis.

## Stage 5: review and approval

UI: `components/steps/GHGI/import/` (`review-confirm-step.tsx`, `import-review-rows.tsx`, `import-row-issues.tsx`).

- The review screen compares `importedSum` with the reported totals (`RECONCILIATION_TOLERANCE` = 1%) and shows dropped rows, failed pages and orphan removals.
- Some rows are held until the user decides (`reviewIssue` in `ImportRowPreviewService.ts`):
  - `reference-conflict`: the reference's taxonomy scope differs from the row's scope.
  - `excluded-reference-unconfirmed`: a valued row the model placed on I.4.4 (left out of totals) without the document printing that reference, unless it is genuine grid supply.
  - `direction-unconfirmed`: an inferred III.x.3 (waste from outside the city).
- Decisions per row: `keep`, `reclassify`, `correct-scope` or `skip`. They are bound to the file and the original row with a token (`applyReviewedRows` in `ImportResultBuilder.ts`), so a stale decision is ignored.
- `POST .../import/approve` rebuilds the result on the server (`buildImportResult`). It returns 409 `import-rows-pending` when a held row has no valid decision, and 409 `inventory-has-data` when the inventory has data and replace was not confirmed.
- Approval runs in the background: `ECRFImportService.fromExtractedRows` maps the rows to the eCRF shape, then `InventoryImportService.importECRFData` writes `InventoryValue` and `ActivityValue` in one transaction with the status change. The decisions go to `reviewHistory`.

## Configuration

| Setting                           | Where                                                                                        | Default                     |
| --------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------- |
| Extraction model                  | `app/llm_config.yaml` → `models.pdf_extraction`                                              | `gpt-5.6-luna`              |
| LLM key, provider, base URL       | `OPENAI_API_KEY`, `LLM_PROVIDER`, `LLM_BASE_URL`                                             | provider `openai`           |
| Parallel LLM calls per extraction | `LLM_CHUNK_CONCURRENCY`                                                                      | 3 (max 8)                   |
| OCR model and timeout             | `MISTRAL_OCR_MODEL`, `MISTRAL_OCR_TIMEOUT_MS`                                                | `mistral-ocr-latest`, 180 s |
| OCR queue                         | `PDF_OCR_BATCH_SIZE`, `PDF_OCR_CONCURRENCY`, `PDF_OCR_MAX_ATTEMPTS`, `PDF_OCR_LEASE_SECONDS` | 2, 2, 3, 600                |
| Storage                           | `AWS_FILE_UPLOAD_S3_BUCKET_ID`, `AWS_FILE_UPLOAD_REGION`                                     | required for PDF            |

Fixed constants in `InventoryExtractionService.ts`: candidate page ≥ 8 numbers, ≤ 150 candidate pages, ≤ 6 pages per table, page selection tolerance 10%, chunk threshold 50,000 characters, chunk size 40,000, overlap 4,000.

## Tests and accuracy measurement

- Unit tests: `app/tests/backend/inventory-extraction-*.jest.ts`, `gpc-row-provenance.jest.ts`, `gpc-waste-direction.jest.ts`. Several use stored LLM answers for real reports (Auckland, Masterton).
- Benchmark harness: CC-1124 (PRs #3416 and #3424, in review at the time of writing) runs the real pipeline on the answer-key set and reports row recall per case, with results in a run folder and MLflow.
- Measured on 31 Oct 2026 (CC-1124, before the activity-class changes): row recall 68% on the validated set, 28% on the held-out set. Internal target: 90% row recall.

## Where accuracy is lost (known weak points)

These follow from the design above. They are starting points for improvement work, not decisions.

- **Table choice.** Page selection depends on the document printing a grand total that the rows can match. Reports without one, or with totals on a different page from the table, fall back to chunk extraction.
- **Fallback quality.** The chunk path has no reconciliation-based table choice. It relies on the prompt alone to skip summary, comparison and per-gas tables.
- **Rules tuned on few reports.** Many rules (hidden totals, sector-total demotion, removals, AFOLU V.1 vs V.3) came from specific reports (Auckland, Masterton). Held-out reports with other layouts are not covered by them. This matches the gap between the validated and held-out recall.
- **Model variance.** The same page can give different rows on different runs. The benchmark runs each file several times to measure this.
- **OCR quality.** Split or merged table cells in the Markdown cannot be fixed later. OCR errors are not measured apart from extraction errors yet.
- **Units and years.** Rows with an ambiguous unit ("MT") or without a year when other rows have one are dropped, not asked about.

## Key files

| Concern                            | File                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload, storage                    | `app/src/backend/InventoryFileStorageService.ts`                                                                                                                                  |
| OCR queue, worker, extraction step | `app/src/backend/PdfOcrService.ts`, `app/src/backend/pdf-ocr-config.ts`, `app/src/app/api/v1/cron/process-pdf-ocr-jobs/route.ts`                                                  |
| Mistral OCR                        | `app/src/backend/MistralOcrService.ts`                                                                                                                                            |
| LLM extraction and post-processing | `app/src/backend/InventoryExtractionService.ts`, `app/src/backend/extraction-response-schema.ts`                                                                                  |
| LLM client and config              | `app/src/backend/llm/`, `app/llm_config.yaml`                                                                                                                                     |
| GPC rules                          | `app/src/util/GHGI/activity-class-rules.ts`, `gpc-ref-resolver.ts`, `reported-totals.ts`, `extraction-summary.ts`, `data/gpc-reference-table.json`, `data/gpc-name-mappings.json` |
| Review and approval                | `app/src/backend/ImportRowPreviewService.ts`, `app/src/backend/ImportResultBuilder.ts`, `app/src/app/api/v1/city/[city]/inventory/[inventory]/import/approve/route.ts`            |
| Commit                             | `app/src/backend/ECRFImportService.ts` (`fromExtractedRows`), `app/src/backend/InventoryImportService.ts` (`importECRFData`)                                                      |
| Review UI                          | `app/src/components/steps/GHGI/import/`                                                                                                                                           |

## Related documents

- [GenericFileIngestionArchitecture.md](./GenericFileIngestionArchitecture.md): the shared ingest spine and where GHGI fits.
- [IngestSpineModuleInteraction.md](./IngestSpineModuleInteraction.md): how eCRF uploads commit through the ingest runner.
- [ghgi-path-a-backtest.md](../scripts/ghgi-path-a-backtest.md): backtest for the eCRF path (CC-950).
- [import-stuck-importing-runbook.md](../../docs/import-stuck-importing-runbook.md): recovery for imports stuck in `importing`.
