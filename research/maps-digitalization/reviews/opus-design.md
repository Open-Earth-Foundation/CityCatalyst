# Improvement design review: Richfield vector PDF and Porto Alegre raster figures

28 October 2026. Reviewer: Claude Opus 5.5 (research consult; no production files written). Evidence root `E` = `C:/Users/WBW/AppData/Local/Temp/pdf-geojson-verification-20261028`. Inputs read: `deepdive/combined-review.md`, `deepdive/astra/priority-corrected.json`, `deepdive/astra/priority_recheck.py`, the Opus scripts and logs, and `sol/missing-diagnosis.json`. No paid calls were made and no secrets were accessed.

## 0. New finding that changes the Richfield plan

**The Richfield PDF is a GeoPDF.** Every map page has an ISO 32000 `/VP` viewport with `/Measure /Subtype /GEO`. It contains `GPTS` (NAD83 latitude/longitude corners), `LPTS` and a `NAD_1983_UTM_Zone_15N` WKT. ArcGIS wrote it, and Word preserved it when assembling the report. No previous review used it. Reproduction: `improvement-opus/geopdf_check.py` produces `geopdf-check.json`.

| Check | Result |
|---|---|
| Viewport identical on pages 8, 15–18, 31 | yes |
| Four-corner affine residual | 0.08 m |
| Scale | 7.6198 / 7.6203 m/pt (scale bar 7.620; OSM-lake fit 7.6208) |
| GeoPDF minus prior OSM-lake fit, over the frame | median 1.6 m, max 2.5 m (mean dE +0.7, dN −1.4) |
| Shoreline residual to OSM for 12 PDF lakes, **without fitting** | median 3.5 m, p90 11.6 m |
| Same lakes under the in-sample OSM fit | median 3.4 m, p90 11.5 m |

Consequence: use georeferencing from the source itself. OSM then becomes a fully held-out check, and the OSM-fit leakage problem disappears. The prior lake fit was only about 1.6 m from the source transform. This supports the earlier IoU 0.48–0.54 versus JVP placement, but those results now rest on the document's own georeferencing.

## 1. Recommendation in one paragraph

Build two deterministic pipelines and one optional, small ML variant. **Richfield:** export the PDF's own `f`/`fs` data fills using paint-order-aware, fill-rule-correct ring semantics and the embedded GeoPDF transform. Validate with an independent renderer, validity checks and held-out georeference controls, not IoU against the same vectors. **Porto:** keep native raster ingestion as a separate, labelled product that is not scored as recovery. For the PDF fallback, correct the interval encoding, calibrate the palette from the figure's own legend swatches, and unmix grey and black overprint along the grey axis. Fill occluded pixels only from pure pixels within the same 250 m cell. Emit cells only when they have real pure-pixel support, and output support and missingness reasons. Use local ML only if a tiny classifier trained on synthetic JPEG composites beats the deterministic unmixer on the development split by a pre-registered margin. LLMs, VLMs and large pretrained segmentation models offer no measurable benefit here.

## 2. Richfield: source vectors plus source georeference

### 2.1 Algorithm

