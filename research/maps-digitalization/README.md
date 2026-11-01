# Map digitization experiments — testing branch

This directory preserves the Richfield and Porto Alegre experiments, including both successful runs and blocked/negative model trials. It is a research snapshot, not an application integration or production release.

## Start here

- [Latest LOAM quality rerun](model-trials/loam-quality-20261101/report.md): mode 0, full 1024-square tiles, CUDA float32; all 11 layers plus five controls. No overall quality upgrade.
- [Latest DIGMAPPER retry](model-trials/digmapper-retry-20261101/report.md): polygon inference blocked because the actual TOPAZ implementation and checkpoint were not obtained; no accuracy score.
- [All six hazards at 10 m](outputs/porto-all-10m/REPORT.md), [metrics](outputs/porto-all-10m/benchmark.json), [comparison](outputs/porto-all-10m/comparison.html).
- [LOAM aligned overlays](model-trials/loam-quality-20261101/overlay.html), [original/current recovery overlay](overlay-10m.html).
- Earlier trials: [LOAM](model-trials/loam/report.md), [Golden-Muscat](model-trials/uiuc/report.md), [DIGMAPPER](model-trials/digmapper/report.md), [historical 250 m comparison](model-trials/COMPARISON.md).

The 10 m grid samples approximately 30 m source pixels; it does not create additional detail. At this scale our colour recovery has 63.31% broad-class correct-and-present agreement, versus 63.91% for resampled JVP. LOAM mode 0 achieves 17.33%. These are retrospective comparisons with conditional reference provenance, not surveyed accuracy or boundary-overlap scores. Earlier 250 m results remain as historical evidence and must not be substituted for 10 m results.

## Snapshot and reproduction

Code, source reports/rasters, final masks and GIS exports, overlays, review reports, configurations, logs, and provenance are included. [SNAPSHOT-MANIFEST.json](SNAPSHOT-MANIFEST.json) lists exact included bytes/hashes and exclusions. Environments, third-party checkouts/checkpoints, intermediate bitmaps, raw probability arrays and duplicate archive bundles are omitted; original reports retain pinned revisions, download locations and rerun instructions. Large files and downloaded archives are not silently substituted with model results.

The portable root recovery modules resolve paths relative to this directory. Model installation scripts and historical evidence can contain the original Windows absolute paths; follow each trial report to recreate its isolated environment and upstream dependencies, adapting those paths to this checkout. Historical artifact manifests describe the original complete local run, while SNAPSHOT-MANIFEST.json describes this Git snapshot. Text bytes are kept unchanged for hash verification except this new entry-point README.

Use the six hazard subfolders under outputs/porto-all-10m for the 24 final comparison GeoTIFFs. Updated LOAM grids are under model-trials/loam-quality-20261101/evaluation. Source document ownership and upstream licences remain with their authors; see the attribution below and individual reports.

---

## Original recovery documentation (historical 250 m stage)

# Source-first recovery: Richfield and Porto Alegre

This is a working, document-specific replacement experiment, not a universal PDF-to-GeoJSON model. Start with `REPORT.md` and `comparison.html`.

## Deliverables

| Directory | Contents | Use |
|---|---|---|
| `outputs/richfield` | Five vector layers with embedded GeoPDF registration | Preferred Richfield recovery |
| `outputs/porto-raster-source` | Six numerical raster-derived layers; cells with ≥1 valid source pixel, flagged below 15 | Preferred Porto route when these source derivatives are acceptable |
| `outputs/porto-corrected-existing` | Six existing JVP layers with corrected numeric scale | Conservative fallback; does not recover missing cells |
| `outputs/porto-experimental` | Six colour-mixing trials and missing-cell ledgers | Research only; failed coverage gates |
| `inputs` | PDFs, original delivered layers, indexed raster PNGs, bounds and provenance | Unmodified inputs; hashes in the run manifest |

GeoJSON is WGS84 longitude/latitude. Porto polygons are full 250 m aggregation squares, **not risk footprints**. Keep the source indexed PNGs and `arvc-manifest.json` for approximately 29 m raster detail. Low-support native edge cells are included and flagged; missing values never mean zero risk.

