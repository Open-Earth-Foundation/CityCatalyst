# Ingestion accuracy run 2026-10-29 14:13 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 0% (-8 pts)
- Mean row precision: n/a
- Mean value accuracy: n/a
- Mean classification accuracy: n/a

## Cost of this run

- LLM: 30 calls, 202,975 input and 29,201 output tokens (7,589 of them reasoning); largest output of one call 16,000; calls cut off at the token limit: 1
- OCR: 56 pages
- Estimated cost: $0.147 (previous run: $0.129)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-005 | NYC - 2015.pdf | ok | 6 | 0% | n/a | n/a | n/a | 0/2 | -100.0% (outside tolerance) | no | 205 s | 203k / 29k | 56 | $0.147 |

## Lowest recall: what is missing

### C-005 (0% recall)

Missing rows (first run):
- I.1.1: Residential (small and large residential) - #2 fuel oil (1746430 t)
- I.1.1: Residential (small and large residential) - #4 fuel oil (1081765 t)
- I.1.1: Residential (small and large residential) - #6 fuel oil (145451 t)
- I.1.1: Residential (small and large residential) - Biofuel (59 t)
- I.1.1: Residential (small and large residential) - Natural gas (9297070 t)
- I.1.2: Residential (small and large residential) - Electricity (4035680 t)
- I.1.2: Residential (small and large residential) - Steam (286277 t)
- I.2.1: Commercial and Institutional (commercial, institutional, and streetlights) - #2 fuel oil (989642 t)

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
