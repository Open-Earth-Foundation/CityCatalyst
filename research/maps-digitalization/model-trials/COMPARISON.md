# Dedicated map-model trials on JVP's documents

All three requested trials have concluded. Golden-Muscat and LOAM each produced predictions for all 11 layers; DIGMAPPER was blocked before inference and has no quality score. The tested pretrained configurations do not justify replacing the existing source recovery.

## Matched Porto evaluation

These are equal-hazard averages across the same six hazards and previously selected test blocks, at 250 m resolution. Per-hazard eligible counts match across all four scored methods: 283 flood, 574 landslide, 574 heat, 573 drought, 574 arbovirus, 574 storm. Reference eligibility requires at least 15 valid reference pixels. Missing outputs count as unsuccessful in correct-and-present and high-risk recall. See comparison.json for per-hazard results.

| Method | Correct and present | Correct on common cells | Missing | High-risk recall | MAE on common cells |
|---|---:|---:|---:|---:|---:|
| Our colour recovery | 79.22% | 79.92% | 0.87% | 82.97% | 0.0461 |
| JVP original | 63.22% | 74.40% | 15.48% | 13.60% | 0.0688 |
| Golden-Muscat CPU adapter | 55.11% | 61.20% | 10.16% | 0.00% | 0.0897 |
| LOAM mode 6 / CPU strips | 20.97% | 76.66% | 72.72% | 0.00% | 0.0688 |
| DIGMAPPER | Unscored | Unscored | Unscored | Unscored | Unscored |

The 60.98% Golden-Muscat headline in its report pools all blocks; this table uses test blocks and equal-hazard averaging. Likewise LOAM's all-block results differ from its test results. MAE/common-cell scores cover different retained subsets and cannot alone rank coverage or full-map quality.

Our recovery still has unresolved unsupported coverage and high-risk precision failures. It is the best measured candidate here, not a production acceptance claim. The numerical reference is a same-author PNG derivative, not an independently authenticated original TIFF. The maps and folds were previously examined: this is retrospective, not a blind test. Our approach also benefited from earlier development on these documents, whereas the pretrained trials used frozen settings without reference-based tuning.

## Richfield

Golden-Muscat inundation IoU ranges from 0.0169 to 0.2937. Prioritization macro class IoU is 0.5944 at 144 DPI.

LOAM inundation predictions are nearly empty: zero foreground for 100-year and 10-year, one pixel for 2-year, and about 0.0077 IoU for MCE100. Prioritization continuous vector-area micro-IoU is 0.6673; this is not directly comparable with Golden-Muscat's macro class IoU. LOAM used 72 DPI and Golden-Muscat 144 DPI, so no exact inter-model Richfield ranking is asserted.

These measure PDF source-fill fidelity, not real-world flood truth. Direct vector extraction with the embedded GeoPDF coordinates remains the preferred Richfield route; comparing those vectors against themselves is not independent accuracy validation.

## What was actually run

- Golden-Muscat: public pretrained U-Net, strict checkpoint load, full-page/figure inference through a CPU adapter, supplied source legend crops and existing georeferencing; about 46 minutes. Not a successful stock end-to-end pipeline invocation. Public checkpoint identity is recorded but not proven identical to the newer wrapper's separately named checkpoint.
- LOAM: original pretrained network, upstream speed/quality mode 6, 256-by-1024 CPU strips, manually supplied source layout/legend aids. Strip context and GroupNorm statistics differ from standard 1024-square inference. A canonical square-tile probe was stopped at the configured memory guard; default-mode/full-map quality remains unmeasured. This result rejects this configuration, not every LOAM configuration.
- DIGMAPPER: installation and component attempts, but no polygon inference. The examined releases lacked the full orchestration/TOPAZ component, layout weight URLs returned NoSuchBucket, and Detectron2 compilation failed. Fixing the Windows build alone would not resolve the missing release assets. It is not assigned zero accuracy.

## Decision

Keep direct source-vector/GeoPDF recovery for Richfield and the existing deterministic colour recovery as the leading Porto PDF fallback, retaining its uncertainty and coverage limitations. These trials show that downloadable map-specific models exist, but the tested out-of-the-box adaptations transfer poorly to these risk-map styles. A standard-context LOAM trial on a machine with sufficient free memory would be a distinct, still-unmeasured experiment.

## Evidence

- [LOAM report](loam/report.md), [metrics](loam/metrics.json), [original/model overlays](loam/overlay.html)
- [Golden-Muscat report](uiuc/report.md), [metrics](uiuc/metrics.json), [original/model overlays](uiuc/overlay.html)
- [DIGMAPPER report](digmapper/report.md), [metrics](digmapper/metrics.json)
- [Matched Porto comparison](comparison.json)

Parent consolidation checked report evidence, validation records, metric arithmetic and matching per-hazard eligible counts. It did not rerun either network or independently reproduce every scoring step.
