# Ingestion accuracy run 2026-11-11 15:25 UTC

- Commit: `dccf79867` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 2
- Compared with: no previous run

## Summary

- Cases: 2 (2 scored row by row)
- Cases a user would see fail at OCR: 0
- Mean row recall: 91%
- Mean row precision: 91%
- Mean value accuracy: 92%
- Mean classification accuracy: 100%

## Cost of this run

- LLM: 104 calls, 802,963 input and 147,732 output tokens (57,048 of them reasoning); largest output of one call 7,463; calls cut off at the token limit: 0
- OCR: 84 pages
- Estimated cost: $0.506

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | Rosario, Argentina 2022.pdf | ok | 31 | 90% | 91% | 93% | 100% | 0/1 | -0.4% (outside tolerance) | no | 123 s | 542k / 60k | 58 | $0.296 |
| C-018 | Santiago, Chile 2022.pdf | ok | 45 | 92% | 92% | 92% | 100% | 0/3 | +0.1% (outside tolerance) | yes | 185 s | 261k / 88k | 26 | $0.209 |

## Lowest recall: what is missing

### C-015 (90% recall)

Missing rows (first run):
- I.4.4: Industrias de energía: generación entregada a la red (Territorial minus Alcance 1) (14873.61 t)
- V.1: Emisiones de ganadería (Alcance 1) (49.71 t)
- V.2: Emisiones del uso del suelo (Alcance 1) (-14041.4 t)
- V.3: Fuentes agregadas y no CO2 en la tierra (Alcance 1) (271.51 t)

Stored but not in the key:
- III.2.1 scope 1: 752.02 t
- V.3 scope 1: 567.72 t
- V.2 scope 1: -31553.11 t
- V.1 scope 1: 352.76 t

### C-018 (92% recall)

Missing rows (first run):
- III.2.1: Tratamiento biológico de residuos (Alcance 1), printed "2.760" (total column "2,8") (2.76 t)

Stored but not in the key:
- III.2.1 scope 1: 2760 t

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
