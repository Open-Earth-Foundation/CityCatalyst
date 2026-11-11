# Ingestion accuracy run 2026-10-29 13:48 UTC

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

- LLM: 8 calls, 57,240 input and 1,081 output tokens (862 of them reasoning); largest output of one call 614; calls cut off at the token limit: 0
- OCR: 14 pages
- Estimated cost: $0.034 (previous run: $0.012)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-025 | Münster, Germany 2022.pdf | ok | n/a | n/a | n/a | n/a | n/a | 0/0 | n/a | no | 21 s | 57k / 1k | 14 | $0.034 |
## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
