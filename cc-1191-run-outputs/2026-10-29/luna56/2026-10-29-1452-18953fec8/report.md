# Ingestion accuracy run 2026-10-29 14:52 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 89% (-11 pts)
- Mean row precision: 100% (=)
- Mean value accuracy: 100% (=)
- Mean classification accuracy: 100% (=)

## Cost of this run

- LLM: 24 calls, 159,696 input and 18,258 output tokens (5,511 of them reasoning); largest output of one call 6,106; calls cut off at the token limit: 0
- OCR: 46 pages
- Estimated cost: $0.146 (previous run: $0.187)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-013 | Buenos Aires - 2022.pdf | ok | 39 | 89% | 100% | 100% | 100% | 18/24 | -5.2% (outside tolerance) | no | 94 s | 160k / 18k | 46 | $0.146 |

## Lowest recall: what is missing

### C-013 (89% recall)

Missing rows (first run):
- II.2.3: Transporte - Alcance 3 (aggregate) (6025 t)
- I.1.3 + I.2.3 + I.3.3 (aggregate, no split): Energía estacionaria - Uso de energía, Alcance 3 (T&D losses, aggregate) (610156 t)

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
