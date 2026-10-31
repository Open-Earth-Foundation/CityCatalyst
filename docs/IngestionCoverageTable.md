# GHGI upload flow: coverage and accuracy table

**Tickets:** CC-1132, CC-1124. **Measured:** 27 PDF cases, 3 runs each, on 2026-10-31 (`34131e4ec`, model `openai/gpt-5.6-luna`): 22 validated cases and 5 held-out cases that played no part in building the extraction. Method, scoring rules and caveats: [IngestionAccuracyBaseline.md](./IngestionAccuracyBaseline.md). Evidence (report, answer keys, extracted values per case): [`2026-10-31-0417-34131e4ec`](./ingestion-accuracy-runs/2026-10-31-0417-34131e4ec/report.md). Earlier runs: [`2026-10-27-2058-6206ca8b7`](./ingestion-accuracy-runs/2026-10-27-2058-6206ca8b7/report.md), [`2026-10-28-1445-8cc1457ef`](./ingestion-accuracy-runs/2026-10-28-1445-8cc1457ef/report.md).

Legend: 🟢 90% to 100% of rows, or tested and fine · 🟡 partial or one file only · 🔴 fails or under 15% of rows, or not supported · ⚪ not tested

## At a glance

| | |
|---|---|
| 🟢 Validated PDF cases at about 90 to 100% of rows | **11 of 22** |
| 🟡 Validated PDF cases at 15 to 40% of rows | **1 of 22** (Phoenix) |
| 🔴 Validated PDF cases under 15% of rows | **4 of 22** (Philadelphia, Toronto 2019, New York, Peñalolén) |
| 🟡 Non-GPC layouts, scored on the total only | **5 of 22** (Seattle, Madrid, Kyoto, Coimbatore, Münster) |
| 🔴 PDF cases with no rows extracted | **1 of 22** in all runs (Guadalajara); Münster in 2 of 3 runs |
| Validated cases with the total within tolerance in every run | **8 of 22** (26 of 66 runs) |
| Held-out cases | **5**: recall 28%, value accuracy 35%, totals within tolerance 0 of 5 (3 of 15 runs) |
| OCR step failures | **0 of 22** (was 5 of 11 before PR #3348) |
| Answer keys | all 22 validated by Product; C-022 to C-025 are not GPC layouts and are scored on the total |
| 🟢 Near-ECRF Excel (measured by Product) | **100%** of rows (280 of 280) |
| ⚪ Real scanned PDFs, AI-reshape files, series files | **not tested** |

## Path A: exact and near-ECRF (no AI)

| Input | Status | Result | Source |
|---|---|---|---|
| Mexico City 2016, Melbourne 2022, Buenos Aires 2022 | 🟢 tested | 280 of 280 rows; 124 of 280 (44%) before the fixes | Stefania and Cephas, retest 14 Oct |
| Chile, São Paulo (near-ECRF) | 🟢 tested | value accuracy 100% | GHGI weekly, 26 Oct |
| Open export issues | 🟡 logged | ticket 1153: row offsets, Spanish UI shows English warnings, missing field types (São Paulo) | GHGI weekly |
| CityCatalyst CSV export | 🟡 1 file | total equals the plain sum of 46 rows; subtotals counted twice | CC-1132, 19 Oct |
| Series files | ⚪ not tested | large files crash dev (RAM); needs an infrastructure fix first | GHGI weekly |

## Path B: AI

### B1. PDF extraction (27 cases, 3 runs each)

Keys for the 22 validated cases are validated by Product. C-006 and C-022 to C-025 (Seattle, Madrid, Kyoto, Coimbatore, Münster) are not GPC layouts, so rows are not scored and only the total is compared. Recall bar = share of expected rows stored correctly (mean of the runs that finished). Full per-case tables, with precision, value and classification accuracy, time, tokens and cost: [report](./ingestion-accuracy-runs/2026-10-31-0417-34131e4ec/report.md).

| Set | Cases | Scored by row | Row recall | Value accuracy | Recall counting failed runs as 0 | Value accuracy counting failed runs as 0 | Totals within tolerance |
|---|---|---|---|---|---|---|---|
| Validated | 22 | 16 | 68% | 72% | 64% | 68% | 8 of 22 cases, 26 of 66 runs |
| Held-out | 5 | 5 | 28% | 35% | 28% | 35% | 0 of 5 cases, 3 of 15 runs |

A case counts as within tolerance only when every run is. Means cover the cases scored by row.

#### Validated cases

| Case | Row recall | Notation keys | Total vs key | Main failure point |
|---|---|---|---|---|
| 🟢 Auckland 2021 | ▰▰▰▰▰▰▰▰▰▰ 100% | 17 of 23 | 0.0% | |
| 🟢 Toronto 2020 | ▰▰▰▰▰▰▰▰▰▰ 100% | 0 of 0 | 0.0% | |
| 🟢 Miami 2019 and 2021 (2 cases) | ▰▰▰▰▰▰▰▰▰▰ 100% | 0 of 0 | 0.0% | |
| 🟢 Miami 2021 synthetic scan | ▰▰▰▰▰▰▰▰▰▰ 100% | 0 of 0 | 0.0% | |
| 🟢 Mersin 2023 | ▰▰▰▰▰▰▰▰▰▰ 100% | 4 of 9 | 0.0% | |
| 🟢 São Paulo 2022 | ▰▰▰▰▰▰▰▰▰▰ 95% | 25 of 32 | 0.0% | |
| 🟢 Rosario 2022 | ▰▰▰▰▰▰▰▰▰▱ 92% | 0 of 1 | −0.2%, outside tolerance | totals differ between runs |
| 🟢 Curitiba 2020 | ▰▰▰▰▰▰▰▰▰▱ 91% | 0 of 0 | 0.0% | |
| 🟢 Santiago 2022 | ▰▰▰▰▰▰▰▰▰▱ 89% | 0 of 3 | +0.1%, outside tolerance | totals differ between runs |
| 🟢 Buenos Aires 2022 | ▰▰▰▰▰▰▰▰▰▱ 89% | 18 of 24 | −5.2%, outside tolerance | misses II.2.3 and one scope 3 aggregate |
| 🟡 Phoenix 2022 | ▰▰▱▱▱▱▱▱▱▱ 23% | 0 of 26 | 1 run ×994; 2 runs −2.3% | "MT" unit scaling in 1 of 3 runs; few rows stored |
| 🔴 Peñalolén 2022 | ▰▱▱▱▱▱▱▱▱▱ 6% | 0 of 0 | about ×27 | the model stores the regional totals (Tabla 7) instead of the comuna column (Tabla 10); the key is right |
| 🔴 Philadelphia 2022 | ▱▱▱▱▱▱▱▱▱▱ 0% | 0 of 0 | ×1000, ×947734, ×949 | "MT CO2e" unit scaling in all 3 runs |
| 🔴 Toronto 2019 (charts only) | ▱▱▱▱▱▱▱▱▱▱ 0% | 0 of 5 | +22.6%, outside tolerance | numbers only in charts |
| 🔴 New York 2015 | ▱▱▱▱▱▱▱▱▱▱ 0% | 0 of 2 | ×0.06, ×56, ×0.05 | values land under other GPC refs; unit scaling in 1 of 3 runs |
| 🟡 Madrid 2023 (not GPC, total only) | n/a | 0 of 0 | −0.1%, 1 of 3 runs within tolerance | rows not scored |
| 🟡 Kyoto 2023 (not GPC, total only) | n/a | 0 of 0 | −3.9% (runs: −1.7%, −1.7%, −8.3%), outside tolerance | rows not scored; total varies between runs |
| 🟡 Coimbatore 2019-20 (not GPC, total only) | n/a | 0 of 0 | +0.1%, 1 of 3 runs within tolerance | rows not scored |
| 🟡 Seattle 2022 (not GPC, total only) | n/a | 0 of 0 | −35.5% (runs: −4.1%, −52.7%, −49.6%), outside tolerance | rows not scored; total varies between runs |
| 🔴 Münster 2022 (not GPC, total only) | n/a | 0 of 0 | 1 run ×5.2; 2 runs no rows | extraction returns no rows in 2 of 3 runs |
| 🔴 Guadalajara 2022 | no rows | | | extraction returns no rows in all 3 runs; the OCR text holds 39 images and few table lines |

#### Held-out cases

| Case | Row recall | Total vs key | Main failure point |
|---|---|---|---|
| 🟡 Porto Alegre 2019 | ▰▰▰▰▰▰▱▱▱▱ 64% | 2 runs within tolerance; 1 run −89.6% | 1 of 3 runs loses most rows; recall 96% in the other 2 |
| 🟡 Dunedin 2021/22 | ▰▰▰▰▱▱▱▱▱▱ 35% | +47.3% | stores gross emissions (1,542,500 t); the key expects net (1,049,330 t) |
| 🟡 Chicago 2017 | ▰▰▰▱▱▱▱▱▱▱ 33% | ×1000, ×1000000, within tolerance | "metric ton" unit scaling in 2 of 3 runs; recall 100% in the third |
| 🔴 Chicago 2019 (CMAP regional inventory) | ▰▱▱▱▱▱▱▱▱▱ 9% | +304.6% | not diagnosed yet |
| 🔴 Long Beach 2021 | ▱▱▱▱▱▱▱▱▱▱ 0% | ×410113 to ×1075889 | "MT CO2e" unit scaling in all 3 runs |

- **OCR step:** passes on all 27 files.
- **The new validated means do not show an extraction gain.** The 27 and 28 Oct runs rescored with the same scorer and keys give recall 69% and value accuracy 73%. The move from the 64% reported on 28 Oct comes from the scorer and key fixes.
- **Largest single failure:** unit scaling. 10 of the 76 finished runs store a total off by a factor of 50 or more, in Philadelphia, Long Beach, Chicago 2017, Phoenix and New York. This run does not include CC-1191 (PR #3364) or CC-1201.
- **Time and cost:** 16 to 649 s per case for 3 runs; 2 h 11 min and about US$7.00 for the run (the OCR price per page is an estimate).
- **Weak:** "MT" unit scaling, documents with numbers only in charts or images, non-GPC layouts, wrong table chosen (Peñalolén), values stored under the wrong GPC reference or scope.
- **Not measured yet:** whether the import flow warns the user when a total is off or a file is not GPC. The harness records only the final status and the stored rows.

### B2. AI reshape (irregular Excel or CSV): ⚪ not tested

Waiting for multi-column samples from Cephas.

### B3. Scanned PDF: 🟡 1 synthetic scan

The synthetic Miami scan passes OCR and reaches 100% of rows in all 3 runs, like the text version. No real scan yet.

## Not supported

| Input | Status | Note |
|---|---|---|
| Maps, photos | 🔴 not supported | only xlsx, csv and pdf are accepted |
| Tables inside Word files | 🔴 not supported | `.docx` not accepted |
| CRVA | 🔴 not supported | no file ingestion. OCR-only check of 3 scans: text and tables read well, figures come back as placeholders, 2 of 3 files exceed the 20 MiB upload limit |
| CAP | 🔴 not supported | only the generic Concept Note PDF-to-text upload |

## Read this with care

- 27 cases, 3 runs each: snapshots, not success rates. Miami counts three times for one file.
- Model `openai/gpt-5.6-luna` on a local stack; a different model in another environment can give different numbers.
- Held-out keys C-029 to C-031 sample about 20 rows each, so their recall rests on fewer rows.
- Same file, different runs: several cases show totals that change between runs (marked "stable total: no" in the report).
- Local database, stages called directly, OCR worker not started: not identical to production.
- Excel numbers are Product's (Stefania and Cephas), not rerun here.
