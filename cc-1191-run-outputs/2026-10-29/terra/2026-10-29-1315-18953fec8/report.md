# Ingestion accuracy run 2026-10-29 13:15 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-6.1-terra; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 55% (-45 pts)
- Mean row precision: 69% (-31 pts)
- Mean value accuracy: 73% (-27 pts)
- Mean classification accuracy: 92% (-8 pts)

## Cost of this run

- LLM: 22 calls, 143,495 input and 14,476 output tokens (3,568 of them reasoning); largest output of one call 4,571; calls cut off at the token limit: 0
- OCR: 30 pages
- Estimated cost: $0.276 (previous run: $0.151)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-004 | Philladelpia - 2022.pdf | ok | 21 | 55% | 69% | 73% | 92% | 0/0 | -0.2% (outside tolerance) | no | 106 s | 143k / 14k | 30 | $0.276 |

## Lowest recall: what is missing

### C-004 (55% recall)

Missing rows (first run):
- III.4.1: Wastewater Treatment and Discharge, Process Emissions (25081.5 t)
- V.2 (to confirm): AFOLU (-40472.15 t)
- I.1.1 / I.2.1 / I.3.1: Residential, Commercial, and Industrial Emissions from Gas Use (3195992.55 t)
- I.1.2 / I.2.2 / I.3.2: Residential, Commercial, and Industrial Emissions from Electricity Use (3925628.55 t)
- I.x.3: Electricity Losses (Stationary and Transportation) (193713.25 t)
- I.1.1 / I.2.1: Emissions from Other Fuels used in the residential and commercial subsectors (151613.13 t)
- I.3.1 / I.2.1: Emissions from Large Industrial and Commercial/Institutional Sources (132.7 t)
- To confirm: Wastewater Emissions from Other Fuels Use (7724.7 t)

Stored but not in the key:
- I.6.3 scope 3: 24477.32 t
- I.6.2 scope 2: 4119341.8 t
- I.6.1 scope 1: 3347738.38 t
- III.4.1 scope 1: 32806.2 t
- V.2 scope 1: -80944.3 t

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
