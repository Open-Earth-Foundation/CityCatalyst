# Ingestion accuracy run 2026-10-29 13:24 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 100% (+100 pts)
- Mean row precision: 100% (+100 pts)
- Mean value accuracy: 100% (+100 pts)
- Mean classification accuracy: 100%

## Cost of this run

- LLM: 37 calls, 236,951 input and 13,096 output tokens (5,650 of them reasoning); largest output of one call 5,645; calls cut off at the token limit: 0
- OCR: 57 pages
- Estimated cost: $0.144 (previous run: $0.042)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-008 | Auckland - 2021.pdf | ok | 53 | 100% | 100% | 100% | 100% | 17/23 | +0.0% (within tolerance) | no | 85 s | 237k / 13k | 57 | $0.144 |

## Lowest recall: what is missing

### C-008 (100% recall)

No missing rows listed.

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
