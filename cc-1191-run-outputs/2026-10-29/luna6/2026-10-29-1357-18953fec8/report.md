# Ingestion accuracy run 2026-10-29 13:57 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 67%
- Mean row precision: 100%
- Mean value accuracy: 100%
- Mean classification accuracy: 100%

## Cost of this run

- LLM: 15 calls, 100,143 input and 33,697 output tokens (18,066 of them reasoning); largest output of one call 7,947; calls cut off at the token limit: 0
- OCR: 26 pages
- Estimated cost: $0.079 (previous run: $0.068)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-018 | Santiago, Chile 2022.pdf | ok | 23 | 67% | 100% | 100% | 100% | 0/3 | -7.6% (outside tolerance) | no | 161 s | 100k / 34k | 26 | $0.079 |

## Lowest recall: what is missing

### C-018 (67% recall)

Missing rows (first run):
- IV.2: Uso de productos (Alcance 1) (85668 t)
- III.1.2: Disposición de residuos sólidos (Alcance 3) (77495 t)
- III.2.1: Tratamiento biológico de residuos (Alcance 1), printed "2.760" (total column "2,8") (2.76 t)
- III.4.2: Tratamiento de aguas residuales (Alcance 3), printed "6,4" / "6.4" (6.4 t)

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
