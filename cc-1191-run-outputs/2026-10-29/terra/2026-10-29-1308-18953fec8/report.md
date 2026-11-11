# Ingestion accuracy run 2026-10-29 13:08 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-6.1-terra; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: no previous run

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0
- Mean row recall: 95%
- Mean row precision: 95%
- Mean value accuracy: 95%
- Mean classification accuracy: 100%

## Cost of this run

- LLM: 1 calls, 8,294 input and 5,313 output tokens (345 of them reasoning); largest output of one call 5,313; calls cut off at the token limit: 0
- OCR: 1 pages
- Estimated cost: $0.037

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-014 | Sao Paulo - 2022.pdf | ok | 53 | 95% | 95% | 95% | 100% | 25/32 | +0.0% (within tolerance) | no | 62 s | 8k / 5k | 1 | $0.037 |

## Lowest recall: what is missing

### C-014 (95% recall)

Missing rows (first run):
- I.1.1: I.1 Edifícios residenciais (980966 t)

Stored but not in the key:
- I.1.1 scope 1: 980968 t

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