1. **Provenance.** Record the PDF SHA-256 (`f4ce5c23…`), PyMuPDF/MuPDF versions, page numbers and VP `Name`. Fail if any data page lacks the shared viewport.
2. **Path selection.** Use `page.get_drawings(extended=True)` so that the clip hierarchy is known. Data is any path with `type in {'f','fs'}`, a fill colour in the layer palette and an effective clip that is the map frame. Do not hard-code `FRAME`. Legend swatches at x≈1039–1062 lie outside the frame clip and must be excluded by clipping, not by a coordinate box. Assert `fill_opacity == 1` for data fills; the only semi-transparent fills found are five black 50% paths. Assert that data items are `l`/`re`/`qu` only, or flatten `c` with a stated tolerance (§2.3).
3. **Fill-rule semantics.** Use one general method rather than per-rule special cases: node all ring edges (`shapely.node`/`unary_union` of linestrings), `polygonize` faces, compute the winding number at each face's `point_on_surface`, and keep `odd` for even-odd and `≠0` for nonzero. Cross-check with Astra's balanced XOR for even-odd paths. Areas must agree to 1e-9 relative, otherwise the path fails. Page 31 contains both `fs` data with `even_odd=True` and white `fs` label halos with `even_odd=False`. Both rules therefore occur on the same page.
4. **Paint order.** Data fills on page 31 span seqno 2072–3562. White halos (seqno 2857–4226) and road strokes are painted later. Export the **data fills before occlusion**; this is the advantage over JVP's raster difference image, which loses ground under halos and furniture. Separately compute and report the occluded area per class. If two class fills overlap, resolve it by seqno (later wins), which matches what the reader saw, and report the overlap area. Expected value: about 0.
5. **Georeference.** Affine from `LPTS`→UTM 15N (NAD83, EPSG:26915), using the MuPDF y-down conversion `y = 792 − y_pdf`, then convert to EPSG:4326. Do not fit to OSM.
6. **Serialization.** Use RFC 7946 orientation (`shapely.orient_polygons`, exterior counter-clockwise) and round to 7 decimal places. Then run `is_valid` and `make_valid` only if needed, and fail if `make_valid` changes the area by more than 1e-6 relative. Report |Δarea| before and after rounding, which must be below 0.01%. Do not enforce nesting between return periods. Report the nesting violation area as a diagnostic instead.
7. **Hashes.** SHA-256 of the PDF, of canonical sorted WKB per class at 1e-7°, and of each output file. Two runs must produce identical hashes.

### 2.2 What counts as validation (the circularity trap)

The source vectors are both the extraction and the "reference". IoU of the new output against them is about 1 by construction and **must not be reported as accuracy or improvement.** Honest checks:

- **Independent-renderer agreement.** Render the page with MuPDF at 600 dpi. Rasterize the exported geometry in page coordinates. Compare data-colour pixel classes with polygon classes, excluding pixels within 1.5 px of any edge and pixels under later-painted occluders. This tests fill-rule, clip and paint-order handling against a separate implementation. Gate: interior agreement ≥ 99.5%.
- **Georeference independence.** OSM lakes held out: median ≤ 5 m and p90 ≤ 15 m, already met at 3.5/11.6 m. Add a second independent control rather than more lakes, for example Hennepin County or MnDOT road centrelines against the PDF's `s` road strokes. Report residuals by quadrant, because lakes are clustered and corners extrapolate.
- **Geometry gates.** 0 invalid features after rounding; area conservation as above; zero exported area outside source fills (holds by construction; assert it).
- **The meaningful comparison** is old versus new: JVP output under the GeoPDF transform versus the new export. Report it as "how wrong the old output was", not "how accurate the new output is".
- **Claims allowed:** "faithful to the printed source vectors and the document's embedded georeferencing, independently checked to about 3–12 m against OSM water." **Not allowed:** surveyed flood accuracy or improved hydrology.

### 2.3 Fail and fallback conditions

| Condition | Action |
|---|---|
| VP missing or different per page; corner residual > 1 m; held-out lake median > 10 m | Fall back to an OSM-lake similarity fit using **k-fold by lake**. Report held-out **whole-shoreline** residuals; a leave-one-out centre shift is not enough. Mark output `georef=osm_fit` |
| Fallback fails (held-out median > 10 m) | Export in page coordinates only; no geographic claim |
| Renderer agreement < 99.5%, any invalid feature after rounding, unknown path operator, data fill opacity < 1, or data path under a non-frame clip | Block export and list the offending seqnos |
| Curves in data fills | Flatten to ≤ 0.01 pt (≈ 7.6 cm) and record the tolerance; currently all data items are `l` |

## 3. Porto Alegre: native raster versus PDF recovery

### 3.1 Native route (separate product, not scored)

If an official raster exists — the repository's indexed PNGs or, better, the original municipal GeoTIFFs — aggregate it directly to the 250 m grid. Label it `source=native_raster`, with hashes, bounds, nodata=255, index0 valid and value = index/254. It is the reference itself and therefore gets **no accuracy number**. Never present it as "improved extraction".