The published numerical PNGs come from the same author as the extraction under review. They are the benchmark reference, not independently authenticated original GeoTIFFs. Their ingestion has no “accuracy against itself” score.

## Reproduce locally

Python 3.13 was used. Exact library versions are in `requirements.txt`. From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -X utf8 run.py --route all
.\.venv\Scripts\python.exe -X utf8 test_recovery.py
.\.venv\Scripts\python.exe -X utf8 make_visuals.py
```

The main pipeline never calls an LLM or reads credentials. The machine-specific paid-review helper is omitted from the delivery archives and is **not needed to run recovery**. `BUDGET.json` records all paid review calls.

To rerun development selection: `python experiments/porto_candidates.py`. This only scores development and validation blocks. The chosen configuration is frozen in `SELECTION.json`; `run.py` then reports the selected configuration on test blocks and all cells. Repeating it regenerates the same evaluation, not a new unseen test. `outputs/run-manifest.json` records code, selection, input and output hashes and timestamps. The tests reject stale pipeline code or altered outputs. A partial run leaves status `running` and is not a validated delivery.

## Scope and limits

- Richfield uses named source layers, explicit colours, straight paths and the known GeoPDF CRS. Unexpected curves, opacity, page origin/crop, palette or georeference fail closed. This is a profile for these exact report pages.
- PDF fill-and-stroke shapes, holes and actual clip paths are preserved. Data geometry is exported before label halos, strokes and blended styling. No enforced nesting or smoothing is added. Rounding uses topology-preserving precision reduction and is checked for area and boundary changes.
- Richfield validation uses MuPDF rasterization of isolated commands obtained through PyMuPDF. It is independent of Shapely's fill interpretation, **not independent of PyMuPDF extraction**. Full-mask and boundary checks supplement the interior check; see the report for narrow-feature exclusions.
- OSM lakes are a positional check, not fitted controls or surveyed truth. Matching is conditional on overlap and approximate area, uses way geometries only, and tests exterior shores. Unmatched candidates and per-lake errors are retained.
- Porto tick labels and colour ramp belong to this document. The six fixed candidates are retrospective, spatially split experiments; adjacent blocks have no buffer. No source values enter the PDF reconstruction.
- The experimental inverse colour-mixing problem is ambiguous. Its intervals cover palette quantization only, not classification error or a true continuous field. It is deliberately quarantined rather than presented as reliable filled coverage. A pure-swatch unit test prompted a filter bug fix after the initial test run; settings were not reselected, and both pre-fix and corrected results are retained.
- The scale correction is `v_corrected = 0.9 * v_JVP + 0.05`: it repairs bin midpoints. Intended named classes and missing-cell counts stay unchanged; MAE and bias can improve.
- Porto reference aggregation uses unweighted valid-pixel centres. It is not area-weighted resampling. Eligibility for the primary benchmark is ≥15 valid reference pixels per cell; sensitivities at 5 and 30 are also reported.

## Source attribution

Richfield: Barr Engineering (2025), *Stormwater Model Update and Flood-Risk Area Identification and Prioritization*, archived [source PDF](https://web.archive.org/web/20260211140548id_/https://cms9files.revize.com/richfieldmn/Richfield_FloodRiskPrioritization.pdf). OSM shoreline snapshot retains its source attribution; OpenStreetMap contributors, ODbL.

Porto Alegre: WayCarbon / ICLEI and partners (2023), [ARVC report](https://prefeitura.poa.br/sites/default/files/usu_doc/sites/smamus/PMPOA23A_231116_P3_Relatorio_ARVC_V2.0_logos%20(1).pdf). Reference derivative provenance is preserved in `inputs/arvc-manifest.json`.

Original extraction and examples: [Geo-Layer-Viewer](https://github.com/joaquinOEF/Geo-Layer-Viewer) at `1767cd5dd13150b2fe589c4a0a95f0e6f67234a7`; [NBS-Project-Preparation](https://github.com/joaquinOEF/NBS-Project-Preparation) at `ab4a2eb10f4b65c7dffce79b78ceaebe4935b643`. Existing helper logic and prior audit checks informed these profiles. Source ownership and original document licences remain with their authors.
