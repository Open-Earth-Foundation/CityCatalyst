# DIGMAPPER retry — 2026-11-01

**Result: blocked before polygon inference.** Fresh public-release checks, artifact downloads, container inspection, and a real launcher execution did not yield the paper's TOPAZ polygon model. No TOPAZ checkpoint was loaded, no pretrained forward pass ran, and none of the 11 layers has a prediction. Accuracy, missing-prediction rate, incorrect-prediction rate, and unsupported-reference coverage are **null**, not zero. There are no new masks or overlays because inference did not complete.

Work is confined to `model-trials/digmapper-retry-20261101`. The earlier DIGMAPPER report and evidence were read before these checks. The 250 m scoring in the old protocol/report is superseded by the unchanged `benchmark_10m_all.py` contract. No LOAM run is counted as DIGMAPPER.

## Fresh findings and actual execution

The evidence contains **100 fresh ordinary HTTP GET probes**: 87 returned 200, 8 returned 404, 3 returned 401, and 2 returned 403. Each has its URL, UTC timestamp, status, complete response body, byte count, and SHA-256 in [the HTTP index](evidence/http-index.json). Docker registry manifest/configuration and application-layer checks are recorded separately in that index. Authentication tokens used for anonymous public-registry reads were kept only in memory.

| Candidate | Current evidence and result |
|---|---|
| Official paper and latest version | arXiv abstract, latest HTML, and API returned 200; the API still identifies `2506.16006v1`, dated 2025-06-19. An author page links the published ACM DOI `10.1145/3748636.3764602`, confirmed by Crossref. ACM HTML and PDF both returned 403, so the final published text/supplements were not verified. |
| Author `knowledge-computing/CriticalMAAS_AIM` | Metadata returned 200 with size 0. Contents returned 404; branches, releases, and deployments each returned an empty list. A fresh `git ls-remote` exited 0 with no refs. No full-system code or image names were obtained here. |
| Newly investigated Windows release | Downloaded the public `cxp114/criticalmaas-uncharted-ta1` v0.1.0 ZIP, **7,480,718 bytes**, SHA-256 `94c02406b4c908d073336f7e86997e1115bd0c88d74bd6c3cf31543b19762382`, matching GitHub's asset digest. Its 307 archive entries include no `.pth`, `.pt`, `.ckpt`, `.safetensors`, or `.onnx` file. Cloned and inspected source revision `d346eb549f2d91139cc78594eee30a05ae7afb23`. Executed its actual source launcher: `list` exited 0 and listed layout segmentation, metadata, points, georeferencing, and text; `pipeline topaz` exited 2 as an invalid target. This is a launcher capability check, **not polygon inference or a layout startup**. The source tree remains clean. |
| Author `Fandel-Lin/poly_itemseg_update` | Complete, untruncated 938-entry tree at `67bb6ab710fa88b630dc403e46abf85bcbbf99e8`. Downloaded and inspected its system configuration/main/README and polygon README/model/handler. Its polygon component explicitly names **LOAM**. Some point checkpoints are present, but they do not provide TOPAZ. This older author system was not renamed or run as DIGMAPPER. |
| Public Linux `jterstriep/topaz:0.2.5` | This was a plausible name match worth checking. Retrieved its public manifest and configuration, then downloaded only its **65,602,698-byte application layer** and verified digest `3e6a918752ba84608894d0b36aba553d857833c6298b4106514f6123c6148b98`. The contained README and setup.py identify **`tbepler/topaz`, package `topaz-em` 0.2.5, for cryo-electron microscopy**. It is unrelated to map TOPAZ. The full 7.35 GB image was not pulled or executed. |
| LARA layout release | Official upstream HEAD is still `7a50dc0cecde38b6c5db9c8f7d01b3e628bcf8b9`. The fresh workflow still names the `pantera-file-test` layout bundle. Actual GETs for `config.yaml`, `config.json`, and `model_final.pth`, plus the global weight endpoint, returned **404 `NoSuchBucket`**. Docker Hub tags returned 404; actual `docker manifest inspect uncharted/lara-segmentation:latest` exited 1 with denied/unauthorized. This does not distinguish a private image from a nonexistent one. The old Windows Detectron2 build was not repeated. |
| Hugging Face / registries | Exact DIGMAPPER model/space and CriticalMAAS-model searches returned empty results. TOPAZ results did not establish a release linked to this paper/authors; the examined Scitomo TOPAZ card explicitly describes cryo-EM denoising. Docker Hub DIGMAPPER search was empty; both TOPAZ search pages, public InferLink/knowledgecomputing namespaces, CriticalMAAS/MapSense searches, and Quay queries were checked. Anonymous GitHub Packages enumeration returned 401: **private/authenticated registry availability remains unknown**. |