### 3.2 PDF fallback algorithm

The figures are 4:2:0-subsampled JPEGs. Pages 85/100 have layers `(1,2,2)(2,1,1)(3,1,1)`. At about 33 m/px, a 250 m cell is about 7.5×7.5 ≈ 56 px. Grey and black bairro/region lines cover 31–42% of reference pixels (Opus `porto-extra.log`). Of the missing-cell pixels, 70–72% are "other/unclassified" mixed colours (Sol). Dark ramp steps (157,13,19) and (102,0,13) mixed with dark lines fall nearer the black/grey non-data anchors. This plausibly explains the very low Alta+ recall (0–26.5%); the cause is untested.

1. **Decoding.** Pin Pillow/libjpeg-turbo and hash the decoded array. Fail if the hash changes.
2. **Georeference.** Keep JVP's tick plus boundary fit; it has no reference input. Never register to the reference, except as a reported diagnostic.
3. **Palette calibration without reference.** Sample the ten legend swatch interiors in the same JPEG (lower left of each figure). Compute a robust mean and covariance per step. Use these instead of the nominal RAMP; it includes this document's JPEG and colour-management shifts. Take non-data anchors from the "Legenda" swatches the same way.
4. **Grey-axis unmixing ("chroma/gray compositing").** For each step k, solve the 2-parameter non-negative least squares problem `pix ≈ β·R_k + γ·(1,1,1)`, with β ∈ [β_min, 1] and γ ≥ 0. This models a neutral line of unknown lightness composited over ramp colour k. Residual r_k is the distance to the plane spanned by R_k and the grey axis. A pixel is **pure-assignable** if min r_k ≤ τ (Mahalanobis with the legend covariance), β ≥ β_min, and the best k beats the runner-up by margin m. Green park and water anchors remain hard non-data and are never unmixed. Their pixels get the reason `occluded_by_overlay`.
5. **Soft posterior (optional C4).** `p(k|pix) ∝ exp(−r_k²/2σ²)` over the k passing β ≥ β_min. The pixel contributes E[k] and its entropy. Adjacent pale steps are intrinsically ambiguous once white mixing is allowed. The posterior expresses that instead of hiding it.
6. **Same-cell neighbour support.** A pixel that is still unassigned and within r px of pure-assignable pixels *in the same cell* inherits their median bin. Maximum r = 2 px, roughly line half-width plus JPEG ringing. This is thin-occluder inpainting. **Never fill across cell boundaries and never create a cell without its own pure pixels.**
7. **Interval-correct encoding.** Step k means the interval [0.1k, 0.1k+0.1); the closed top bin is [0.9, 1.0]. Emit per cell:
   - `value_mid` = mean of 0.1k+0.05;
   - `value_lo`/`value_hi` = means of interval bounds;
   - a 10-bin histogram;
   - `class` = official 0.2 boundaries applied to `value_mid`;
   - `support_pure_frac`, `imputed_frac`, `occluded_overlay_frac`;
   - `missing_reason` ∈ {`no_pure_support`, `overlay_occluded`, `outside_boundary`, `nao_se_aplica`}.

   Take breaks from the printed legend and QML text, not from the reference-derived `porto-breaks.json`.
8. **Emission rule.** Emit a cell if `n_pure ≥ N_min` (pure, not imputed, pixels), with N_min ∈ {5, 8}, and `(n_pure + n_imputed)/n_cell ≥ A_min`, with A_min = 0.25 of in-boundary cell pixels. Use an area fraction rather than JVP's absolute 15 recognised pixels. Otherwise output the cell as explicitly missing with a reason. Do not output 0.

### 3.3 Candidate set (7 configurations, fixed before any scoring)

