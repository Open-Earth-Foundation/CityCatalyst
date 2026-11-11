# Ingestion accuracy run 2026-10-29 18:56 UTC

- Commit: `bdd25e7ef` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: no previous run

## Summary

- Cases: 1 (0 scored row by row)
- Cases a user would see fail at OCR: 0
- Mean row recall: n/a
- Mean row precision: n/a
- Mean value accuracy: n/a
- Mean classification accuracy: n/a

## Cost of this run

- LLM: 4 calls, 26,807 input and 3,092 output tokens (1,571 of them reasoning); largest output of one call 2,505; calls cut off at the token limit: 0
- OCR: 4 pages
- Estimated cost: $0.017

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-023 | Kyoto, Japan (IPCC) 2023.pdf | ok | 8 | n/a | n/a | n/a | n/a | 0/0 | +0.0% (within tolerance) | no | 25 s | 27k / 3k | 4 | $0.017 |
## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
