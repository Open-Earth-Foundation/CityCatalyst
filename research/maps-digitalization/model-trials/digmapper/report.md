# DIGMAPPER trial: blocked full system

Test date: 2026-10-30. Scope: JVP's six Porto Alegre hazards and five Richfield layers. **No full-system inference completed, no pretrained checkpoint was loaded, and no mask or GIS prediction was produced. Accuracy metrics are null, not zero or an invented score.** No LOAM run was performed or counted as DIGMAPPER success.

## What was actually executed

Created an isolated Python 3.11.15 environment in this directory and installed PyTorch 2.0.1 / torchvision 0.15.2. Cloned and inspected official linked/author code before executing it. Attempted the LARA layout installation four times, resolving a missing build dependency, interpreter mismatch, and Git path-length issue; the final attempt reached native C++ compilation and failed. Loaded full source images and attempted the local layout detector on Porto heat, Porto flood, and Richfield 100-year inundation, in that order. All three stopped at the unavailable Detectron2 import. These are component startup failures, not completed inference runs.

Installed the authors' released legend package, ran its actual `prepare()` implementation on **all 11 source layers**, and verified the resulting artifact bundles. Ran its `infer(..., dry_run=True)` on Porto flood and Richfield 100-year with five manually boxed printed heat-legend examples. It saved prompts and input snapshots; it made **zero model calls**. This tests preparation and serialization only. No accuracy is claimed for the five-example configuration or for DIGMAPPER's 15-example method.

Cloned LDTR, downloaded its public thrust-fault configuration, requested its published checkpoint, and attempted to build its required extension in CPU mode. The extension raised `NotImplementedError: Cuda is not availabel`. The weight URL returned an HTML download confirmation offering a 934M checkpoint; it did not return model bytes. The full checkpoint transfer was not pursued after the extension failed. No fault-line inference was run, and fault lines would not supply the requested flood/risk polygon masks.

## Release identity and precise blockers

