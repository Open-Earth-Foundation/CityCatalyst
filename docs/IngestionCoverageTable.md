# GHGI upload flow: coverage and accuracy table

**Ticket:** CC-1132. **Measured:** 22 PDF cases, 3 runs each. C-004 to C-014 on 2026-10-27 (`6206ca8b7`, `develop` with PR #3289 and the OCR fix of PR #3348); C-015 to C-025 rerun on 2026-10-28 (`8cc1457ef`) with the keys validated by Product. Method, scoring rules and caveats: [IngestionAccuracyBaseline.md](./IngestionAccuracyBaseline.md). Evidence (report, answer keys, extracted values per case): [`2026-10-27-2058-6206ca8b7`](./ingestion-accuracy-runs/2026-10-27-2058-6206ca8b7/report.md) (22 cases) and [`2026-10-28-1445-8cc1457ef`](./ingestion-accuracy-runs/2026-10-28-1445-8cc1457ef/report.md) (rerun of 11).

Legend: 🟢 90% to 100% of rows, or tested and fine · 🟡 partial or one file only · 🔴 fails or under 15% of rows, or not supported · ⚪ not tested

## At a glance

| | |
|---|---|
| 🟢 PDF cases at about 90 to 100% of rows | **11 of 22** |
| 🟡 PDF cases at 15 to 40% of rows | **1 of 22** (Philadelphia) |
| 🔴 PDF cases under 15% of rows | **5 of 22** (Toronto 2019, Seattle, New York, Peñalolén, Phoenix) |
| 🟡 Non-GPC layouts, scored on the total only | **3 of 22** (Madrid, Kyoto, Coimbatore) |
| 🔴 PDF cases with no rows extracted | **2 of 22** (Guadalajara, Münster) |
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

### B1. PDF extraction (22 cases, 3 runs each)

Keys for all 22 cases are validated. C-022 to C-025 (Madrid, Kyoto, Coimbatore, Münster) are not GPC layouts, so rows are not scored and only the total is compared. Recall bar = share of expected rows stored correctly (mean of the 3 runs). Full per-case tables, with precision, value and classification accuracy, time, tokens and cost: [report, 22 cases](./ingestion-accuracy-runs/2026-10-27-2058-6206ca8b7/report.md) and [report, rerun of 11](./ingestion-accuracy-runs/2026-10-28-1445-8cc1457ef/report.md).

| Case | Row recall | Notation keys | Total vs key | Main failure point |
|---|---|---|---|---|
| 🟢 Auckland 2021 | ▰▰▰▰▰▰▰▰▰▰ 100% | 17 of 23 | 0.0% | |
| 🟢 Toronto 2020 | ▰▰▰▰▰▰▰▰▰▰ 100% | 0 of 0 | 0.0% | |
| 🟢 Miami 2019 and 2021 (2 cases) | ▰▰▰▰▰▰▰▰▰▰ 100% | 0 of 1 | 0.0% | |
| 🟢 São Paulo 2022 | ▰▰▰▰▰▰▰▰▰▰ 95% | 26 of 32 | 0.0% | |
| 🟢 Rosario 2022 | ▰▰▰▰▰▰▰▰▰▱ 91% | 0 of 1 | −0.3% | totals differ between runs |
| 🟢 Curitiba 2020 | ▰▰▰▰▰▰▰▰▰▱ 91% | 0 of 0 | 0.0% | |
| 🟢 Miami 2021 synthetic scan | ▰▰▰▰▰▰▰▰▰▱ 90% | 0 of 1 | +0.7% | total varies between runs |
| 🟢 Santiago 2022 | ▰▰▰▰▰▰▰▰▰▱ 89% | 0 of 3 | +0.2%, outside tolerance | |
| 🟢 Buenos Aires 2022 | ▰▰▰▰▰▰▰▰▰▱ 89% | 18 of 24 | −5.2%, outside tolerance | misses II.2.3 and one scope 3 aggregate |
| 🟢 Mersin 2023 | ▰▰▰▰▰▰▰▰▰▱ 88% | 2 of 9 | −9.2%, outside tolerance | 1 of 3 runs misses 37% of rows (total −27.6%); the other 2 reach 100% |
| 🟡 Philadelphia 2022 | ▰▰▰▱▱▱▱▱▱▱ 38% | 0 of 0 | +33333% | the model scales "MT CO2e" by 1000 in some runs (see CC-1132 diagnosis) |
| 🔴 Phoenix 2022 | ▰▱▱▱▱▱▱▱▱▱ 9% | 0 of 26 | +67740% | 2 of 3 runs scale the total by 1000; the third stores 27% of rows |
| 🔴 Toronto 2019 (charts only) | ▱▱▱▱▱▱▱▱▱▱ 6% | 0 of 5 | −51% | numbers only in charts; 1 of 3 runs returns no rows |
| 🔴 Seattle 2022 (not GPC) | ▱▱▱▱▱▱▱▱▱▱ 4% | 0 of 0 | −33% | non-GPC categories |
| 🔴 New York 2015 | ▱▱▱▱▱▱▱▱▱▱ 0% | 0 of 2 | +1806% | 24 to 32 rows extracted but only 8 groups stored; values land under other GPC refs |
| 🔴 Peñalolén 2022 | ▱▱▱▱▱▱▱▱▱▱ 0% | 0 of 0 | +2563% | the model stores the regional totals (Tabla 7) instead of the comuna column (Tabla 10); the key is right |
| 🟡 Madrid 2023 (not GPC, total only) | n/a | 0 of 0 | −0.1%, outside tolerance | total close; rows not scored |
| 🟡 Kyoto 2023 (not GPC, total only) | n/a | 0 of 0 | −3.3%, within tolerance | rows not scored |
| 🟡 Coimbatore 2019-20 (not GPC, total only) | n/a | 0 of 0 | +0.1%, outside tolerance | rows not scored |
| 🔴 Guadalajara 2022 | no rows | | | extraction returns no rows (runs end `failed` after 8 to 15 LLM calls) |
| 🔴 Münster 2022 (not GPC) | no rows | | | extraction returns no rows (runs end `failed`) |

- **OCR step:** passes on all 22 files (5 of 11 failed before PR #3348).
- **Means over the 17 cases scored row by row (both runs combined):** row recall 64%, precision 68%, value accuracy 68%, classification accuracy 90%. The first run alone gave 53%, 56%, 67%, 81% over 20 cases with draft keys.
- **Time and cost:** 17 to 733 s per case for 3 runs; about US$9.1 for both runs (US$5.68 + US$3.45; the OCR price per page is an estimate).
- **Weak:** documents with numbers only in charts, non-GPC layouts, "MT" unit scaling (Philadelphia, Phoenix), values stored under the wrong GPC reference or scope, and no rows at all for two files.
- **Not measured yet:** whether the import flow warns the user when a total is off or a file is not GPC. The harness records only the final status and the stored rows.

### B2. AI reshape (irregular Excel or CSV): ⚪ not tested

Waiting for multi-column samples from Cephas.

### B3. Scanned PDF: 🟡 1 synthetic scan

The synthetic Miami scan now passes OCR and reaches 90% of rows, like the text version. No real scan yet.

## Not supported

| Input | Status | Note |
|---|---|---|
| Maps, photos | 🔴 not supported | only xlsx, csv and pdf are accepted |
| Tables inside Word files | 🔴 not supported | `.docx` not accepted |
| CRVA | 🔴 not supported | no file ingestion. OCR-only check of 3 scans: text and tables read well, figures come back as placeholders, 2 of 3 files exceed the 20 MiB upload limit |
| CAP | 🔴 not supported | only the generic Concept Note PDF-to-text upload |

## Read this with care

- 22 cases, 3 runs each: snapshots, not success rates. Miami counts three times for one file.
- Same file, different runs: several cases show totals that change between runs (marked "stable total: no" in the report).
- Local database, stages called directly, OCR worker not started: not identical to production.
- Excel numbers are Product's (Stefania and Cephas), not rerun here.
