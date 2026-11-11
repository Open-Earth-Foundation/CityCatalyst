# Ingestion accuracy run 2026-10-29 14:04 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (0 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: n/a
- Mean row precision: n/a
- Mean value accuracy: n/a
- Mean classification accuracy: n/a

## Cost of this run

- LLM: 25 calls, 179,668 input and 24,121 output tokens (13,183 of them reasoning); largest output of one call 4,667; calls cut off at the token limit: 0
- OCR: 32 pages
- Estimated cost: $0.094 (previous run: $0.079)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-022 | Madrid, Spain 2023 (IPCC con CIRIS).pdf | ok | 12 | n/a | n/a | n/a | n/a | 0/0 | -0.1% (outside tolerance) | no | 130 s | 180k / 24k | 32 | $0.094 |
## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