The author/org checks included Knowledge Computing, InferLink, all three pages of USC ISI I2 repositories, DARPA CriticalMAAS, and author repositories linked from project pages. Related public deploy assets, the CriticalMAAS project site, author publication pages, TA1 evaluation/CDR-example trees, and InferLink's MapSense page were examined. Additional author candidates included PolyDETR/S-PolyDETR, DOVETAIL, and GLYPH; no evidence established them as the requested TOPAZ release. The [availability summary](evidence/availability-summary.json) and saved bodies preserve the bounded basis for these decisions. This is **not proof that no private or differently named TOPAZ release exists**.

Primary links: [DIGMAPPER preprint](https://arxiv.org/html/2506.16006v1), [published DOI](https://doi.org/10.1145/3748636.3764602), [author AIM](https://github.com/knowledge-computing/CriticalMAAS_AIM), [Windows release](https://github.com/cxp114/criticalmaas-uncharted-ta1/releases/tag/v0.1.0), [author polygon implementation](https://github.com/Fandel-Lin/poly_itemseg_update/tree/67bb6ab710fa88b630dc403e46abf85bcbbf99e8/polygon), [layout build workflow](https://github.com/DARPA-CRITICALMAAS/uncharted-ta1/blob/7a50dc0cecde38b6c5db9c8f7d01b3e628bcf8b9/.github/workflows/build_containers.yml).

## Coverage and source readiness

All 11 complete source images were loaded sequentially and compared pixel-for-pixel with fresh extraction/rendering from the original PDFs. Existing source-image SHA-256 hashes also matched. Porto uses the complete largest embedded map raster and printed-tick transform; Richfield uses the complete page at 144 DPI and its GeoPDF transform. The first three validations were heat, flood, and Richfield 100-year, in that order. [Input readiness](evidence/input-readiness.json) records dimensions, pages, transforms, source hashes, and existing manual legend aids. These checks are source preparation, **not model inference**.

| Layer | PDF page, 1-based | Source validation | Polygon execution / scoring |
|---|---:|---|---|
| porto-heat | 100 | passed | not attempted; TOPAZ unavailable; null |
| porto-flood | 85 | passed | not attempted; TOPAZ unavailable; null |
| richfield-inundation-100yr | 17 | passed | not attempted; TOPAZ unavailable; null |
| porto-landslide | 93 | passed | not attempted; TOPAZ unavailable; null |
| porto-drought | 106 | passed | not attempted; TOPAZ unavailable; null |
| porto-arbovirus | 111 | passed | not attempted; TOPAZ unavailable; null |
| porto-storm | 117 | passed | not attempted; TOPAZ unavailable; null |
| richfield-inundation-2yr | 15 | passed | not attempted; TOPAZ unavailable; null |
| richfield-inundation-10yr | 16 | passed | not attempted; TOPAZ unavailable; null |
| richfield-inundation-mce100 | 18 | passed | not attempted; TOPAZ unavailable; null |
| richfield-prioritization-score | 31 | passed | not attempted; TOPAZ unavailable; null |

No current layout, legend, line, point, or georeferencing inference is claimed. The prior offline legend preparation and prior Detectron2/LDTR failures remain historical evidence only. There were **zero paid API calls**, zero source uploads, and no contacts. Source-only manual legend/layout/georeferencing aids could support a clearly disclosed TOPAZ-only test, but no TOPAZ executable/checkpoint was available to receive them.

## Preserved evaluation contract

The scorer's SHA-256 is `0971db0d66b165c6de551461e2dc95af1e44ced0e151a7465e890cb257ac7a15`, matching the existing benchmark's recorded hash. The saved [evaluation configuration](configs/evaluation-contract.json) retains:

- 10 m cell centres; 4200 rows × 3800 columns; origin `(462000,6692000)`; EPSG:31982.
- The existing native reference pixel covering each centre, reference validity `!=255`, and no 250 m averaging or former 15-pixel threshold.
- The same physical 3 km test blocks and SHA-256 selection rule; 38 selected blocks in the 14 × 13 block table. This is retrospective, not a new blind split.
- Prediction bins 0–9, midpoint `(step+0.5)/10`, unknown `-1`, and five-class boundaries 0.2/0.4/0.6/0.8.
- Separate **missing** eligible predictions, **incorrect** common-cell classes, and **predictions without supported reference**. Unsupported reference does not by itself mean incorrect prediction.

The native pixels are approximately 30 m and vary by map. Sampling every 10 m adds no source information and creates correlated samples. Reference PNGs are same-author numerical derivatives, **not independently authenticated original TIFFs**. Their bytes were hashed for preservation; numeric reference values were not decoded, fed to a model, or used for tuning.

A synthetic-only test executed the **unchanged `scores()` function** and verified missing, incorrect, unsupported-reference, confusion, and high-risk denominator behavior. The first attempt to import the full module failed because the read-only source interpreter lacks `rasterio`; the corrected harness extracts only `scores()` with Python AST, avoiding an unnecessary installation. Both logs are retained. This validates arithmetic on a tiny synthetic fixture, **not actual accuracy, GeoTIFF export, or a completed benchmark run**.

The supplied common 10 m script implements **Porto** scoring. Richfield's existing reference is direct PDF fill geometry, including `f` and `fs` paths, for source-fidelity IoU/precision/recall and edge errors. No new Richfield scoring adapter or numerical result was fabricated while the polygon model was absent. Any eventual 10 m Richfield export must preserve its source transform and distinguish raster sampling from vector source-fidelity metrics.

No decoder, model resizing policy, overlap arbitration, or support threshold was invented without TOPAZ's actual interface. In a completed run, missing predictions would reduce `exact_all`; in this blocked pre-inference run, all real-data counts/rates/denominators remain null. The separate execution counter of zero evaluated cells means **nothing was evaluated**, not zero eligible reference cells.

## Resources, reproducibility, and prerequisites

PowerShell **7.6.9**, non-login, and its actual executable path were verified. Discovery used Python 3.14.7; PDF/source validation used the existing interpreter read-only with bytecode writing disabled. Initial free memory was approximately **3.59 GiB host RAM** and **10,467 MiB GPU RAM out of 12,282 MiB**. Docker's Linux daemon and running WSL2 distributions were verified. No dependencies were installed, host features changed, services started, or other processes killed.

**No GPU was used and no GPU lock was acquired.** There is no owned lock to release. GPU capacity remains available for the separate LOAM work.

[metrics.json](metrics.json) holds all per-layer statuses and null metrics; [commands.ps1](commands.ps1) exposes exact executed command records, artifact verification, and a fresh HTTP recheck that preserves existing evidence. Scripts, configurations, logs, downloaded release bytes, container application bytes, inventories, and hashes are retained here. `artifact-hashes.json` covers trial files excluding its own hash and Git's internal database. [Source preservation](evidence/source-preservation.json) verifies **102 pre-existing files unchanged**, including shared inputs, helpers, the 10 m scorer/benchmark, prior reports/metrics, and prior DIGMAPPER evidence/prepared inputs.

From this directory, artifact verification is:

```powershell
.\commands.ps1 -Phase Verify
```

To print the exact recorded argv/cwd/exit-code/timing records, use `-Phase Commands`; to repeat the public availability probes into new timestamped files under this same directory, use `-Phase Reprobe`. The launcher check can be repeated without installing dependencies:

```powershell
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONPATH = Join-Path $PWD 'upstream\windows-launcher'
python -X utf8 -B -m criticalmaas_launcher.cli list
python -X utf8 -B -m criticalmaas_launcher.cli pipeline topaz
```

The second command's observed exit 2 is a deliberately tested unsupported target, not an inference failure on a map. There is no valid TOPAZ inference command to publish from the assets obtained.

**Minimum unblocker:** exact TOPAZ inference code plus trained checkpoint/configuration, or an identified accessible DIGMAPPER/TOPAZ container containing those artifacts and its input/output contract. For a TOPAZ-only comparison, allowed source-derived manual aids can bypass missing layout/legend/georeferencing stages. Full DIGMAPPER additionally needs its module images/Luigi workflow, compatible layout model bundle, and permitted legend/georeferencing access. If these assets are private, access to the identified release is needed; an API key alone would not supply the missing polygon model. Freeze its real decoding/mask policy before evaluating, then run heat, flood, Richfield 100-year, and the remaining eight layers with full masks and aligned focused overlays.
