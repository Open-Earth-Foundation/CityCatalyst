# Porto heat: 100 m rebenchmark

The finer grid preserves more local detail, but it does **not establish an overall accuracy improvement**. At identical reference locations, correct-and-present class coverage improves by just 0.25 percentage points. High-risk recall improves, while missing coverage and value error worsen.

## Scope and method

Only the delivered **heat** layer was regenerated at 100 m. No other hazards or Richfield layers were changed or scored here. The existing exports were evaluated without tuning recovery settings.

Reference: the previously downloaded, same-author numerical indexed PNG derivative, decoded as index/254 with index 255 excluded as no-data. Its original TIFF provenance remains unauthenticated. Results measure agreement with that derivative, not real-world hazard accuracy.

The same physical 3 km hash-selected test blocks are used at both resolutions, with identical grid origins. These blocks have already been observed in previous audits: this is a descriptive rebenchmark, not a fresh blind test. There is no spatial buffer or significance claim.

PDF support changed with resolution: 100 m requires 3 accepted colour pixels per cell; 250 m required 8. Differences cannot be attributed to grid size alone.

## Direct comparison at identical reference locations

The primary comparison evaluates each prediction at the **same 36,704 valid reference pixel centres**, within the test blocks and within 100 m cells containing at least 3 valid reference pixels. No prediction is interpolated. Missing predictions count as unsuccessful in the first row. Value errors use available predictions, so the paired-domain results below remove that remaining difference in coverage.

| Metric | 250 m | 100 m |
|---|---:|---:|
| Correct class and present / all reference locations | 73.654% | 73.907% |
| Correct class / locations with a prediction | 74.630% | 75.958% |
| Missing reference locations | 1.308% | 2.700% |
| Mean absolute value error (0–1 scale) | 0.05613 | 0.05856 |
| Signed bias | +0.01760 | +0.01988 |
| High-or-very-high recall, missing counted as missed | 74.445% | 80.761% |
| High-or-very-high precision, available reference locations | 68.145% | 70.198% |

On the **35,452 locations predicted by both**, exact class agreement rises from **74.870% to 76.142%**, but MAE worsens from **0.05552 to 0.05807**. Thus the class/detail gain does not imply better numerical estimates.

## Cell-level results at each grid's own scale

These rows have different aggregation units and denominators; they must not be read as a directly comparable accuracy drop. Averaging over larger cells smooths local errors and reference variation.

Eligibility is >=15 valid reference pixels for 250 m, and >=3 for 100 m: ceil(15 × (100/250)²). Classes use cut points 0.2/0.4/0.6/0.8. Missing eligible cells count as unsuccessful.

| Metric | 250 m | 100 m |
|---|---:|---:|
| Eligible test cells | 574 | 3,374 |
| Cells with both reference and prediction | 569 | 3,219 |
| Correct class and present / all eligible | 82.404% | 73.889% |
| Exact class / common cells | 83.128% | 77.446% |
| Missing eligible cells | 5 (0.871%) | 155 (4.594%) |
| MAE / common cells | 0.03831 | 0.05568 |
| Bias / common cells | +0.01128 | +0.01500 |
| High-or-very-high recall | 91.358% | 85.204% |
| High-or-very-high precision / common cells | 69.159% | 70.365% |
| Emitted cells with zero valid reference pixels | 0 / 595 (0.000%) | 49 / 3,331 (1.471%) |
| Emitted cells below reference eligibility | 26 / 595 (4.370%) | 63 / 3,331 (1.891%) |

The 49 empty-reference cells are an unsupported-coverage diagnostic, not proof that every one is wrong. Smaller cells change the likelihood of falling entirely in reference no-data. The diagnostic is reported separately from reference-location accuracy, which cannot score those cells.

## Sensitivity and full-domain results

For the 100 m test grid, requiring 1, 3, or 5 reference pixels gives respectively:

| Minimum reference pixels | Eligible cells | Correct and present / all | Missing |
|---|---:|---:|---:|
| 1 | 3,531 | 71.170% | 7.052% |
| 3 (primary) | 3,374 | 73.889% | 4.594% |
| 5 | 3,228 | 75.836% | 3.005% |

Across **all** spatial blocks (including development/validation), 100 m correct-and-present is **68.287%**, exact agreement on common cells **73.111%**, missing **6.597%**, MAE **0.06244**, and unsupported empty-reference coverage **426 / 21,195 cells (2.010%)**. These are descriptive full-domain figures, not held-out results. The displayed crop should not be taken as representative of the whole city.

## Validation and reproducibility

- The benchmark reproduces all previous 250 m heat test metrics and reference values/counts.
- Physical test-block membership matches at both resolutions, including synthetic boundary cases.
- Identical-location comparisons have identical reference denominators; the paired comparison uses their prediction intersection.
- Source/export hashes and machine-readable counts are in `outputs/porto-100m-benchmark.json`.
- Reproduce with the existing environment: `.venv/Scripts/python.exe -X utf8 benchmark_fine.py` (the venv is in the previous verification evidence folder).

No extraction settings, map exports, existing benchmark report, or original delivery archives were overwritten. Other hazards, original TIFF authentication, and new independent validation were not performed. The 100 m output remains experimental.
