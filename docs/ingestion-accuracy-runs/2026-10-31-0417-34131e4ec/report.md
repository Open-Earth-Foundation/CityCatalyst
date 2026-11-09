# Ingestion accuracy run 2026-10-31 04:17 UTC

- Commit: `34131e4ec` on `david/cc-1132-core-ingestion-measure-current-accuracy-per-module-and-input`
- Extraction model: openai/gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 3
- Compared with: previous run `8cc1457ef` (2026-10-28)
- Keys: rescored after the run with the Round 1 workbook of 29 Oct; the run itself loaded the 26 Oct copy.

## Summary

- Cases: 27 (21 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 58% (-3 pts)
- Mean row precision: 61% (-5 pts)
- Mean value accuracy: 63% (-4 pts)
- Mean classification accuracy: 86% (+10 pts)

## Validated and held-out cases

Means are over the cases scored row by row. The "with failed" columns count a failed run as 0. A case has its total within tolerance only when every run does.

| Set | Cases | Scored by row | Recall | Value acc. | Recall with failed | Value acc. with failed | Totals within tolerance (cases) | (runs) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Validated | 22 | 16 | 68% | 72% | 64% | 68% | 8/22 | 26/66 |
| Held-out | 5 | 5 | 28% | 35% | 28% | 35% | 0/5 | 3/15 |

## Cost of this run

- LLM: 1757 calls, 11,921,838 input and 2,092,388 output tokens (0 of them reasoning); largest output of one call 16,000; calls cut off at the token limit: 0
- OCR: 1052 pages
- Estimated cost: $7.00 (previous run: $3.45)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total within tolerance | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-008 | Auckland - 2021.pdf | ok | 52 | 100% (=) | 100% (=) | 100% (=) | 100% | 17/23 | within tolerance | yes | 91 s | 731k / 58k | 57 | $0.330 |
| C-004 | Philladelpia - 2022.pdf | ok | 27 | 0% (=) | 0% (=) | 0% (=) | 0% | 0/0 | outside tolerance | no | 106 s | 437k / 79k | 30 | $0.243 |
| C-010 | Toronto - 2020.pdf | ok | 12 | 100% (=) | 100% (=) | 100% (=) | 100% | 0/0 | within tolerance | yes | 28 s | 212k / 11k | 35 | $0.126 |
| C-009 | Toronto - 2019.pdf | ok | 5 | 0% (=) | 0% (=) | 0% (=) | n/a | 0/5 | outside tolerance | yes | 31 s | 148k / 10k | 18 | $0.078 |
| C-006 | Seattle - 2022.pdf | ok | 11 | n/a | n/a | n/a | n/a | 0/0 | outside tolerance | no | 137 s | 599k / 153k | 58 | $0.419 |
| C-005 | NYC - 2015.pdf | ok | 23 | 0% (=) | 0% (=) | 0% (=) | n/a | 0/2 | outside tolerance | no | 114 s | 746k / 64k | 56 | $0.338 |
| C-007a | Miami - 2019 & 2021.pdf | ok | 16 | 100% (=) | 100% (=) | 100% (=) | 100% | 0/0 | within tolerance | yes | 43 s | 194k / 31k | 17 | $0.110 |
| C-007b | Miami - 2019 & 2021.pdf | ok | 16 | 100% (=) | 100% (=) | 100% (=) | 100% | 0/0 | within tolerance | yes | 82 s | 201k / 50k | 17 | $0.134 |
| C-007s | Miami_2019_2021_SCANNED_synthetic.pdf | ok | 16 | 100% (=) | 100% (=) | 100% (=) | 100% | 0/0 | within tolerance | yes | 41 s | 187k / 31k | 17 | $0.109 |
| C-013 | Buenos Aires - 2022.pdf | ok | 39 | 89% (=) | 100% (=) | 100% (=) | 100% | 18/24 | outside tolerance | yes | 70 s | 473k / 52k | 46 | $0.249 |
| C-014 | Sao Paulo - 2022.pdf | ok | 50 | 95% (=) | 95% (=) | 95% (=) | 100% | 25/32 | within tolerance | yes | 56 s | 25k / 22k | 1 | $0.034 |
| C-015 | Rosario, Argentina 2022.pdf | ok | 29 | 92% (=) | 94% (=) | 95% (=) | 100% | 0/1 | outside tolerance | no | 106 s | 698k / 77k | 58 | $0.348 |
| C-016 | Mersin, Türkiye 2023.pdf | ok | 48 | 100% (=) | 100% (=) | 100% (=) | 100% | 4/9 | within tolerance | yes | 80 s | 441k / 49k | 43 | $0.234 |
| C-017 | Phoenix, USA 2022.pdf | ok | 12 | 23% (=) | 39% (=) | 46% (=) | 60% | 0/26 | outside tolerance | no | 95 s | 692k / 86k | 46 | $0.333 |
| C-018 | Santiago, Chile 2022.pdf | ok | 40 | 89% (=) | 89% (=) | 89% (=) | 100% | 0/3 | outside tolerance | no | 130 s | 300k / 97k | 26 | $0.228 |
| C-019 | Peñalolén, Chile 2022.pdf | ok | 191 | 6% (=) | 0% (=) | 25% (=) | 0% | 0/0 | outside tolerance | no | 649 s | 1404k / 796k | 100 | $1.44 |
| C-020 | Guadalajara, México 2022.pdf | ok | n/a | n/a | n/a | n/a | n/a | 0/0 | n/a | no | 18 s | 332k / 3k | 28 | $0.126 |
| C-021 | Curitiba, Brazil 2020.pdf | ok | 12 | 91% (=) | 91% (=) | 100% (=) | 91% | 0/0 | within tolerance | yes | 36 s | 521k / 15k | 68 | $0.259 |
| C-022 | Madrid, Spain 2023 (IPCC con CIRIS).pdf | ok | 12 | n/a | n/a | n/a | n/a | 0/0 | outside tolerance | no | 85 s | 547k / 62k | 32 | $0.248 |
| C-023 | Kyoto, Japan (IPCC) 2023.pdf | ok | 6 | n/a | n/a | n/a | n/a | 0/0 | outside tolerance | no | 28 s | 88k / 11k | 4 | $0.038 |
| C-024 | Coimbatore, India 2019-20.pdf | ok | 14 | n/a | n/a | n/a | n/a | 0/0 | outside tolerance | no | 29 s | 139k / 22k | 8 | $0.070 |
| C-025 | Münster, Germany 2022.pdf | ok | 4 | n/a | n/a | n/a | n/a | 0/0 | outside tolerance | no | 16 s | 159k / 4k | 14 | $0.064 |
| C-027 | Chicago 2022 (City of Chicago column of the CMAP regional inventory).pdf | ok | 14 | 9% (=) | 8% (=) | 9% (=) | 100% | 0/0 | outside tolerance | no | 29 s | 167k / 9k | 20 | $0.084 |
| C-028 | Long Beach, USA 2021.pdf | ok | 81 | 0% (=) | 0% (=) | 0% (=) | n/a | 0/0 | outside tolerance | no | 155 s | 495k / 123k | 41 | $0.329 |
| C-029 | Chicago, USA 2017.pdf | ok | 17 | 33% (=) | 33% (=) | 33% (=) | 100% | 0/0 | outside tolerance | no | 71 s | 570k / 52k | 50 | $0.277 |
| C-030 | Porto Alegre, Brazil 2019.pdf | ok | 34 | 64% (=) | 67% (=) | 67% (=) | 100% | 21/27 | outside tolerance | no | 87 s | 654k / 32k | 110 | $0.390 |
| C-031 | Dunedin 2022.pdf | ok | 26 | 35% (=) | 61% (=) | 68% (=) | 100% | 0/0 | outside tolerance | no | 116 s | 761k / 92k | 52 | $0.367 |

## Files in this folder

- `report.md`: this report
- `results.json`: output of every run, with the expected values redacted
- `cases/<id>/extracted-values.json`: values stored by the import, per run
