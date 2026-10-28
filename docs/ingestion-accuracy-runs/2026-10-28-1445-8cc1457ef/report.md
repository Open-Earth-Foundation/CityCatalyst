# Ingestion accuracy run 2026-10-28 14:45 UTC

- Commit: `8cc1457ef` on `david/cc-1132-core-ingestion-measure-current-accuracy-per-module-and-input`
- Extraction model: openai/gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 3
- Compared with: previous run `6206ca8b7` (2026-10-27)

## Summary

- Cases: 11 (6 scored row by row)
- Cases a user would see fail at OCR: 0 (before: 0)
- Mean row recall: 61% (+8 pts)
- Mean row precision: 66% (+9 pts)
- Mean value accuracy: 67% (+1 pts)
- Mean classification accuracy: 76% (-5 pts)

## Cost of this run

- LLM: 776 calls, 5,356,745 input and 1,268,625 output tokens
- OCR: 427 pages
- Estimated cost: $3.45 (previous run: $5.68)

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | Rosario, Argentina 2022.pdf | ok | 28 | 91% (-1 pts) | 96% (+2 pts) | 96% (+1 pts) | 100% | 0/1 | -0.3% (outside tolerance) | no | 107 s | 717k / 70k | 58 | $0.344 |
| C-016 | Mersin, Türkiye 2023.pdf | ok | 41 | 88% (-12 pts) | 100% (=) | 100% (=) | 100% | 2/9 | -9.2% (outside tolerance) | no | 87 s | 441k / 43k | 43 | $0.226 |
| C-017 | Phoenix, USA 2022.pdf | ok | 10 | 9% (-12 pts) | 19% (-29 pts) | 19% (-29 pts) | 64% | 0/26 | +67740.6% (outside tolerance) | no | 99 s | 699k / 83k | 46 | $0.332 |
| C-018 | Santiago, Chile 2022.pdf | ok | 43 | 89% (-3 pts) | 89% (-3 pts) | 89% (-3 pts) | 100% | 0/3 | +0.2% (outside tolerance) | no | 104 s | 287k / 85k | 26 | $0.211 |
| C-019 | Peñalolén, Chile 2022.pdf | ok | 27 | 0% (=) | 0% (=) | 0% (=) | 0% | 0/0 | +2563.3% (outside tolerance) | yes | 733 s | 1437k / 878k | 100 | $1.54 |
| C-020 | Guadalajara, México 2022.pdf | ok | n/a | n/a | n/a | n/a | n/a | 0/0 | n/a | no | 22 s | 332k / 3k | 28 | $0.126 |
| C-021 | Curitiba, Brazil 2020.pdf | ok | 12 | 91% (+91 pts) | 91% (+91 pts) | 100% | 91% | 0/0 | +0.0% (within tolerance) | yes | 37 s | 521k / 16k | 68 | $0.259 |
| C-022 | Madrid, Spain 2023 (IPCC con CIRIS).pdf | ok | 12 | n/a | n/a | n/a | n/a | 0/0 | -0.1% (outside tolerance) | yes | 85 s | 539k / 59k | 32 | $0.243 |
| C-023 | Kyoto, Japan (IPCC) 2023.pdf | ok | 6 | n/a | n/a | n/a | n/a | 0/0 | -3.3% (outside tolerance) | no | 19 s | 80k / 8k | 4 | $0.033 |
| C-024 | Coimbatore, India 2019-20.pdf | ok | 15 | n/a | n/a | n/a | n/a | 0/0 | +0.1% (outside tolerance) | yes | 27 s | 133k / 20k | 8 | $0.066 |
| C-025 | Münster, Germany 2022.pdf | ok | n/a | n/a | n/a | n/a | n/a | 0/0 | n/a | no | 18 s | 172k / 3k | 14 | $0.067 |

## Lowest recall: what is missing

### C-019 (0% recall)

Missing rows (first run):
- I.3.1: Industrial: Alcance 1 (4 kt) (4000 t)
- I.3.2: Industrial: Alcance 2 (82 kt) (82000 t)
- I.3.3: Industrial: Alcance 3 (4 kt) (4000 t)
- II.1.1: Transporte por carretera: Alcance 1 (780 kt) (780000 t)
- II.1.2: Transporte por carretera: Alcance 2 (1 kt) (1000 t)
- II.2.2: Ferroviario: Alcance 2 (13 kt) (13000 t)
- III.1.2: Residuos sólidos generados en la ciudad: Alcance 3 (181 kt) (181000 t)
- III.4.2: Aguas residuales generadas en la ciudad: Alcance 3 (49 kt) (49000 t)

Stored but not in the key:
- I.1.1 scope 1: 2815300 t
- I.1.2 scope 2: 3347600 t
- I.1.3 scope 3: 167400 t
- I.3.1 scope 1: 2560000 t
- I.3.2 scope 2: 3624100 t

### C-017 (9% recall)

Missing rows (first run):
- I.1.1: Residential buildings: fuel combustion (332016 t)
- I.1.2: Residential buildings: grid-supplied energy (2858239 t)
- I.1.3: Residential buildings: T&D losses (124597 t)
- I.2.1: Commercial and institutional: fuel combustion (386989 t)
- I.2.2: Commercial and institutional: grid-supplied energy (3328587 t)
- I.2.3: Commercial and institutional: T&D losses (145100 t)
- I.4.1: Energy industries: power plant auxiliary operations (0 t)
- I.4.4: Energy generation supplied to the grid (scope "T") (774664 t)

Stored but not in the key:
- I.1.1 scope 1: 3190000 t
- I.2.1 scope 1: 3716000 t
- II.1.1 scope 1: 6504000 t
- II.2.1 scope 1: 11800 t
- III.1.1 scope 1: 284400 t

### C-016 (88% recall)

Missing rows (first run):
- II.3.1: Waterborne navigation (Scope 1) (58550 t)
- II.4.1: Aviation (Scope 1) (129 t)
- III.1.1: Solid waste generated in the city, row III.1.1/2 (Scope 1) (355600 t)
- III.3.2: Incinerated and burned waste, row III.3.1/2 (Scope 3) (9 t)
- III.4.1: Wastewater generated in the city, row III.4.1/2 (Scope 1) (187400 t)
- IV.1: Industrial processes in the city boundary (3840793 t)
- IV.2: Product use in the city boundary (152018 t)
- V.1: Emissions from livestock (679307 t)

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
