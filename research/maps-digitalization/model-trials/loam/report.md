# LOAM pretrained execution trial

Updated 2026-10-30T12:44:29.615365+00:00.

**Execution: 11/11 complete layers.** Official weights were downloaded and the original 31,061,202-parameter LOAM network ran on CPU. This is a resource-adapted test of the pretrained method, with the highest-efficiency upstream preprocessing mode and shorter inference strips. It is not a reproduction of the paper’s benchmark or the default full pipeline.

**Quality finding:** Across 6 completed Porto hazards, existing-test-block exact-and-present averages 20.97%, with 72.72% missing. 2 of 5 completed Richfield layers have no predicted foreground inside the source frame. Successful execution means completed inference and artifacts, not accepted reconstruction quality. This tested configuration does not support replacing the existing source recovery.

Richfield prioritization is the strongest result: **66.89% pixel micro-IoU**, **66.73% continuous vector-area micro-IoU**. The inundation outputs remain nearly empty (the 2-year layer contains one predicted pixel). These are document source-fidelity scores, not independently validated flood accuracy.

## Availability, identity and environment

- Upstream: [Fandel-Lin/LOAM](https://github.com/Fandel-Lin/LOAM), revision `8176ace4f1d5af56baa8d3bd8481c7ed8cccf048`. The local upstream checkout is unmodified; wrappers are separate.

- Official checkpoint link is at **root** `checkpoints/checkpoint_epoch14.pth_link.txt` in this revision (the README names `LOAM/checkpoints/...`, which is absent). [Download](https://drive.google.com/uc?id=1eqbLoJ2XkWBe9mlZ4hpttc9rFpYUXrGK).

- Checkpoint: `124342193` bytes, SHA-256 `3ad85414a951ece88bf9a14daaf74b5b98ea6333695b45e410ce519262b32f73`. `torch.load(weights_only=True)` and strict state-dict load succeeded with all keys matching, `mask_values=[0,1]`.

- Python 3.11.15 isolated in `.venv`. CPU PyTorch 2.5.1+cpu, torchvision 0.20.1+cpu, NumPy 1.26.4, upstream-pinned OpenCV 4.6.0.66. This differs from upstream’s Python 3.9/PyTorch 1.13 environment; compatible model loading was verified. `requirements-lock.txt` and `provenance.json` contain versions and input hashes.

- Host: Intel i5-13600KF, 20 logical CPUs, 31.8 GiB physical RAM. Only roughly 0.9–2.1 GiB RAM was available during setup and inference. No GPU was used, so no GPU lock was acquired; no other processes were stopped or reconfigured.

- Measured setup substeps: shallow clone 1.65 s; isolated environment/base dependency command 9.56 s; official checkpoint download command 9.14 s; PyTorch resolver/download/install approximately 16.62 s (sum of uv-reported phases); extra rasterio/PyMuPDF pin command 3.97 s. These exclude investigation and adapter authoring time. Logs preserve installation/download results.

## Source inputs and frozen procedure

All six Porto native embedded figures and all five whole Richfield pages are covered when their status is succeeded. No attractive subcrop was used for inference. Porto figures retain native resolution (about 1213×1758 pixels); Richfield pages are rasterized at 72 DPI, 1224×792 pixels. Richfield’s coarser sampling loses thin/small source features.

Manual layout aids: Porto legend column and printed frame; Richfield sidebar legend symbols and embedded map viewport. Legend samples are cropped from the rendered source, saved under `inputs/`; Richfield’s known palette selects sidebar symbols only, never in-map flood geometry. Ten Porto legend shades are ten separate model queries. No reference PNG values, JVP hazard values, or recovered flood geometry enter inference. No training, finetuning, reference fitting, or numerical-reference-based pixel masking was performed.

Preprocessing calls the original `metadata_preprocessing` with official `trade_off=6`. Its stock postprocessing maps channels to `[v7,v7,v7,v7,black,boundary,v2]`; the wrapper reproduces those seven channels and the original normalization, plus the original 32 color and 9 map metadata numbers. Upstream workers run serially with deep-copied arguments, preserving process-isolated arguments while limiting memory. Upstream can increase the process count despite the requested count; the wrapper disables that override. The eagerly imported GDAL area-generator module is replaced by a fail-closed gate because manually supplied source bounds bypass that code. Automatic map-area segmentation, text-description integration and upstream GDAL polygon-output stages were not used. Prediction vector exports are explicitly derived from the model masks.

The original network and checkpoint are unchanged. Inference uses float32 CPU, batch one, 256×1024 strips, zero bitmap padding on right/bottom edges, no overlap or resizing. Width 1024 is retained because the metadata fusion broadcasts 64-wide vectors at the bottleneck. Reducing strip height changes spatial context and GroupNorm statistics relative to a stock 1024-square tile; quality may change. The original square-only output interpolation is omitted because logits already have the correct rectangular shape. Two-class argmax is unchanged; the CLI’s nominal 0.1 threshold is unused in its two-class branch.

CPU threads changed from 2 to 4 on the 20-logical-core host before evaluation, without changing decoding or scoring. The first three complete heat bins used 2 threads and were retained; remaining bins use 4. The scheduler was restarted to correctly measure Windows venv descendant memory. Its initial logs/settings are retained in `logs/attempt1/`. The initial source-frame detector selected the bottom line only; a source-only area sanity check exposed and corrected this before any network inference. No reference values were used for either correction.

Arbitration: among accepted foreground masks, choose the largest float32 foreground probability; exact ties choose the lower legend index. No accepted mask = unknown (255 in `labels.png`), never zero risk. Per-class masks and unrounded probability arrays are preserved. `frozen-settings.json` was written before inference/reference evaluation; a recorded CPU resource update changed only thread count. Numerical reference values have not been used to revise any settings.

## Layer coverage and runtime

| Layer | Status | Preprocess s | Network class s | Tiles | Peak process tree MiB |
|---|---|---:|---:|---:|---:|
| porto-heat | succeeded | 13.33 | 466.61 | 140 | 999 |
| porto-flood | succeeded | 11.28 | 371.38 | 140 | 1004 |
| porto-landslide | succeeded | 10.25 | 360.36 | 140 | 1006 |
| porto-drought | succeeded | 13.41 | 359.71 | 140 | 999 |
| porto-arbovirus | succeeded | 10.23 | 364.40 | 140 | 1099 |
| porto-storm | succeeded | 12.29 | 364.14 | 140 | 1106 |
| richfield-inundation-100yr | succeeded | 8.23 | 20.30 | 8 | 978 |
| richfield-inundation-2yr | succeeded | 6.14 | 19.70 | 8 | 1046 |
| richfield-inundation-10yr | succeeded | 6.14 | 20.84 | 8 | 1047 |
| richfield-inundation-mce100 | succeeded | 7.17 | 19.74 | 8 | 982 |
| richfield-prioritization-score | succeeded | 7.21 | 84.03 | 32 | 990 |

Preprocessing is limited to 180 s and inference to 1200 s per layer in the corrected runner, with an own-process-tree RSS ceiling of 2300 MiB. No three-map preprocessing concurrency is used. Network class times include resumed complete bins; process-stage wall times and peak memory are in `run-status.json`. Initial interrupted work is archived separately and not hidden as successful inference.

## Porto: common 250 m evaluation

Unchanged `porto.py` tick transform and municipal domain, origin E=462000/N=6692000, 152 columns, 250 m cells. Predictions require at least three accepted source pixels; values average ten legend bin midpoints `(k+0.5)/10`. References require at least 15 valid derivative raster pixels. Classes use 0.2/0.4/0.6/0.8. Missing predictions count unsuccessful in exact-all and high-risk recall. All output is retained even where the reference has zero or fewer than 15 pixels.

The reference is the same-author indexed PNG derivative, not an independently authenticated original TIFF or hazard truth. Shared 3 km hash folds from `benchmark.py` are unchanged. These maps/folds were previously audited; this is retrospective, not a blind test. No spatial buffer, significance claim or confidence interval is supplied.

### All eligible cells

| Hazard | Eligible | Common | Correct | Exact common % | Exact all % | Missing % | Bias | MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| heat | 3809 | 537 | 413 | 76.91 | 10.84 | 85.90 | -0.04218 | 0.06662 |
| flood | 1805 | 332 | 258 | 77.71 | 14.29 | 81.61 | -0.05218 | 0.06928 |
| landslide | 3806 | 508 | 383 | 75.39 | 10.06 | 86.65 | -0.05160 | 0.07124 |
| drought | 3744 | 619 | 497 | 80.29 | 13.27 | 83.47 | -0.05173 | 0.06720 |
| arbovirus | 3809 | 573 | 476 | 83.07 | 12.50 | 84.96 | -0.04059 | 0.06270 |
| storm | 3809 | 611 | 471 | 77.09 | 12.37 | 83.96 | -0.04813 | 0.07256 |

### Previously selected test blocks

| Hazard | Eligible / common / correct | Exact all % | Missing n | High recall TP / all reference high | High precision TP / common predicted high | Zero-reference output / all output | Low-reference output / all output |
|---|---|---:|---:|---|---|---|---|
| heat | 574 / 141 / 104 | 18.12 | 433 | 0 / 81 (0.00%) | 0 / 0 (undefined%) | 1 / 145 | 3 / 145 |
| flood | 283 / 80 / 65 | 22.97 | 203 | 0 / 43 (0.00%) | 0 / 0 (undefined%) | 6 / 89 | 3 / 89 |
| landslide | 574 / 137 / 103 | 17.94 | 437 | 0 / 61 (0.00%) | 0 / 0 (undefined%) | 1 / 141 | 3 / 141 |
| drought | 573 / 181 / 145 | 25.31 | 392 | 0 / 11 (0.00%) | 0 / 0 (undefined%) | 3 / 188 | 4 / 188 |
| arbovirus | 574 / 159 / 124 | 21.60 | 415 | 0 / 26 (0.00%) | 0 / 0 (undefined%) | 1 / 164 | 4 / 164 |
| storm | 574 / 159 / 114 | 19.86 | 415 | 0 / 90 (0.00%) | 0 / 0 (undefined%) | 3 / 167 | 5 / 167 |

Test-block equal-hazard averages over the 6 completed hazards: exact-all **20.97%**, exact-common **76.66%**, missing **72.72%**, MAE **0.06884**. `metrics.json` also contains pooled raw counts and all four fold reports. Percentages with different denominators are not combined into one accuracy.

High-risk precision is conditional on common reference/prediction cells; output outside eligible reference support is reported separately. Empty-reference disagreement is an unsupported-coverage diagnostic, not proof of false real-world flood risk. The code asserts equality with `benchmark.metrics()` on every defined metric, and saves every evaluated cell with its fold, reference support, prediction support, and values.

## Richfield: source fidelity

| Layer / class | IoU | Precision | Recall | Intersection / union pixels | Source pixels | Edge p95 m |
|---|---:|---:|---:|---|---:|---:|
| inundation-100yr / 100yr | 0.0000 | undefined | 0.0000 | 0 / 69935 | 69935 | undefined |
| inundation-2yr / 2yr | 0.0000 | 1.0000 | 0.0000 | 1 / 30811 | 30811 | 6260.48 |
| inundation-10yr / 10yr | 0.0000 | undefined | 0.0000 | 0 / 43191 | 43191 | undefined |
| inundation-mce100 / mce100 | 0.0077 | 0.8062 | 0.0077 | 674 / 87209 | 87047 | 1053.03 |
| prioritization-score / 0.0 - 2.4 | 0.5678 | 0.6975 | 0.7534 | 20051 / 35311 | 26614 | 636.63 |
| prioritization-score / 2.5 - 4.4 | 0.7829 | 0.8608 | 0.8965 | 19834 / 25333 | 22125 | 356.84 |
| prioritization-score / 4.5 - 6.4 | 0.6900 | 0.8063 | 0.8271 | 6136 / 8893 | 7419 | 190.98 |
| prioritization-score / 6.5 - 10 | 0.6985 | 0.8085 | 0.8369 | 11548 / 16533 | 13798 | 61.43 |

Reference geometry comes from the existing direct PDF exports, inverse-transformed to page points using the unchanged GeoPDF affine. Source path types are recorded per layer: prioritization includes **474 `fs` and 272 `f`** paths; inundation layers use their full `f` extraction. Evaluation covers the complete GeoPDF frame, sampling pixel centers at 1 pixel/point (about 7.62 m/pixel). Missing model foreground is a false negative in the binary source-fidelity metric. The source geometry represents fills before rendered labels, strokes and background imagery; those visible occlusions can contribute to mismatch.

Edge errors are bidirectional distances between raster boundary pixel centers; mean, median, p95, maximum and both directional means are retained. They are resolution-limited, not subpixel or surveyed accuracy. The lower-resolution masks can miss narrow polygons. This is source-fidelity reconstruction, not independently validated flood truth. No independent georeferencing system was exercised.

## Outputs, limitations and rerun

- `predictions/<layer>/`: every full-source class mask, float32 probability array, arbitrated labels (255 unknown), overlap counts and completion/runtime records. These are model outputs, not the source-derived preprocessing candidate masks.

- `evaluation/porto/`: 250 m predicted GeoJSON and per-cell score evidence. `evaluation/richfield/`: source evaluation masks and model-derived predicted GeoJSON.

- `overlay.html`: self-contained, aligned original/model opacity views for the existing Porto heat and Wood Lake crops. `evidence/` has original, model, transparent mask, overlay PNGs and exact alignment metadata. The focused fragments do not establish whole-map quality.

- `logs/`, `requirements-lock.txt`, `provenance.json`, `frozen-settings.json`, `input-manifest.json`, `artifact-hashes.json`: execution evidence and reproducibility. All writes are confined to `model-trials/loam`; source inputs, existing exports and sibling trials were preserved.

Principal limits: different domain from geological maps, source-derived manual layout/registration aids, official speed/quality mode 6, CPU strip context changes, Richfield 72-DPI rasterization, software version differences, and previously observed evaluation maps. Successful execution alone is not a quality pass. No production use or replacement of existing source vector/raster routes is justified by this run.

From this directory in PowerShell 7 non-login:

```powershell
# Existing environment: complete fresh inference and regenerate evidence.
& .\rerun.ps1

# Individual bounded model stages; no labels/reference used here.
& .\.venv\Scripts\python.exe -X utf8 preprocess.py porto-heat --trade-off 6
& .\.venv\Scripts\python.exe -X utf8 infer.py porto-heat --force

# Re-score saved predictions without rerunning or tuning the model.
& .\.venv\Scripts\python.exe -X utf8 evaluate.py
& .\.venv\Scripts\python.exe -X utf8 make_artifacts.py
& .\.venv\Scripts\python.exe -X utf8 build_report.py
```

For a clean dependency install, use the isolated cache/temp paths and commands in `commands.ps1`; `requirements-lock.txt` pins the resolved packages. Reruns overwrite only this trial’s own outputs. The initial first-three-bin 2-thread execution is documented; a fresh rerun uses four threads throughout and may have small floating-point differences.

Supplementary Richfield `continuous_page_geometry` fields compare the model pixel-square polygons directly with recovered vector fills using continuous page-coordinate areas. Their IoU, precision, recall and raw areas avoid reference-rasterization effects. The main table contains the separately retained 72-DPI pixel metrics. Empty predictions have undefined precision and edge distances, not zero error. `validation.json` records full mask sizes, unknown encoding, finite probabilities, accepted-winner consistency, denominator identities, valid exports and crop alignment; `evidence/html-preview-check.json` records the rendered overlay check.

Porto legend inputs are small interior swatch samples, not complete legend-panel exclusion boxes. Raw full-figure masks may therefore include legend/furniture pixels; these remain in the saved raw outputs. Porto scoring and geographic exports use the protocol’s unchanged municipal domain, not a reference-derived mask. A focused heat crop has 0/5520 accepted pixels; the Richfield 100-year full map also has no foreground. Its upstream v7 input contains only 157 candidate pixels, and maximum model foreground probability is 0.4770 (`evidence/richfield-100yr-zero-output-diagnostic.json`). These are diagnostics of this configured execution, not evidence that every LOAM configuration would behave identically.

The upstream metadata CSV appends rows on reruns. `infer.py` uses the last row for each key; initial heat preparation history is retained rather than silently deleted. `evidence/heat-auxiliary-row-selection.json` records first and selected-last rows, and `evidence/pre-inference-frame-correction.json` records the source-frame correction. Peak process-tree memory is sampled once per second; it is an observed peak, not a proof that no shorter allocation spike occurred.

An extra **unscored canonical 1024×1024 tile attempt**, fixed at Porto heat bin 0 and source origin (0,0), ran after the primary outputs were frozen/scored. It loaded the same original network and weights, then was stopped by the own-process RSS guard: own subprocess RSS exceeded 2300 MiB; sampled peak 2662 MiB, wall time 9.28 s, exit 1. No complete output was produced, and no primary settings or predictions changed. This was a deliberate shared-resource limit, not a checkpoint incompatibility or an observed allocation-error claim. See `canonical_tile_probe.py`, `evidence/canonical-tile-probe-run.json`, and its log. Full-map canonical-square/default-mode quality remains unmeasured.
