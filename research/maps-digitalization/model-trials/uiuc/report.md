# UIUC CriticalMAAS / Golden-Muscat pretrained trial

Generated 2026-10-30T12:42:47.351487+00:00.

**Execution completed: 11/11 layers succeeded, 0 failed, 0 not attempted.** Success means installation/inference/export/evaluation completed, not an accuracy acceptance decision.

Across the six Porto hazards, exact class agreement is **66.78% on common cells** and **60.98% across all eligible cells**, with **8.69% missing predictions**. The raw denominator is 12672 correct out of 20782 eligible hazard-cells (18976 common).

**High-risk recall is 4.41% (88/1997 eligible high-risk hazard-cells).** This configuration materially under-recovers Porto high-risk classes. Exact-class averages alone conceal this failure; the confusion matrix below separates lower-class assignments from missing outputs.

Richfield inundation source-fill IoU ranges from **0.0169 to 0.2937** across the four inundation layers. Prioritization has **0.5944 macro class IoU**. The different render styles produce substantially different results; per-class precision, recall and edge errors are retained below.

These maps/blocks were previously audited and are not a blind test. Porto references are same-author numeric PNG derivatives, not independently authenticated original TIFFs. Richfield scores measure correspondence to PDF fill geometry, not independently validated flood truth. No training, paid services, Docker image, GPU allocation, or external publication was used.

## Model identity and availability

