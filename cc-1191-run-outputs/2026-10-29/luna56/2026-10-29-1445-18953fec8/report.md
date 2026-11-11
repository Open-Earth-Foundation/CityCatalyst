# Ingestion accuracy run 2026-10-29 14:45 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 5% (-95 pts)
- Mean row precision: 6% (-94 pts)
- Mean value accuracy: 8% (-92 pts)
- Mean classification accuracy: 33% (-67 pts)

## Cost of this run

- LLM: 22 calls, 143,497 input and 27,397 output tokens (11,312 of them reasoning); largest output of one call 4,949; calls cut off at the token limit: 0
- OCR: 30 pages
- Estimated cost: $0.122 (previous run: $0.088)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-004 | Philladelpia - 2022.pdf | ok | 33 | 5% | 6% | 8% | 33% | 0/0 | +94748.5% (outside tolerance) | no | 131 s | 143k / 27k | 30 | $0.122 |

## Lowest recall: what is missing

### C-004 (5% recall)

Missing rows (first run):
- I.8.1: Gas Losses (Fugitive Emissions) (230930.07 t)
- II.1.1: On-Road (3341064.2 t)
- II.2.1: Railways (185427.05 t)
- II.2.3: Railways (46301.99 t)
- II.3.1: Waterborne Navigation (34378.01 t)
- II.4.1: Aviation (16560 t)
- II.4.3: Aviation (2989229 t)
- III.1.2: Solid Waste Disposal (398025.29 t)

Stored but not in the key:
- III.1.1 scope 1: 398025.29 t
- III.3.1 scope 1: 4528.14 t
- III.4.1 scope 1: 32806.2 t
- I.6.2 scope 2: 4119341800 t
- I.4.1 scope 1: 766371606 t

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
