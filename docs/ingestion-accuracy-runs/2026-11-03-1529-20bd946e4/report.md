# Ingestion accuracy run 2026-11-03 15:29 UTC

- Commit: `20bd946e4` on `david/cc-1132-core-ingestion-measure-current-accuracy-per-module-and-input`
- Extraction model: openai/gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 3
- Compared with: previous run `34131e4ec` (2026-10-31)

## Summary

- Cases: 2 (0 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: n/a
- Mean row precision: n/a
- Mean value accuracy: n/a
- Mean classification accuracy: n/a

## Cost of this run

- LLM: 69 calls, 503,853 input and 7,228 output tokens (0 of them reasoning); largest output of one call 762; calls cut off at the token limit: 0
- OCR: 42 pages
- Estimated cost: $0.193 (previous run: $7.00)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-020 | Guadalajara, México 2022.pdf | ok | n/a | n/a | n/a | n/a | n/a | 0/0 | n/a | no | 23 s | 332k / 3k | 28 | $0.126 |
| C-025 | Münster, Germany 2022.pdf | ok | n/a | n/a | n/a | n/a | n/a | 0/0 | n/a | no | 20 s | 172k / 4k | 14 | $0.067 |
## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
