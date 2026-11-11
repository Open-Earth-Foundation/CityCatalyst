# Ingestion accuracy run 2026-11-11 15:14 UTC

- Commit: `dccf79867` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: gpt-6-luna; OCR model: mistral-ocr-latest
- Runs per file: 2
- Compared with: no previous run

## Summary

- Cases: 2 (2 scored row by row)
- Cases a user would see fail at OCR: 0
- Mean row recall: 80%
- Mean row precision: 83%
- Mean value accuracy: 86%
- Mean classification accuracy: 98%

## Cost of this run

- LLM: 103 calls, 796,523 input and 130,363 output tokens (72,211 of them reasoning); largest output of one call 16,000; calls cut off at the token limit: 1
- OCR: 84 pages
- Estimated cost: $0.313

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | Rosario, Argentina 2022.pdf | ok | 29 | 90% | 93% | 96% | 96% | 0/1 | -0.4% (outside tolerance) | no | 183 s | 551k / 67k | 58 | $0.205 |
| C-018 | Santiago, Chile 2022.pdf | ok | 29 | 71% | 73% | 76% | 100% | 0/3 | -0.0% (outside tolerance) | no | 176 s | 246k / 63k | 26 | $0.108 |

## Lowest recall: what is missing

### C-018 (71% recall)

Missing rows (first run):
- III.2.1: Tratamiento biológico de residuos (Alcance 1), printed "2.760" (total column "2,8") (2.76 t)

Stored but not in the key:
- III.2.1 scope 1: 2760 t

### C-015 (90% recall)

Missing rows (first run):
- I.4.2: Industrias de energía (Alcance 2) (26759.85 t)
- I.4.4: Industrias de energía: generación entregada a la red (Territorial minus Alcance 1) (14873.61 t)
- V.2: Emisiones del uso del suelo (Alcance 1) (-14041.4 t)

Stored but not in the key:
- I.6.2 scope 2: 26759.85 t
- V.2 scope 1: -27761.58 t

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
