# GHGI upload flow: coverage and accuracy table

**Ticket:** CC-1132. **Measured:** 2026-10-26 on `develop` `c141f52fa` (PR #3289 merged). Method, scoring rules and caveats: [IngestionAccuracyBaseline.md](./IngestionAccuracyBaseline.md).

Legend: 🟢 90% to 100% of rows, or tested and fine · 🟡 partial or one file only · 🔴 fails or under 15% of rows, or not supported · ⚪ not tested

## At a glance

| | |
|---|---|
| 🟢 PDF cases at 90 to 100% of rows | **3 of 11** (Auckland, São Paulo, Buenos Aires) |
| 🔴 PDF cases that fail at OCR ("image id does not match") | **5 of 11** (Philadelphia, Toronto 2020, Miami ×3) |
| 🔴 PDF cases that pass OCR but stay under 15% of rows | **3 of 11** (Toronto 2019, Seattle, New York) |
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

### B1. PDF extraction (11 cases, Product answer-key workbook, 3 runs each)

Recall bar = share of expected rows stored correctly now (mean of the runs that reached the import). "Before" = `develop` `c409059ea` with `gpt-4o-mini`.

| Case | OCR step | Row recall now | Before | Total vs expected | Notation keys |
|---|---|---|---|---|---|
| 🟢 Auckland 2021 | passes | ▰▰▰▰▰▰▰▰▰▰ 100% | 0% (OCR fails) | 0.0% in all runs | 17 of 23 |
| 🟢 São Paulo 2022 | passes | ▰▰▰▰▰▰▰▰▰▰ 95.5% | 11% | 0.0% in all runs | 25 to 26 of 32 |
| 🟢 Buenos Aires 2022 | passes | ▰▰▰▰▰▰▰▰▰▱ 89.5% | 5% | −5.2% in all runs | 18 of 24 |
| 🔴 Toronto 2019 (charts only) | passes (1 run failed) | ▰▱▱▱▱▱▱▱▱▱ mean 6.2% (0 to 12.5%) | 8% | −39.7% / −62.2% | 0 of 5 |
| 🔴 Seattle 2022 (not GPC) | passes | ▱▱▱▱▱▱▱▱▱▱ mean 3.8% (0 to 11.4%) | 4% | −50.8% / 0.0% / −49.6% | n/a |
| 🔴 New York 2015 | passes | ▱▱▱▱▱▱▱▱▱▱ 0% | 2% | +5370.6% / −93.6% / −100% | 0 of 2 |
| 🔴 Philadelphia 2022 | **fails** (image id) | diagnostic only: mean 8.3% (5.0 to 10.0%) | 0% | −6.8% / −98.4% / −7.0% | n/a |
| 🔴 Toronto 2020 | **fails** (image id) | import fails, 0 rows | 0% | n/a | n/a |
| 🔴 Miami 2021, 2019, 2021 scan | **fails** (image id) | import fails, 0 rows | n/a | n/a | n/a |

- **Fixed by PR #3289:** Auckland (the logo placeholder bug).
- **Improved, with the PR and the model change together:** Buenos Aires and São Paulo. Their OCR step already passed before, so this is not the logo fix. The old run used `gpt-4o-mini`, this one `gpt-5.6-luna` (as on Dev).
- **Still failing:** the OCR step rejects 5 of 11 documents. Cause found in the OCR output: the block `image_id` is wrong while the markdown reference matches the picture position. No code change yet.
- **Weak:** documents with numbers only in charts, non-GPC layouts, and grand totals stored as rows (New York).
- **Time:** 27 to 165 s per run.

### B2. AI reshape (irregular Excel or CSV): ⚪ not tested

Waiting for multi-column samples from Cephas.

### B3. Scanned PDF: 🟡 1 synthetic scan

Fails at OCR like the text version of the same file. No real scan yet.

## Not supported

| Input | Status | Note |
|---|---|---|
| Maps, photos | 🔴 not supported | only xlsx, csv and pdf are accepted |
| Tables inside Word files | 🔴 not supported | `.docx` not accepted |
| CRVA | 🔴 not supported | no file ingestion. OCR-only check of 3 scans: text and tables read well, figures come back as placeholders, 2 of 3 files exceed the 20 MiB upload limit |
| CAP | 🔴 not supported | only the generic Concept Note PDF-to-text upload |

## Read this with care

- 11 cases show failure modes, not success rates. Miami counts three times for one problem.
- Code and model changed together between the "before" and "now" columns. A run of the new code with the old model is in progress.
- Same file, different runs: New York and Seattle move a lot. Cases at 90% or more were stable.
- Local database, stages called directly, OCR worker not started: not identical to production.
- Excel numbers are Product's (Stefania and Cephas), not rerun here.
