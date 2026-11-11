# Ingestion accuracy run 2026-10-29 14:55 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 93% (+4 pts)
- Mean row precision: 96% (-4 pts)
- Mean value accuracy: 96% (-4 pts)
- Mean classification accuracy: 100% (=)

## Cost of this run

- LLM: 37 calls, 245,888 input and 26,487 output tokens (11,397 of them reasoning); largest output of one call 5,012; calls cut off at the token limit: 0
- OCR: 58 pages
- Estimated cost: $0.197 (previous run: $0.146)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | Rosario, Argentina 2022.pdf | ok | 29 | 93% | 96% | 96% | 100% | 0/1 | -0.4% (outside tolerance) | no | 121 s | 246k / 26k | 58 | $0.197 |

## Lowest recall: what is missing

### C-015 (93% recall)

Missing rows (first run):
- I.4.4: Industrias de energía: generación entregada a la red (Territorial minus Alcance 1) (14873.61 t)
- V.3: Fuentes agregadas y no CO2 en la tierra (Alcance 1) (271.51 t)

Stored but not in the key:
- V.3 scope 1: -13448.67 t

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
