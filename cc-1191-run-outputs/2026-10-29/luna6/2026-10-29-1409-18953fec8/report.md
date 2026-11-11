# Ingestion accuracy run 2026-10-29 14:09 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 8% (-92 pts)
- Mean row precision: 25% (-75 pts)
- Mean value accuracy: 33% (-67 pts)
- Mean classification accuracy: 100% (=)

## Cost of this run

- LLM: 35 calls, 232,942 input and 26,654 output tokens (13,642 of them reasoning); largest output of one call 3,632; calls cut off at the token limit: 0
- OCR: 46 pages
- Estimated cost: $0.129 (previous run: $0.107)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-017 | Phoenix, USA 2022.pdf | ok | 9 | 8% | 25% | 33% | 100% | 0/26 | +1.7% (outside tolerance) | no | 111 s | 233k / 27k | 46 | $0.129 |

## Lowest recall: what is missing

### C-017 (8% recall)

Missing rows (first run):
- I.1.1: Residential buildings: fuel combustion (332016 t)
- I.1.2: Residential buildings: grid-supplied energy (2858239 t)
- I.1.3: Residential buildings: T&D losses (124597 t)
- I.2.1: Commercial and institutional: fuel combustion (386989 t)
- I.2.2: Commercial and institutional: grid-supplied energy (3328587 t)
- I.2.3: Commercial and institutional: T&D losses (145100 t)
- I.3.1: Manufacturing and construction: fuel combustion (printed ref "I.1.1") (80308 t)
- I.4.1: Energy industries: power plant auxiliary operations (0 t)

Stored but not in the key:
- I.6.1 scope 1: 849903 t
- I.6.2 scope 2: 6186826 t
- I.6.3 scope 3: 269697 t
- II.1.1 scope 1: 8453966 t
- II.1.2 scope 2: 16391 t

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