The [paper](https://arxiv.org/html/2506.16006v1) describes LayoutLMv3 layout segmentation, GPT-4o legend interpretation, **TOPAZ polygon extraction**, LDTR line extraction, point detection, and text/visual georeferencing, wrapped in Docker modules with Luigi orchestration. TOPAZ is the relevant polygon model. Running LOAM or another segmenter would not reproduce this system.

| Component | Primary source and pinned revision | Observed availability |
|---|---|---|
| Full DIGMAPPER/AIM workflow | [Author AIM repository](https://github.com/knowledge-computing/CriticalMAAS_AIM) | Actual clone reports an empty repository; no revision, Docker modules, Luigi DAG, or system runner obtained. |
| LayoutLMv3 | [Paper-linked LARA repository](https://github.com/DARPA-CRITICALMAAS/uncharted-ta1/tree/7a50dc0cecde38b6c5db9c8f7d01b3e628bcf8b9) | Code downloaded; required map-specific `config.yaml`, `config.json`, and `model_final.pth` not obtained. |
| Legend ICL | [Author release](https://github.com/knowledge-computing/criticalmaas-legend-detection/tree/a12e9603c3ea0ee8d4eb8fc53a326e37be53c930) | Installed and offline functions tested. Real prediction requires GPT-4o; paid API calls excluded. This is a related author release, not a recovered full-system package. |
| TOPAZ | [Paper section 2.2](https://arxiv.org/html/2506.16006v1#S2.SS2) | No official runnable implementation or checkpoint located. Public author/org listings and TOPAZ search evidence retained. |
| LDTR | [Author release](https://github.com/knowledge-computing/LDTR/tree/eaf5c9f3e66ca0181ea98fe4378420107b8af296) | Code and configuration downloaded. Public checkpoint offered; CPU extension build failed. |
| Georeferencing and point extraction integration | [Author project](https://sofiakirsanova.github.io/projects/criticalmaas/), [MapLocator](https://github.com/knowledge-computing/MapLocator), [point-data generator](https://github.com/knowledge-computing/criticalmaas-TA1-synthmap-points) | Related demonstration/generator sources located; no verified complete DIGMAPPER deployment, georeferencing integration, or paper-specific point checkpoint obtained. |

The [pinned LARA workflow](https://github.com/DARPA-CRITICALMAAS/uncharted-ta1/blob/7a50dc0cecde38b6c5db9c8f7d01b3e628bcf8b9/.github/workflows/build_containers.yml) names `s3://pantera-file-test/lara/segmentation/layoutlmv3_20240925` and AWS secrets. Actual anonymous GETs for all three required files returned **HTTP 404 `NoSuchBucket`**, including a second global-endpoint weight request. This is the current observed response, not a claim that the URL presently returns access denied. Responses, URLs, and SHA-256 hashes are in `evidence/release-probes.json` and `evidence/component-probes.json`.

GitHub releases for the linked repository were empty. The advertised container `uncharted/lara-segmentation:latest` returned **`denied: requested access to the resource is denied` / `unauthorized: authentication required`** to `docker manifest inspect`. Docker itself was available (29.9.2), so an unavailable daemon is not the reason for stopping. No image was pulled, service started, or host configuration changed.

The final Detectron2 build used upstream-pinned commit `a59f05630a8f205756064244bf5beb8661f96180` and failed with **`fatal error C1083: Cannot open compiler generated file: '': Invalid argument`**, followed by compiler exit 1. Earlier recoverable errors and the final failure remain in the logs. Installing Python package metadata with `--no-deps` afterwards did not make the detector runnable; the actual priority-map attempts all report **`ModuleNotFoundError: No module named 'detectron2'`**. Solving compilation alone would still leave the layout checkpoint and TOPAZ/system release missing.

Search covered the paper's links, the authors' project pages, InferLink and Knowledge Computing public repositories, the CriticalMAAS organization, GitHub repository/release/issue endpoints, Hugging Face exact-name searches, the documented S3 source, and the documented container. The [InferLink MapSense page](https://www.inferlink.com/mapsense) offers a pilot service, not a public DIGMAPPER download in the examined material. No contact was made. Negative release findings are bounded to these sources and this date.

## Coverage

Every row has successful source and offline legend preparation. `failed` below means the named layout component was launched and failed before model loading. `not_attempted` means no additional detector launch after the same blockers were established. **Full-system status is blocked for all 11 rows.**

| Layer | PDF page (1-based) | Pretrained component status | Reason |
|---|---:|---|---|
| porto-heat | 100 | failed | Detector import failed |
| porto-flood | 85 | failed | Detector import failed |
| porto-landslide | 93 | not_attempted | Shared setup blockers; no additional launch |
| porto-drought | 106 | not_attempted | Shared setup blockers; no additional launch |
| porto-arbovirus | 111 | not_attempted | Shared setup blockers; no additional launch |
| porto-storm | 117 | not_attempted | Shared setup blockers; no additional launch |
| richfield-inundation-100yr | 17 | failed | Detector import failed |
| richfield-inundation-2yr | 15 | not_attempted | Shared setup blockers; no additional launch |
| richfield-inundation-10yr | 16 | not_attempted | Shared setup blockers; no additional launch |
| richfield-inundation-mce100 | 18 | not_attempted | Shared setup blockers; no additional launch |
| richfield-prioritization-score | 31 | not_attempted | Shared setup blockers; no additional launch |

## Inputs, aids, and evaluation limits

Porto input is the full largest embedded map image from each prescribed page, at native resolution (heat 1213 x 1758; flood 1155 x 1668). Selecting that embedded figure is a source-derived layout aid. Richfield input is each complete prescribed page rendered at 144 DPI (2448 x 1584). Sequential preparation avoided concurrent large page jobs. Manual source-legend crops and the five hand-boxed heat-legend examples are recorded explicitly in `inputs/manifest.json` and `inputs/heat-legend-example-manual.json`. They are not model detections.

Source-derived Porto printed-tick transforms and Richfield GeoPDF transforms were retained for alignment. They were not counted as independent model georeferencing. The Porto heat fragment exactly follows `make_fine_overlay.py` (cell 21547, 3000 x 1750 m extent), and the Richfield Wood Lake fragment follows `make_visuals.py` (PDF rectangle 280,285,600,465; 3 pixels/point). `overlay.html` displays those originals and explicitly marks the model overlay unavailable. No fabricated or all-zero mask is provided.

The layout confidence threshold was fixed at the upstream default 0.25 before startup attempts; CPU mode and full images were fixed. No polygon decoder, support threshold, or overlap arbitration was invented because the TOPAZ model and its outputs were unavailable. No numeric reference rasters, benchmark values, training labels, or reference geometry were used for inference or tuning. These previously audited examples are not a blind test.

The specified Porto comparison would use the common 250 m grid, origin (462000,6692000), 152 columns, 3 km hash blocks, >=15 valid reference pixels/cell, legend-bin midpoint values and class thresholds 0.2/0.4/0.6/0.8. Missing model predictions would count unsuccessful in `exact_all` for a completed inference trial. Here, inference never ran, so exact/common/all, missing, bias/MAE, high-risk recall/precision, zero/low-reference coverage, and their eligible denominators are **null / not evaluated**. Zero evaluated cells is recorded separately; null does not mean zero risk or zero eligible cells.

Richfield IoU, precision/recall, and edge-error metrics are likewise null. The intended comparison is against existing direct PDF vectors including both `f` and `fs` fill paths in document/GeoPDF coordinates, rather than rendered text/stroke pixels. That is source-fidelity, not independently validated flood truth. No reference scoring was performed without predicted geometry.

## Runtime, environment, and reproducibility

Recorded runtimes: PyTorch install 30.646 s; final layout build 30.922 s; legend package install 5.344 s; LDTR CPU extension attempt 4.485 s; three layout startups 34.829 s combined; all offline legend preparation and prompt packaging 1.922 s. These are setup/startup times, **not model inference performance**. No GPU was used or locked. CPU thread limit was two.

Run from this directory with PowerShell 7 non-login. `commands.ps1` contains commands grouped by discovery, installation, source preparation, component attempts, and reporting. It deliberately requires selecting a phase; it does not launch paid inference. `scripts/run_logged.py` records argv, working directory, UTC time, exit code, timeout, and stdout/stderr. Use `python -X utf8` throughout. The pre-existing Python interpreter is used only to read/render source PDFs and helpers, with bytecode writing disabled; it was not modified. All installs are inside this trial directory.

`evidence/versions.json`, package freeze, pinned cloned repositories, HTTP responses, and `artifact-hashes.json` identify the exact artifacts. Model-weight hashes are null because no checkpoint bytes were obtained; the LDTR HTML warning is never identified as a model. Both original PDF hashes were checked unchanged. The three downloaded nonempty upstream checkouts remain clean.

To unblock full-system evaluation requires the actual DIGMAPPER module images and Luigi workflow, TOPAZ inference implementation and trained checkpoint/configuration, an accessible compatible map-layout checkpoint bundle, and a permitted way to execute its legend/georeferencing stages. This report does not treat available generic backbone weights, LOAM, offline preparation, or published paper scores as substitutes.