- Pipeline: https://github.com/DARPA-CRITICALMAAS/uiuc-pipeline at `9d90bc78e86c5c33b539e47cb1c79c134573c287`.
- Model: https://github.com/xiyuez2/Darpa_Unet_Release at `7f6f6450108e43df83a1db2a51b6c7b893c65f11`; the pipeline README explicitly associates this repository with Golden-Muscat.
- Checkpoint: [`jaccard_index_value=0.9229.ckpt`](https://media.githubusercontent.com/media/xiyuez2/Darpa_Unet_Release/7f6f6450108e43df83a1db2a51b6c7b893c65f11/jaccard_index_value%3D0.9229.ckpt), 372,605,901 bytes. SHA-256 `453a711c315ff456965d8bb383c07dd5b0038a3d50615b8dfe5bc55f48160973` matches the Git LFS pointer.
- Strict parameter load succeeded: 31,039,426 parameters; checkpoint epoch 33, step 31892; first convolution [64, 6, 3, 3], output convolution [2, 64, 1, 1].
- This is the public release checkpoint identified above. It has not been established byte-identical to the separately named `golden_muscat-0.3.ckpt` expected by the newer pipeline wrapper.
- Downloaded upstream files are preserved unmodified. `infer.py` imports their actual `UNet` class; it does not substitute a color classifier or another model.

## Installation, execution and CPU adaptation

A dedicated Python 3.12 virtual environment lives in `.venv`; dependencies and caches are confined to this trial directory. `requirements-lock.txt`, `versions.json`, `logs/install*.log`, and `logs/checkpoint-download.log` retain installation evidence. The required checkpoint was downloaded directly; the 13.5 GB Docker image was not downloaded.

At inspection the RTX 4070 Ti had 12,282 MiB total, 10,560 MiB used, and 1,437 MiB free. No GPU was acquired or used. The CPU run uses float32, four PyTorch intra-op threads, one inter-op thread, batch one, and channels-last memory layout. Other processes were not killed or modified.

The unmodified pipeline is CUDA-specific, and the released `SegmentationModel.test_step` explicitly calls `.cuda()`. A real attempt is recorded in `adapter-verification.json`: {'error_type': 'AssertionError', 'error': 'Torch not compiled with CUDA enabled', 'reason': 'Upstream test_step hard-codes .cuda()'}. The underlying PyTorch U-Net runs on CPU; the adapter calls this unmodified network directly and applies the pipeline decoding. Thus this is a **CPU-portability adaptation of the pretrained segmentation component**, not a successful stock full-pipeline CPU invocation.

The source-pixel check found maximum channels-last/contiguous foreground-probability difference 1.71363354e-06, with 0 binary disagreements at 0.333 for the checked patch. Five edge/padding shapes agree with upstream discard stitching. Every production source pixel was verified covered exactly once after overlap discard.

Inference runtime, summed across completed layer runs: **2757.9 seconds (46.0 minutes)**; 4,162 actual model forward calls. Evaluation: 19.3 seconds. Dependency installation: **34.01 seconds**, summing the uv-reported resolution, preparation/download, and install phases (individual phases retained in metrics). Checkpoint transfer took approximately 9 seconds according to curl. Per-layer timestamps/runtimes are in `predictions/*/run.json`. These installation stages were not measured with a single combined stopwatch.

## Frozen interface and aids

- `frozen-config.json` SHA-256: `afa1535eda43de931fa92f67f38bb02c3be1029aa0674482cd4458d63b72da79`. It was saved before real map inference/reference evaluation and is checked on every run. No thresholds or legend patches were selected using reference values.
- Each 256 x 256 map tile and its resized 256 x 256 RGB legend sample are independently divided by 255 and normalized with ImageNet mean `[0.485, 0.456, 0.406]` and standard deviation `[0.229, 0.224, 0.225]`. U-Net concatenates them to six channels. Legend crops contain the actual source swatch pixels, including rendering/compositing artifacts.
- The primary pipeline interface uses RGB map bands and tensor-bilinear legend resize. The separate old HDF5 helper writes OpenCV BGR and its test step thresholds an unnormalized foreground logit; that inconsistent standalone decoding is not used here. The selected interpretation is the pipeline softmax foreground probability and 0.333 confidence cutoff.
- Patches overlap by 64 pixels. Inner 32-pixel margins are discarded. Right/bottom black padding is sized to `256 + N*192` so the entire image is covered; this fixes the wrapper padding mismatch rather than leaving edge strips unprocessed. Whole figures/pages are inferred, including furniture and legend regions; no attractive subregion was selected.
- The highest foreground probability wins between legends; later legends win exact ties, as in the pipeline. If the winning probability is below 0.333 the output stays unknown (label 0). Raw per-legend binary masks and probabilities are saved before arbitration; overlapping-mask counts are retained. Probability archives use float16 for storage; decisions are made in float32 and authoritative label PNGs are lossless.
- Porto uses the complete native embedded figure per hazard (roughly 1213 x 1758, with flood/drought size differences). Ten source legend samples map to bin midpoints 0.05, 0.15, ..., 0.95. Cell means require >=3 predicted source pixels, with no minimum fraction rule, interpolation, numeric-reference mask, or unknown-to-zero conversion.
- Porto uses existing source tick fitting and municipality-domain assistance (`fit_ticks`/`map_domain`), grid origin `(462000, 6692000)`, EPSG:31982, 250 m cells, and the existing 3 km hash blocks. The municipal mask is applied only to grid aggregation, not to the saved full model predictions. Printed tick labels and document layout were already manually interpreted. Georeferencing is reused, not independently solved by Golden-Muscat.
- Richfield is rendered at 144 dpi (2 pixels per PDF point), with manually identified legend interiors and the embedded GeoPDF transform. The scoring domain is the entire GeoPDF map frame. The model receives the full rendered page. Source legend and coordinate assistance are disclosed; automatic legend/layout extraction was not tested.
- The upstream documentation states GPU requirement and a disabled/broken GeoPackage export. This trial saves full raw masks, georeferenced label GeoTIFFs, and Porto cell GeoJSONs using existing helpers. No claim is made about successful automatic GeoPackage vector export.

## Porto results: common 250 m contract

Classes use literal thresholds 0.2/0.4/0.6/0.8. Eligibility requires >=15 valid reference pixels. Missing predictions are unsuccessful in exact-all. Bias and MAE cover common cells only. Counts are hazard-cells, so the same spatial cell in different hazards is counted separately.

| Hazard | Eligible | Common | Correct | Missing | Exact common % | Exact all % | Bias | MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| heat | 3809 | 3515 | 2306 | 294 | 65.60 | 60.54 | -0.0255 | 0.0825 |
| flood | 1805 | 1379 | 814 | 426 | 59.03 | 45.10 | -0.1059 | 0.1230 |
| landslide | 3806 | 3531 | 2255 | 275 | 63.86 | 59.25 | -0.0395 | 0.0864 |
| drought | 3744 | 3488 | 2488 | 256 | 71.33 | 66.45 | -0.0213 | 0.0678 |
| arbovirus | 3809 | 3554 | 2556 | 255 | 71.92 | 67.10 | -0.0244 | 0.0698 |
| storm | 3809 | 3509 | 2253 | 300 | 64.21 | 59.15 | -0.0410 | 0.0886 |

| Hazard | High TP / reference high | High recall % | High TP / predicted high common | High precision % | Zero-reference / predicted | Low-reference / predicted |
|---|---:|---:|---:|---:|---:|---:|
| heat | 4/469 | 0.85 | 4/16 | 25.00 | 642/4537 (14.15%) | 380/4537 (8.38%) |
| flood | 14/371 | 3.77 | 14/18 | 77.78 | 883/2596 (34.01%) | 334/2596 (12.87%) |
| landslide | 26/405 | 6.42 | 26/61 | 42.62 | 689/4605 (14.96%) | 385/4605 (8.36%) |
| drought | 0/27 | 0.00 | 0/1 | 0.00 | 724/4574 (15.83%) | 362/4574 (7.91%) |
| arbovirus | 0/136 | 0.00 | 0/0 | undefined | 691/4644 (14.88%) | 399/4644 (8.59%) |
| storm | 44/589 | 7.47 | 44/90 | 48.89 | 642/4522 (14.20%) | 371/4522 (8.20%) |

The zero-reference/low-reference columns describe output coverage; reference absence does not independently prove a prediction false. High-risk recall uses all eligible reference-high cells, including missing predictions in its denominator. High-risk precision is restricted to comparable cells. Full per-layer development/validation/test splits, pooled counts and cell-level CSVs are in `metrics.json` and `evaluation/`; these splits are bookkeeping, not a new blind holdout.

## Richfield source fidelity

The oracle is existing direct PDF vector extraction, inverse-projected through the GeoPDF transform and rasterized at the same 2 pixels/point. Both fill (`f`) and fill-and-stroke (`fs`) paths are included through the recovered vectors. The raster prediction sees labels, line strokes, and transparency; the oracle is pre-label/stroke fill geometry. This difference is not silently removed.

| Layer/class | IoU | Precision | Recall | TP / FP / FN pixels | Symmetric edge mean / p95 (m) |
|---|---:|---:|---:|---|---|
| inundation-100yr: 100yr | 0.0169 | 0.6623 | 0.0171 | 4776 / 2435 / 275235 | 625.86 / 1202.33 |
| inundation-2yr: 2yr | 0.1611 | 0.1645 | 0.8862 | 109425 / 555616 / 14049 | 96.80 / 243.96 |
| inundation-10yr: 10yr | 0.2489 | 0.8484 | 0.2605 | 45039 / 8049 / 127867 | 235.67 / 763.48 |
| inundation-mce100: mce100 | 0.2937 | 0.4912 | 0.4220 | 147119 / 152360 / 201479 | 43.76 / 162.00 |
| prioritization-score: 0.0 - 2.4 | 0.5870 | 0.6810 | 0.8096 | 86221 / 40385 / 20272 | 76.71 / 395.00 |
| prioritization-score: 2.5 - 4.4 | 0.8192 | 0.8977 | 0.9035 | 80123 / 9127 / 8557 | 38.88 / 252.75 |
| prioritization-score: 4.5 - 6.4 | 0.6664 | 0.7100 | 0.9157 | 27263 / 11137 / 2510 | 23.29 / 110.49 |
| prioritization-score: 6.5 - 10 | 0.3049 | 0.3158 | 0.8987 | 49505 / 107279 / 5582 | 60.00 / 190.23 |

Edge errors are bidirectional distances between raster boundary pixel centers at approximately 3.81 m/pixel; means, medians, p95, maxima, directed means, and boundary sample counts are retained. These are raster source-fidelity errors and must not be confused with the much tighter vector serialization roundtrip. Prioritization also retains per-class results rather than substituting a foreground-union score.

## Porto class confusion, pooled over hazards

Rows are reference classes; columns are predicted classes plus missing predictions. Counts are hazard-cells; the last column is included in exact-all failure counts.

| Reference class | Very low | Low | Medium | High | Very high | Missing |
|---|---:|---:|---:|---:|---:|---:|
| Very low | 323 | 206 | 51 | 0 | 0 | 109 |
| Low | 182 | 3229 | 1584 | 11 | 1 | 568 |
| Medium | 121 | 2285 | 9038 | 77 | 9 | 991 |
| High | 29 | 202 | 1540 | 82 | 6 | 138 |
| Very high | 0 | 0 | 0 | 0 | 0 | 0 |

## Coverage and runtime inventory

| Layer | Page | Status | Inference seconds |
|---|---:|---|---:|
| porto-heat | 100 | succeeded | 372.0 |
| porto-flood | 85 | succeeded | 365.6 |
| porto-landslide | 93 | succeeded | 364.7 |
| porto-drought | 106 | succeeded | 405.1 |
| porto-arbovirus | 111 | succeeded | 353.7 |
| porto-storm | 117 | succeeded | 357.7 |
| richfield-inundation-100yr | 17 | succeeded | 67.1 |
| richfield-inundation-2yr | 15 | succeeded | 77.9 |
| richfield-inundation-10yr | 16 | succeeded | 69.0 |
| richfield-inundation-mce100 | 18 | succeeded | 66.3 |
| richfield-prioritization-score | 31 | succeeded | 258.7 |

## Evidence and rerun

- `overlay.html`: standalone aligned original/model controls for the existing Porto heat crop and Richfield Wood Lake crop, plus exact-all bars. `visuals/` contains the original, transparent model mask, composited overlay, and full-map overview PNGs; `alignment.json` records unchanged crop coordinates.
- `sources/<layer>/`: complete input map/page and every actual source legend crop. `predictions/<layer>/`: full label image, raw binary mask/probability per legend, confidence, overlap counts, run timestamps, and label hashes.
- `evaluation/<layer>/`: source-aligned GeoTIFFs, metric records, Porto 250 m cell GeoJSON/CSV, and Richfield vector-oracle label masks. `metrics.json` is the consolidated machine-readable result.
- `adapter-verification.json`, `checkpoint-inspection.json`, `output-verification.json`, `versions.json`, `requirements-lock.txt`, `artifacts-sha256.json`, and `logs/` preserve model, compatibility, serialized pixel/coordinate checks, installation, and inference evidence.

From PowerShell 7, with profiles disabled:

```powershell
$trial = 'C:/Users/WBW/Documents/geo-map-recovery-20261028/model-trials/uiuc'
$env:PYTHONDONTWRITEBYTECODE = '1'
& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/infer.py"
& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/evaluate.py"
& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/verify_outputs.py"
& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/visualize.py"
& "$trial/.venv/Scripts/python.exe" -X utf8 "$trial/report.py"
```

`infer.py` resumes by skipping completed layers whose config hash matches. To force recomputation, rename a completed layer directory inside this exclusive trial directory, then invoke the same command (or use `--only porto-heat porto-flood`). Keep the frozen config and source crops unchanged. `rerun.ps1` runs the stages and captures fresh logs.

To reconstruct the environment: `uv venv --python 3.12 "$trial/.venv"`, then `uv pip install --python "$trial/.venv/Scripts/python.exe" -r "$trial/requirements-lock.txt"`, with `UV_CACHE_DIR`, `TMP`, and `TEMP` set inside this trial directory. The two pinned repositories and direct checkpoint URL above are the exact upstream inputs. `prepare.py` reconstructs the source inputs/config from read-only helpers, but regenerates the freeze timestamp; do this only for a new run, not when resuming saved predictions.

## Limitations and decision

This execution establishes that the public pretrained Golden-Muscat network can be installed and run over both documents through a CPU portability adapter. It does not establish a turnkey stock pipeline, independent georeferencing, or independent hazard accuracy. Results apply to this checkpoint, RGB pipeline interface, source swatch selection, fixed cutoff, and rendering scales. Geological polygon segmentation is being transferred without fine-tuning to these risk-map styles. Low-confidence pixels remain unknown; legend ambiguity and basemap look-alikes can still produce false classifications.

Use the reported source-fidelity and literal-class results to assess suitability. Installation success and the checkpoint filename’s training-era Jaccard number are not evidence that recovered hazard values are correct on these documents. No release/production-readiness gate was supplied or asserted.
