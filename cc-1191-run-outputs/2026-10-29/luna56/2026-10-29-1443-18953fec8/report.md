# Ingestion accuracy run 2026-10-29 14:43 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: no previous run

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0
- Mean row recall: 100%
- Mean row precision: 100%
- Mean value accuracy: 100%
- Mean classification accuracy: 100%

## Cost of this run

- LLM: 11 calls, 70,656 input and 3,195 output tokens (1,457 of them reasoning); largest output of one call 1,842; calls cut off at the token limit: 0
- OCR: 35 pages
- Estimated cost: $0.088

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-010 | Toronto - 2020.pdf | ok | 12 | 100% | 100% | 100% | 100% | 0/0 | +0.0% (within tolerance) | no | 28 s | 71k / 3k | 35 | $0.088 |

## Lowest recall: what is missing

### C-010 (100% recall)

No missing rows listed.

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
