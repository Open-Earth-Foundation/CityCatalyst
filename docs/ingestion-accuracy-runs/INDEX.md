# Ingestion accuracy runs

Runs of the earlier harness (PR #3317) are listed first. Runs of the PDF benchmark (`app/scripts/pdf-benchmark.ts`, see [PdfBenchmark.md](../PdfBenchmark.md)) are appended to the second table below.

## Earlier runs (harness on #3317)

One line per run, oldest first. Only the 31 Oct folder is kept in this repository; the others stay on the #3317 branch.

| Run (UTC)        | Commit      | Cases | OCR failures | Mean recall | Mean value acc. | Est. cost | Report                                                             |
| ---------------- | ----------- | ----- | ------------ | ----------- | --------------- | --------- | ------------------------------------------------------------------ |
| 2026-10-27 20:58 | `6206ca8b7` | 22    | 0            | 53%         | 67%             | $5.68     | not kept                                                           |
| 2026-10-28 14:45 | `8cc1457ef` | 11    | 0            | 61%         | 67%             | $3.45     | not kept                                                           |
| 2026-10-31 04:17 | `34131e4ec` | 27    | 0            | 58%         | 63%             | $7.00     | [2026-10-31-0417-34131e4ec](./2026-10-31-0417-34131e4ec/report.md) |
| 2026-11-03 15:29 | `20bd946e4` | 2     | 0            | n/a         | n/a             | $0.193    | not kept                                                           |
| 2026-11-03 15:50 | `f0bb61d5c` | 2     | 0            | n/a         | n/a             | $0.360    | not kept                                                           |

# PDF benchmark runs

One line per benchmark run, oldest first. Open the report for per-case numbers and regressions.

| Run (UTC)        | Commit      | Cases | Validated recall | Held-out recall | Est. cost | Report                                                                                                                                                                 |
| ---------------- | ----------- | ----- | ---------------- | --------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-09 18:45 | `c0b125fe5` | 10    | n/a              | n/a             | $5.25     | [2026-11-09-1845-c0b125fe5](./2026-11-09-1845-c0b125fe5/report.md)                                                                                                     |
| 2026-11-09 21:00 | `75c9e8a8f` | 8     | n/a              | n/a             | $3.66     | [2026-11-09-2100-75c9e8a8f](./2026-11-09-2100-75c9e8a8f/report.md)                                                                                                     |
| 2026-11-12 17:22 | `fe14d3a05` | 27    | n/a              | n/a             | $17.92    | [2026-11-12-1722-fe14d3a05](./2026-11-12-1722-fe14d3a05/report.md) · [MLflow](https://mlflow-dev.openearth.dev/#/experiments/12/runs/2f2f7efc875d4ef2ae5c802e35cd1f5d) |
