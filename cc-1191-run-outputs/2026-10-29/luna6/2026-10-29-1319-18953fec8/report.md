# Ingestion accuracy run 2026-10-29 13:19 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 0% (-50 pts)
- Mean row precision: 0% (-62 pts)
- Mean value accuracy: 0% (-77 pts)
- Mean classification accuracy: n/a

## Cost of this run

- LLM: 7 calls, 49,325 input and 2,665 output tokens (2,235 of them reasoning); largest output of one call 1,925; calls cut off at the token limit: 0
- OCR: 18 pages
- Estimated cost: $0.042 (previous run: $0.088)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-009 | Toronto - 2019.pdf | ok | 2 | 0% | 0% | 0% | n/a | 0/5 | -39.7% (outside tolerance) | no | 36 s | 49k / 3k | 18 | $0.042 |

## Lowest recall: what is missing

### C-009 (0% recall)

Missing rows (first run):
- I.1.1: Natural Gas - Residential (4.79 MT CO2e) (4790000 t)
- I.2.1: Natural Gas - Commercial & Institutional (2.45 MT CO2e) (2450000 t)
- I.3.1: Natural Gas - Industrial (0.96 MT CO2e) (960000 t)
- I.1.2: Electricity - Residential (0.14 MT CO2e) (140000 t)
- I.2.2: Electricity - Commercial & Institutional (0.50 MT CO2e) (500000 t)
- I.3.2: Electricity - Industrial (0.07 MT CO2e) (70000 t)
- II.x (all subsectors and scopes): Transportation 2019 (5.6 MT CO2e) (5600000 t)
- III.x (all subsectors; scopes 1 and 3): Waste 2019 (1.0 MT CO2e) (1000000 t)

Stored but not in the key:
- I.1.1 scope 1: 4900000 t
- II.1.1 scope 1: 4500000 t

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
