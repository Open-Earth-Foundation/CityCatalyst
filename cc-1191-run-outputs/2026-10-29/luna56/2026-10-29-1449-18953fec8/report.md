# Ingestion accuracy run 2026-10-29 14:49 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 100% (+88 pts)
- Mean row precision: 100% (+67 pts)
- Mean value accuracy: 100% (+67 pts)
- Mean classification accuracy: 100% (=)

## Cost of this run

- LLM: 38 calls, 243,758 input and 19,945 output tokens (6,796 of them reasoning); largest output of one call 7,685; calls cut off at the token limit: 0
- OCR: 57 pages
- Estimated cost: $0.187 (previous run: $0.050)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-008 | Auckland - 2021.pdf | ok | 53 | 100% | 100% | 100% | 100% | 17/23 | +0.0% (within tolerance) | no | 117 s | 244k / 20k | 57 | $0.187 |

## Lowest recall: what is missing

### C-008 (100% recall)

No missing rows listed.

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