| ID | Description | Purpose |
|---|---|---|
| C0 | JVP reproduction (pinned Pillow) | Control; must reproduce shipped values exactly |
| C1 | C0 + interval-midpoint value + official 0.2 classes | Isolates the gain from the scale fix alone |
| C2 | C1 + legend-calibrated palette + grey-axis unmixing, hard argmin, β_min=0.5, no fill | Isolates the gain from unmixing |
| C3a | C2 + same-cell fill r=2, N_min=8, A_min=0.25 | Main candidate |
| C3b | C2 + same-cell fill r=1, β_min=0.35, N_min=5 | Looser sensitivity setting |
| C4 | C3a with soft posterior (E[k]) | Value-estimation variant |
| C5 | C3a with pixel assignment by a tiny classifier (HistGradientBoosting or logistic on a 3×3 RGB patch, 27 features) trained **only on synthetic composites**. Legend-swatch colours are rasterized under random line masks with α ∈ [0, 1] and greys 60–255. They are encoded with **this PDF's own quantization tables and 4:2:0 subsampling** and decoded with the pinned decoder | The only ML; no reference labels |

τ, σ and m are set from legend-swatch statistics and synthetic composites before any reference scoring. No supervised-on-reference model is included. If someone insists on one, it is a diagnostic upper bound, trained on development blocks only and never eligible to ship.

### 3.4 Split (honest about prior exposure)

All six hazards were already analysed against the reference. **There is no pristine blind test.** Call it a "post-audit spatially held-out evaluation".

- **Spatial blocks:** 10×10-cell (2.5 km) blocks on the fixed grid, assigned to folds A and B by checkerboard. Remove one cell ring at each A/B interface from scoring. Neighbour fill is within-cell, so there is no fill leakage across blocks.
- **Development:** fold A × {landslide, heat, storm}.
- **Test:** fold B × all six hazards. Report the double-held-out subset separately: fold B × {flood, drought, arbovirus}. Flood is the stress case. Drought has only 27 Alta+ reference cells, so report Wilson CIs and draw no conclusion from it.
- **Procedure:** run C0–C5 on development; choose by the primary metric subject to the guards; ties go to the simpler configuration. Write `frozen-config.json` and record its SHA-256 **before** the single test run. Do not iterate after the test. If the test fails gates, report the failure.
- **Statement:** results apply to these six figures from one PDF and one renderer. They do not show generalisation to other cities, map styles or JPEG pipelines.

### 3.5 Metrics and gates (same definitions as the combined review)

Reference eligibility: ≥ 15 valid indexed-PNG pixels per cell (fixed); also report sensitivity at 1, 30 and 50. Classes are intended labels (official bins on both sides; the corrected value is binned officially). All gates compare with C0 on **the same test cells**.

| Metric | Baseline (all cells, combined review) | Gate on the test fold |
|---|---|---|
| Correct and present / all eligible, equal-hazard mean | 59.3% | ≥ C0 + 8 pp; no hazard below C0 − 1 pp |
| Missing among eligible | 21.6% | ≤ 10% |
| Exact class on common cells | 75.1% | ≥ C0 − 1 pp; fill must not buy coverage with wrong labels |
| MAE vs reference cell mean | .071 (raw) | ≤ C1's MAE − .005. C1 already absorbs the scale fix; only gains beyond C1 count as recovery |
| Interval coverage: reference mean within [value_lo − .02, value_hi + .02] | n/a | ≥ 85%. Tests the honesty of the interval encoding |
| Alta+ recall over all eligible (per hazard, with Wilson 95% CI) | 0–26.5% | Equal-hazard mean ≥ C0 + 10 pp, with Alta+ precision ≥ 70% |
| **False coverage A:** emitted cells with no reference support (0 valid pixels, inside the boundary) | measure C0 | ≤ C0 + 0.5 pp of emitted cells |
| **False coverage B:** emitted cells whose reference support is 1–14 pixels (ineligible) | measure C0 | Report; must not exceed C0 + 2 pp |
| Fabrication check: emitted cells with n_pure < N_min | — | 0 (construction assert) |
| Quantization floor: reference pixels binned to 0.1, then midpoints averaged per cell | diagnostic | Report MAE alongside; an estimate cannot beat its own bin floor |

