# GHGI upload flow: coverage and accuracy table

**Ticket:** CC-1132. **Measured:** 2026-10-27, 22 PDF cases, 3 runs each, on `6206ca8b7` (`develop` with PR #3289 and the OCR fix of PR #3348). Method, scoring rules and caveats: [IngestionAccuracyBaseline.md](./IngestionAccuracyBaseline.md). Evidence of this run (report, answer keys, extracted values per case): [`ingestion-accuracy-runs/2026-10-27-2058-6206ca8b7`](./ingestion-accuracy-runs/2026-10-27-2058-6206ca8b7/report.md).

Legend: 🟢 90% to 100% of rows, or tested and fine · 🟡 partial or one file only · 🔴 fails or under 15% of rows, or not supported · ⚪ not tested

## At a glance

| | |
|---|---|
| 🟢 PDF cases at about 90 to 100% of rows | **10 of 22** |
| 🟡 PDF cases at 15 to 40% of rows | **3 of 22** (Philadelphia, Phoenix, Madrid) |
| 🔴 PDF cases under 15% of rows | **7 of 22** (Toronto 2019, Seattle, New York, Peñalolén, Curitiba, Kyoto, Coimbatore) |
| 🔴 PDF cases with no rows extracted | **2 of 22** (Guadalajara, Münster) |
| OCR step failures | **0 of 22** (was 5 of 11 before PR #3348) |
| 🟡 Cases with a draft answer key (C-015 to C-025) | **11 of 22**, provisional until Product validates the keys |
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

Cases C-004 to C-014 use the Product answer-key workbook. **C-015 to C-025 use draft keys** (not yet validated), so their numbers are provisional. Recall bar = share of expected rows stored correctly (mean of the 3 runs). Full per-case table, with precision, value and classification accuracy, time, tokens and cost: [report.md](./ingestion-accuracy-runs/2026-10-27-2058-6206ca8b7/report.md).

| Case | Row recall | Notation keys | Total vs key | Main failure point |
|---|---|---|---|---|
| 🟢 Auckland 2021 | ▰▰▰▰▰▰▰▰▰▰ 100% | 17 of 23 | 0.0% | |
| 🟢 Toronto 2020 | ▰▰▰▰▰▰▰▰▰▰ 100% | 0 of 0 | 0.0% | |
| 🟢 Miami 2019 and 2021 (2 cases) | ▰▰▰▰▰▰▰▰▰▰ 100% | 0 of 1 | 0.0% | |
| 🟢 Mersin 2023 (draft key) | ▰▰▰▰▰▰▰▰▰▰ 100% | 4 of 9 | 0.0% | |
| 🟢 São Paulo 2022 | ▰▰▰▰▰▰▰▰▰▰ 95% | 26 of 32 | 0.0% | |
| 🟢 Rosario 2022 (draft key) | ▰▰▰▰▰▰▰▰▰▱ 92% | 0 of 1 | −0.2%, outside tolerance | totals differ between runs |
| 🟢 Santiago 2022 (draft key) | ▰▰▰▰▰▰▰▰▰▱ 92% | 0 of 3 | +0.1%, outside tolerance | |
| 🟢 Miami 2021 synthetic scan | ▰▰▰▰▰▰▰▰▰▱ 90% | 0 of 1 | +0.7% | total varies between runs |
| 🟢 Buenos Aires 2022 | ▰▰▰▰▰▰▰▰▱▱ 89% | 18 of 24 | −5.2%, outside tolerance | |
| 🟡 Philadelphia 2022 | ▰▰▰▱▱▱▱▱▱▱ 38% | 0 of 0 | +33333% | the model scales "MT CO2e" by 1000 in some runs (see CC-1132 diagnosis) |
| 🟡 Madrid 2023 (draft key) | ▰▰▱▱▱▱▱▱▱▱ 24% | 0 of 0 | −0.1% | right total, wrong rows |
| 🟡 Phoenix 2022 (draft key) | ▰▰▱▱▱▱▱▱▱▱ 21% | 0 of 26 | +1.4% | wrong classification (62%) |
| 🔴 Coimbatore 2019-20 (draft key) | ▰▱▱▱▱▱▱▱▱▱ 10% | 0 of 0 | +0.1% | |
| 🔴 Toronto 2019 (charts only) | ▱▱▱▱▱▱▱▱▱▱ 6% | 0 of 5 | −51% | numbers only in charts |
| 🔴 Seattle 2022 (not GPC) | ▱▱▱▱▱▱▱▱▱▱ 4% | 0 of 0 | −33% | non-GPC categories |
| 🔴 New York 2015 | ▱▱▱▱▱▱▱▱▱▱ 0% | 0 of 2 | +1806% | values stored under other GPC refs and scopes |
| 🔴 Peñalolén 2022 (draft key) | ▱▱▱▱▱▱▱▱▱▱ 0% | 0 of 0 | +2563% | values stored under other GPC refs and scopes |
| 🔴 Curitiba 2020 (draft key) | ▱▱▱▱▱▱▱▱▱▱ 0% | 0 of 0 | −35.7% | values stored under other GPC refs and scopes |
| 🔴 Kyoto 2023 (draft key) | ▱▱▱▱▱▱▱▱▱▱ 0% | 0 of 0 | −8.3% | |
| 🔴 Guadalajara 2022 (draft key) | no rows | | | extraction returns no rows |
| 🔴 Münster 2022 (draft key) | no rows | | | extraction returns no rows |

- **OCR step:** passes on all 22 files (5 of 11 failed before PR #3348).
- **Means over 22 cases:** row recall 53%, precision 56%, value accuracy 67%, classification accuracy 81%.
- **Time and cost:** 17 to 564 s per case for 3 runs; about US$5.7 for the whole run (1,364 LLM calls, 779 OCR pages; the OCR price per page is an estimate).
- **Weak:** documents with numbers only in charts, non-GPC layouts, values stored under the wrong GPC reference or scope, and no rows at all for two files.

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
- C-015 to C-025 use draft answer keys. Their numbers are provisional until Product validates the keys; only those 11 cases will be rerun then.
- Same file, different runs: several cases show totals that change between runs (marked "stable total: no" in the report).
- Local database, stages called directly, OCR worker not started: not identical to production.
- Excel numbers are Product's (Stefania and Cephas), not rerun here.
