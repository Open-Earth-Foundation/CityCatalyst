# Subsector-level scoring: re-score with scorer 3 (2026-11-23)

Rule (scorer version 3, commit `9a7d361aa`): in the PDF profile a key wildcard `<sub>.x` with no tail (sectors I to III) also matches a stored subsector-level row `<sub>` (for example `I.3`, scope null). The key row's scope is kept; scoped child key rows (`I.3.1` scope 1) still get no credit from a stored `I.3`. The report also counts subsector rows stored without scope (`unscopedRows`, data quality, not scored).

All re-scores are local (`--rescore`, no DB, LLM, OCR or vendor call). Expected numbers were registered in the task spec before the run; every measure is within 1 point.

## Before and after

The per-attempt `results.json` and `extracted-values.json` files of these runs were removed before merge. They are in commit [`80faf7ebd`](https://github.com/Open-Earth-Foundation/CityCatalyst/tree/80faf7ebd8a7f9f45297265b1f81a1cbd7931da4/docs/ingestion-accuracy-runs).

| Run | Measure | Version 2 | Version 3 | Re-score folder |
| --- | --- | --- | --- | --- |
| CC-1311 envelopes C-015 to C-021 (`2026-11-20-1237-df11e0909-originals-v2`) | Provisional recall | 68% | 86% | [`2026-11-23-1245-9a7d361aa-originals-v2-3`](2026-11-23-1245-9a7d361aa-originals-v2-3/report.md) |
| same | Precision | 79% | 98% | |
| same | C-020 recall / precision | 33% / 33% | 92% / 92% | |
| same | C-021 recall / precision | 27% / 30% | 91% / 100% | |
| same | C-015 to C-019 | | unchanged | |
| same | Variant, every case | | equal to standard | |
| CC-1311 envelopes C-022 to C-025 (`2026-11-20-1240-df11e0909-originals-v2`) | Totals only | | unchanged | [`2026-11-23-1348-4ce9bed03-originals-v2`](2026-11-23-1348-4ce9bed03-originals-v2/report.md) (unscoped-rows fix; first run `2026-11-23-1245-9a7d361aa-originals-v2-4`) |
| Round 2 C-015 to C-021 (`2026-11-19-0209-c5dec265a-originals-v2`) | Provisional recall / precision | 68% / 97% | 68% / 97% | [`2026-11-23-1245-9a7d361aa-originals-v2`](2026-11-23-1245-9a7d361aa-originals-v2/report.md) |
| same | Variant recall (mean of cases) | 86% | 86% | |
| Round 2 C-022 to C-025 (`2026-11-19-0211-c5dec265a-originals-v2`) | Totals only | | unchanged | [`2026-11-23-1245-9a7d361aa-originals-v2-2`](2026-11-23-1245-9a7d361aa-originals-v2-2/report.md) |
| Built-in (`2026-11-19-0219-c5dec265a`) | Every block measure | | unchanged | [`2026-11-23-1245-9a7d361aa`](2026-11-23-1245-9a7d361aa/report.md) |
| Built-in (`2026-11-19-0336-c5dec265a`) | Every block measure | | unchanged | [`2026-11-23-1246-9a7d361aa`](2026-11-23-1246-9a7d361aa/report.md) |

Totals within tolerance, 10x counts and notation keys (26 of 39 for the envelopes) are unchanged in every run.

## Rows stored without scope (CC-1311 envelopes)

Mean per scored attempt: C-020 7.3, C-021 7; every other case 0. Cases scored on the total only (C-022 to C-025) report 0 since commit `4ce9bed03`; before it C-023 showed 2 and C-024 9. Round 2 and built-in runs store none (approve dropped subsector rows before CC-1311). Under GPC BASIC the scope split is required, so each is a data-quality gap even when it scores as correct.

## Not done

The confirmation run with `--pipeline precomputed --rows-dir` (local DB) was not run here. Earlier result: [cc-1311-rescore-2026-11-20.md](cc-1311-rescore-2026-11-20.md).
