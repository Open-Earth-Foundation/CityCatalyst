# Porto: all six hazards at 10 x 10 m

All recovery outputs and reference comparisons now use 10 m cell centres, with no 250 m averaging. Twenty-four GeoTIFFs contain six hazards for four methods. Each TIFF is EPSG:31982, has 10 m pixels and uses 255 for unknown; codes 0..9 map to risk-bin midpoints (code+0.5)/10. Source images still provide approximately 30 m detail; resampling creates correlated smaller cells, not new observations.

## Matched test comparison

Equal-hazard averages over the existing physical 3 km test blocks. Previously examined maps: retrospective, not blind. Correct-and-present divides correctly classified cells by all eligible reference cells; missing predictions are unsuccessful.

| Method | Correct and present | Missing | High-risk recall |
|---|---:|---:|---:|
| Our colour recovery | 63.31% | 9.21% | 67.14% |
| Golden-Muscat | 55.56% | 9.74% | 0.27% |
| LOAM mode 6 / strips | 17.47% | 80.21% | 0.00% |
| JVP coarse output resampled | 63.91% | 10.78% | 11.27% |

Our colour recovery no longer leads the broad-class agreement metric: 63.31% versus 63.91% for resampled JVP. It recovers many more high-risk locations, but high-risk precision and unsupported coverage must also be considered. The old 79.22% score measured a different, coarser task; it does not describe these outputs.

| Hazard | Eligible test cells | Correct | Missing | Correct and present |
|---|---:|---:|---:|---:|
| flood | 120694 | 67036 | 12406 | 55.54% |
| landslide | 311623 | 201713 | 28816 | 64.73% |
| heat | 314267 | 201897 | 27945 | 64.24% |
| drought | 313452 | 205028 | 27948 | 65.41% |
| arbovirus | 314294 | 208270 | 27539 | 66.27% |
| storm | 314294 | 200137 | 28808 | 63.68% |

## Definition and limits

- Prediction: classify native PDF pixels with the frozen grey-blending model, then sample the nearest accepted source pixel at every 10 m centre. Rejected colours remain unknown. No cell averaging, filling or smoothing. The former eight-pixel support requirement for a 250 m mean is not applied.
- Reference: transform every 10 m centre to the numerical raster and take the native pixel containing it. A centre is eligible when that source pixel has data. The old >=15-pixel-per-cell criterion cannot be applied to subpixel grids.
- Five scoring classes have boundaries 0.2/0.4/0.6/0.8. Repeated subpixel values are correlated; millions of cells do not mean millions of independent measurements.
- Golden-Muscat and LOAM use their saved frozen source-pixel predictions; networks were not retrained or rerun. Their original configuration limitations remain.
- JVP is the shipped coarse output copied onto smaller cells. It gains no geometric detail. Its intended legend step is round(value*9), matching the previous class-decoding rule. Its reported MAE in JSON uses that rounded bin midpoint, not the original continuous stored value.
- DIGMAPPER remains unscored because no predictions were produced.
- Reference PNGs come from the same author; original TIFF provenance is unauthenticated. No numeric-reference values enter the recovery.
- Predictions where reference is absent are recorded separately, not counted as correct or wrong in class agreement. The JSON includes counts, confusion matrices, value error and high-risk precision.
- Richfield source-vector exports remain vectors; they never used a 250 m aggregation grid. This rebenchmark concerns the six Porto layers.

## Files and checks

Each hazard folder contains colour_recovery.tif, golden_muscat.tif, loam.tif and jvp_resampled.tif. benchmark.json contains every count, output hash and per-hazard/all/test metric.

Verified all exported TIFF arrays by readback, including 10 m georeferencing. The full extent contains all valid native reference pixel centres. The new heat output exactly matches the existing requested 10 m heat overlay, with unknown padding outside it. Confusion-matrix totals equal eligible denominators.

Reproduce: run benchmark_10m_all.py with model-trials/uiuc/.venv/Scripts/python.exe, then write_10m_report.py. All writes go to outputs/porto-all-10m; previous outputs remain available.