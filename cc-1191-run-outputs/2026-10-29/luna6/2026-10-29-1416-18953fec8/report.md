# Ingestion accuracy run 2026-10-29 14:16 UTC

- Commit: `18953fec8` on `david/cc-1191-improve-ghgi-pdf-extraction-model-and-prevent-silent`
- Extraction model: openai/gpt-6-luna; OCR model: mistral-ocr-latest
- Runs per file: 1
- Compared with: previous run `18953fec8` (2026-10-29)

## Summary

- Cases: 1 (1 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 10% (+10 pts)
- Mean row precision: 100%
- Mean value accuracy: 100%
- Mean classification accuracy: 100%

## Cost of this run

- LLM: 37 calls, 245,888 input and 24,710 output tokens (10,640 of them reasoning); largest output of one call 6,564; calls cut off at the token limit: 0
- OCR: 58 pages
- Estimated cost: $0.153 (previous run: $0.147)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | Rosario, Argentina 2022.pdf | ok | 3 | 10% | 100% | 100% | 100% | 0/1 | -100.4% (outside tolerance) | no | 120 s | 246k / 25k | 58 | $0.153 |

## Lowest recall: what is missing

### C-015 (10% recall)

Missing rows (first run):
- I.1.1: Edificios residenciales (Alcance 1) (366748.06 t)
- I.1.2: Edificios residenciales (Alcance 2) (310091.48 t)
- I.1.3: Edificios residenciales (Alcance 3) (68594.07 t)
- I.2.1: Edificios comerciales e institucionales (Alcance 1) (42588.68 t)
- I.2.2: Edificios comerciales e institucionales (Alcance 2) (210868.38 t)
- I.2.3: Edificios comerciales e institucionales (Alcance 3) (46645.34 t)
- I.3.1: Industrias de fabricación y construcción (Alcance 1) (260613.21 t)
- I.3.2: Industrias de fabricación y construcción (Alcance 2) (122696.33 t)

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