**Fail/fallback for Porto.** If C3a, C4 or C5 fail the coverage or false-coverage gates on the test fold, ship **C1** with missingness reasons and support fractions. Never ship cross-cell interpolation. If development gains do not appear on the test fold, report non-generalisation explicitly. If the decoder hash changes, stop.

## 4. Leakage and over-claiming traps, checked

1. **Richfield circularity.** Source vectors are the extraction. Score them with renderer, validity and georeference checks only. Old versus new means "error of the old output".
2. **OSM fit evaluated on OSM.** Resolved by the GeoPDF. In the fallback, use held-out lakes with whole-shoreline residuals and a second independent control. A leave-one-out centre shift measures stability, not error.
3. **Reference-derived Porto breaks.** `porto-breaks.json` came from the reference. Use the printed legend and QML as the rule.
4. **Registration to the reference.** Diagnostic only; never feed it back into the pipeline.
5. **Parameter search on the scored data.** ≤ 7 configurations; parameters calibrated from the legend and synthetic data; one frozen test run.
6. **Spatial autocorrelation.** Random cell splits would leak; use 2.5 km blocks with buffers.
7. **Credit misattribution.** The scale fix (C1) is a contract correction, not extraction recovery. Report ablations C0 → C1 → C2 → C3.
8. **Coverage bought with fabrication.** False coverage A and B plus the n_pure assert. Missing cells remain missing with a reason.
9. **Eligibility choice.** Fix it at 15 pixels before the test and publish sensitivity.
10. **Prior exposure.** No "blind test" language. Results are benchmark-specific.

## 5. Should local ML or LLMs be used?

- **Small local ML:** only C5, a tens-of-kilobytes model trained on synthetic JPEG composites from the document's own legend and quantization tables. It is worth one slot because JPEG chroma subsampling makes 3×3 context informative in a way a per-pixel colour rule cannot capture. Adopt it only if it beats C3a on development by ≥ 2 pp in correct-and-present with no false-coverage increase. Otherwise prefer the deterministic method.
- **Large pretrained segmentation (SAM-type, U-Nets):** no. The problem is per-pixel palette unmixing on flat-colour cartography, not object segmentation. The supervision would have to come from the reference, which is the leakage this design avoids.
- **LLMs/VLMs:** no role in values or geometry. Legend text and breaks can be read deterministically, and a VLM adds unverifiable error. At most, use one to *draft* a human-reviewed legend transcription for new documents. It is not needed for these two.

## 6. Minimal toolkit layout (for the parent's `geo-map-recovery-20261028`)

```
geo-map-recovery-20261028/
  pyproject.toml / uv.lock      # pin pymupdf, pillow, shapely>=2, pyproj, numpy, scikit-learn (C5 only)
  richfield_vectors.py          # §2: select → winding faces → GeoPDF → GeoJSON + hashes
  porto_raster.py               # §3.2: decode → calibrate legend → unmix → same-cell fill → grid
  native_raster.py              # §3.1, labelled native, unscored
  evaluate.py                   # metrics/gates/splits; reads frozen-config.json; refuses a second test run
  tests/test_selfcheck.py       # fill-rule toy cases (nested even-odd, self-intersecting nonzero),
                                # unmix round-trip on synthetic mixes, C0 exact reproduction
```

Copy input data in with hashes rather than reading from the evidence root. `evaluate.py` should write the test-run record, which locks the configuration hash, and refuse to run the test again.

## 7. Expectations, not results

Richfield should reach renderer agreement of about 99.5% or better and 0 invalid features. Its geographic error is bounded by the document's own georeferencing, which agrees with OSM to about 3.5 m median and 12 m p90. It will not reveal anything about flood truth.

For Porto, I expect most of the coverage gain to come from unmixing and same-cell fill, because about 70% of missing-cell pixels are mixed colours. The scale fix should reduce bias. Within-bin information is unrecoverable, so MAE will not fall below the quantization floor. Alta+ recall should improve the most if the dark-step and dark-line confusion is the cause, but that is a hypothesis for the development fold to test. These are predictions to be falsified, not measured outcomes.
