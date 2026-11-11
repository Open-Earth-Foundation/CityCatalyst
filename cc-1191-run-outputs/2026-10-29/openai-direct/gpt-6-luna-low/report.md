# Ingestion accuracy run 2026-10-29 18:55 UTC

- Commit: `bdd25e7ef` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: gpt-6-luna (reasoning effort low); OCR model: mistral-ocr-latest
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

- LLM: 4 calls, 26,803 input and 1,940 output tokens (741 of them reasoning); largest output of one call 1,480; calls cut off at the token limit: 0
- OCR: 4 pages
- Estimated cost: $0.012

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-023 | Kyoto, Japan (IPCC) 2023.pdf | ok | 6 | n/a | n/a | n/a | n/a | 0/0 | -1.7% (outside tolerance) | no | 18 s | 27k / 2k | 4 | $0.012 |
## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
