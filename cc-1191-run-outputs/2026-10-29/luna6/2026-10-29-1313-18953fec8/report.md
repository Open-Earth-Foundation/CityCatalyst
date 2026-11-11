# Ingestion accuracy run 2026-10-29 13:13 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 100% (+5 pts)
- Mean row precision: 100% (+5 pts)
- Mean value accuracy: 100% (+5 pts)
- Mean classification accuracy: 100% (=)

## Cost of this run

- LLM: 11 calls, 70,656 input and 3,932 output tokens (2,096 of them reasoning); largest output of one call 1,904; calls cut off at the token limit: 0
- OCR: 35 pages
- Estimated cost: $0.079 (previous run: $0.007)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-010 | Toronto - 2020.pdf | ok | 12 | 100% | 100% | 100% | 100% | 0/0 | +0.0% (within tolerance) | no | 30 s | 71k / 4k | 35 | $0.079 |

## Lowest recall: what is missing

### C-010 (100% recall)

No missing rows listed.

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
