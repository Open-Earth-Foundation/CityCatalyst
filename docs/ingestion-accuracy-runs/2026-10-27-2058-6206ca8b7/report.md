# Ingestion accuracy run 2026-10-27 20:58 UTC

- Commit: `6206ca8b7` on `david/cc-1132-core-ingestion-measure-current-accuracy-per-module-and-input`
- Extraction model: openai/gpt-5.6-luna; OCR model: mistral-ocr-latest
- Runs per file: 3
- Compared with: no previous run

## Summary

- Cases: 22 (20 scored row by row)
- Cases a user would see fail at OCR: 0
- Mean row recall: 53%
- Mean row precision: 56%
- Mean value accuracy: 67%
- Mean classification accuracy: 81%

## Cost of this run

- LLM: 1364 calls, 9,370,088 input and 1,870,232 output tokens
- OCR: 779 pages
- Estimated cost: $5.68

## Per case

Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.

| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-008 | Auckland - 2021.pdf | ok | 50 | 100% | 100% | 100% | 100% | 17/23 | +0.0% (within tolerance) | yes | 90 s | 731k / 63k | 57 | $0.336 |
| C-004 | Philladelpia - 2022.pdf | ok | 20 | 38% | 46% | 48% | 89% | 0/0 | +33332.6% (outside tolerance) | no | 97 s | 430k / 71k | 30 | $0.232 |
| C-010 | Toronto - 2020.pdf | ok | 12 | 100% | 100% | 100% | 100% | 0/0 | +0.0% (within tolerance) | yes | 23 s | 212k / 10k | 35 | $0.125 |
| C-009 | Toronto - 2019.pdf | ok | 2 | 6% | 17% | 17% | 100% | 0/5 | -51.0% (outside tolerance) | no | 25 s | 148k / 8k | 18 | $0.075 |
| C-006 | Seattle - 2022.pdf | ok | 18 | 4% | 6% | 6% | 100% | 0/0 | -33.1% (outside tolerance) | no | 139 s | 600k / 163k | 58 | $0.432 |
| C-005 | NYC - 2015.pdf | ok | 29 | 0% | 0% | 0% | n/a | 0/2 | +1805.6% (outside tolerance) | no | 134 s | 746k / 76k | 56 | $0.352 |
| C-007a | Miami - 2019 & 2021.pdf | ok | 16 | 100% | 100% | 100% | 100% | 0/1 | +0.0% (within tolerance) | yes | 45 s | 194k / 33k | 17 | $0.113 |
| C-007b | Miami - 2019 & 2021.pdf | ok | 16 | 100% | 100% | 100% | 100% | 0/1 | -0.0% (within tolerance) | yes | 42 s | 194k / 34k | 17 | $0.113 |
| C-007s | Miami_2019_2021_SCANNED_synthetic.pdf | ok | 19 | 90% | 89% | 90% | 100% | 0/1 | +0.7% (within tolerance) | no | 51 s | 206k / 37k | 17 | $0.120 |
| C-013 | Buenos Aires - 2022.pdf | ok | 39 | 89% | 100% | 100% | 100% | 18/24 | -5.2% (outside tolerance) | yes | 62 s | 473k / 53k | 46 | $0.250 |
| C-014 | Sao Paulo - 2022.pdf | ok | 50 | 95% | 95% | 95% | 100% | 26/32 | +0.0% (within tolerance) | yes | 48 s | 25k / 24k | 1 | $0.035 |
| C-015 | Rosario, Argentina 2022.pdf | ok | 32 | 92% | 94% | 95% | 100% | 0/1 | -0.2% (outside tolerance) | no | 100 s | 724k / 84k | 58 | $0.361 |
| C-016 | Mersin, Türkiye 2023.pdf | ok | 48 | 100% | 100% | 100% | 100% | 4/9 | -0.0% (within tolerance) | yes | 83 s | 441k / 52k | 43 | $0.236 |
| C-017 | Phoenix, USA 2022.pdf | ok | 29 | 21% | 49% | 49% | 62% | 0/26 | +1.4% (within tolerance) | no | 94 s | 737k / 91k | 46 | $0.348 |
| C-018 | Santiago, Chile 2022.pdf | ok | 42 | 92% | 92% | 92% | 100% | 0/3 | +0.1% (outside tolerance) | yes | 97 s | 294k / 95k | 26 | $0.224 |
| C-019 | Peñalolén, Chile 2022.pdf | ok | 29 | 0% | 0% | 0% | 0% | 0/0 | +2563.3% (outside tolerance) | yes | 564 s | 1430k / 864k | 100 | $1.52 |
| C-020 | Guadalajara, México 2022.pdf | ok | n/a | n/a | n/a | n/a | n/a | 0/0 | n/a | no | 16 s | 332k / 3k | 28 | $0.126 |
| C-021 | Curitiba, Brazil 2020.pdf | ok | 9 | 0% | 0% | n/a | 0% | 0/0 | -35.7% (within tolerance) | no | 36 s | 520k / 17k | 68 | $0.260 |
| C-022 | Madrid, Spain 2023 (IPCC con CIRIS).pdf | ok | 12 | 24% | 41% | 42% | 83% | 0/0 | -0.1% (outside tolerance) | yes | 78 s | 547k / 63k | 32 | $0.249 |
| C-023 | Kyoto, Japan (IPCC) 2023.pdf | ok | 5 | 0% | 0% | n/a | 0% | 0/0 | -8.3% (outside tolerance) | yes | 18 s | 80k / 7k | 4 | $0.033 |
| C-024 | Coimbatore, India 2019-20.pdf | ok | 15 | 10% | 0% | n/a | 100% | 0/0 | +0.1% (outside tolerance) | yes | 22 s | 133k / 20k | 8 | $0.067 |
| C-025 | Münster, Germany 2022.pdf | ok | n/a | n/a | n/a | n/a | n/a | 0/0 | n/a | no | 17 s | 172k / 3k | 14 | $0.067 |

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

Stored but not in the key:
- I.2.1 scope 1: 1075065 t
- I.2.2 scope 2: 952573 t
- II.1.1 scope 1: 261329 t
- II.3.1 scope 1: 68744 t
- II.4.1 scope 1: 2449 t

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

### C-021 (0% recall)

Missing rows (first run):
- I.8.1: Emissões fugitivas (274 t)
- I.1 (all scopes): Edificações residenciais (285188 t)
- I.2 (all scopes): Edificações comerciais (221330 t)
- I.2 (all scopes): Edificações institucionais (30860 t)
- I.3 (all scopes): Indústrias da construção civil e manufatura (206245 t)
- I.5 (all scopes): Agricultura, silvicultura e atividades de pesca (72 t)
- I.6 (all scopes): Fontes não especificadas (155783 t)
- II.1 + II.2 + II.5: Transporte Rodoviário, Ferroviário e Off-road (1899338 t)

Stored but not in the key:
- I.1.1 scope 1: 285188 t
- I.2.1 scope 1: 252190 t
- I.3.1 scope 1: 206245 t
- I.5.1 scope 1: 72 t
- I.6.1 scope 1: 155783 t

## Files in this folder

- `results.json`: full output of every run
- `cases/<id>/answer-key.json`: expected rows from the Product workbook
- `cases/<id>/extracted-values.json`: values stored by the import, per run
- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config
