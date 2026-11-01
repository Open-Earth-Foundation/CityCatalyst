# Implementation review: Richfield / Porto recovery

## Verdict

The design is sound and the disclosures are mostly honest. **Do not deliver yet.** Neither evidence file was produced by the code shown, and the Richfield check has a ~5 m blind spot. Fix the P1 items, regenerate, then deliver the four-tier package described at the end.

---

## P1: blocking

### 1. Both evidence files are stale or hand-edited. Do not cite them.

**`outputs/richfield/validation.json` cannot come from the current `richfield.py`:**
- The four inundation layers show `rendered_colour_interior_pixels: 0` and `0.0%`. Current `render_check` raises below 99.5%, so it would have aborted.
- Prioritization `source_interior_visible_as_exact_colour_pct` is 84–90%. That would also raise.
- The `limitation` string differs from the one `run()` writes.

This is the old zero-result file you warned about. It must be treated as non-evidence.

**`outputs/porto-benchmark.json` does not match `run.py` either:**
- The code writes `hazards → comparisons`, `selection_sha256` and `reference_warning` at the top, plus `eligibility_sensitivity_test`.
- The file has `test_per_hazard` and no `hazards` or `selection_sha256`.

So the 63.22 → 79.71 figures are not traceable to this source.

**Fix:**
- Delete both files and rerun `python run.py --route all` in a clean `outputs/`.
- Write a run manifest containing: git hash or sha256 of each `.py` file, `SELECTION.json` hash, input hashes, and start/end timestamps.
- Have `test_all_delivered_geometry` assert that each artifact's recorded code hash equals the current file hashes. At present the test passes on stale files.

### 2. The Richfield gate cannot detect offsets up to about 5 m.

- The source interior is `buffer(-2/3 pt)` and the MuPDF interior is eroded by 2 px (also 2/3 pt).
- At 7.62 m/pt, that is about 5.1 m per side.
- A systematic shift or dilation smaller than this passes both directional metrics at 100%.

**Fix (minimal):**
- Add a full-mask comparison with no erosion at 216 dpi: IoU plus symmetric mismatch area, reported in m².
- Add a boundary distance metric: distance-transform the rendered mask edge and sample the serialized polygon boundary, reporting p50/p95/max in metres.
- Add two **negative controls** that must fail the gate:
  - the recovered geometry translated by 0.5 pt;
  - the geometry with one clip omitted.

If the gate passes on the shifted geometry, it is not a fidelity test.

### 3. The render check is independent of Shapely, not of PyMuPDF extraction.

`render_check` rebuilds content from the same `get_drawings(extended=True)` items. Any extraction error is common-mode and invisible to the check:
- dropped curve segments;
- a CTM or Form XObject transform applied wrongly;
- a missed clip;
- a misreported `even_odd` flag.

**Fix:**
- Either add an OCG-based check: render the *original page* with only the data layers' OCGs enabled (`doc.set_layer` / layer UI configs) and compare to the serialized geometry, accepting halo/label masks as known exclusions.
- Or rephrase the claim to "independent of Shapely; shares PyMuPDF path extraction."

The current limitation text says "original isolated path and clip commands." That overstates independence.

---

## P2: fix before delivery

### Richfield geometry and serialization

- **Page origin assumption.** Both `georeference` (`mediabox.height - …`) and `commands()` (`page.rect.height - y`) assume the origin is (0,0) and that cropbox equals mediabox. Assert `page.mediabox.x0 == y0 == 0` and `page.cropbox == page.mediabox`, or apply the offsets.
- **"Coordinate decimals 7" is not guaranteed.**
  - `set_precision(1e-7)` snaps to a grid, but `json.dumps` can still emit values like `44.123456700000004`.
  - Round coordinates explicitly when building `geom`, then re-validate.
  - Also check that `rounded` is non-empty and that `shape(...).geom_type` is Polygon or MultiPolygon.
- **`shapely.orient_polygons` needs Shapely ≥ 2.1.** Pin it in `runtime.json` and assert the version.
- **Narrow features are not covered.** Shapes with no interior samples are silently outside the gate.
  - Report, per class, the source area and polygon count whose negative buffer is empty.
  - Fail or flag if that area exceeds a stated fraction (for example 1%).
- **Interior gate divides by `max(n,1)`.** A class with zero interior pixels yields 0% and raises. That is acceptable fail-closed behaviour, but report it explicitly rather than as an opaque exception.
- **Even-odd via per-ring `make_valid` then XOR.** `make_valid` on a self-overlapping single ring does not reliably equal even-odd. Add a unit test with a self-intersecting, doubly-wound ring checked against a MuPDF raster. Alternatively, use the same polygonize-plus-crossing-parity approach as the nonzero branch (count parity instead of signed winding), which is consistent and testable.
- **Overlap threshold `1e-7 pt²` is effectively float noise.** The results show `±1.45e-11`, so it works. Consider an explicit tolerance in m² and always run the draw-order resolution when there is more than one class. It is cheap and removes a branch.

### Shoreline check

- **Selection on agreement.** Matching requires overlap above 0.3 and an area ratio between 0.5 and 2, which conditions on agreement. Report candidate lake count, matched count and unmatched lakes with areas.
- **OSM coverage.** Only `way` elements are used, so multipolygon relations (lakes with islands) are dropped. Only exteriors are sampled.
- **Page reuse.** Page 8's georeference is reused. Assert it equals the data pages' georeference, as the unit test does for the data pages.
- **Wording.** One lake has p90 of 38.9 m. Present per-lake results alongside the pooled median, and keep the "OSM not survey" wording.

### Porto

- **Missing-list threshold mismatch.**
  - `-missing.json` uses a hard-coded `recognized < 8`.
  - `aggregate` uses `selection['configuration']['recognized_pixel_minimum']`.
  - If the minimum is below 8, cells are both exported and listed as missing. If it is above 8, some unexported cells are not listed.
  - Use the same config value, and add a test that the exported and missing ID sets are disjoint and together cover all municipal cells.
- **Per-hazard release status.**
  - `release_status='research_only_failed_coverage_gate'` is stamped on all six hazards.
  - The flood experimental layer is the one with 9.78% of emitted cells where the reference is empty.
  - Record the actual gate inputs and outcome per hazard so the label is evidence, not a blanket string. Keep all six quarantined anyway, since the method is selected jointly.
- **Macro average hides flood.**
  - The macro `predicted_zero_reference_pct` is 1.63%, versus 9.78% for flood.
  - Any summary quoting 79.71% must sit next to the per-hazard flood row and `exact_common_pct`.
  - On common cells the gain is 74.4 → 80.4. The larger "exact_all" jump is mostly coverage, not per-cell accuracy. State this explicitly.
- **Selection provenance.** "Best-safe of six predeclared experiments" is only clean if the choice used `validation` and `SELECTION.json` was committed before any `test` metrics existed.
  - Store the validation-stage table that justified the choice.
  - Store the `SELECTION.json` hash and timestamp before the test run.
  - The current `run.py` computes test metrics for the selected configuration only, so there is no audit trail showing the other five were not peeked at on test.
- **Scale fix cannot change class accuracy.** For JVP values `j/9`, `floor(5·(0.9v+0.05)) = j//2 = rint(9v)//2`, so class agreement is identical by construction. Only MAE and bias change. Your wording ("values only") is correct. Add one sentence explaining why so reviewers do not read identical exact-match figures as a bug.
- **Spatial split leakage.** The 3 km blocks have no buffer, so adjacent dev and test blocks are autocorrelated. With no fitting beyond choosing among six configurations, the leakage is small. Disclose it rather than add a buffer now.
- **Unit test targets an unused function.** `test_uint8_colour_input` tests `classify_nearest`, but the pipeline uses `classify_blended`. Add the uint8 and exact-swatch test for `classify_blended` at the selected `min_alpha`.
- **Reference ingestion.**
  - `im.info['transparency']==255` can be a bytes table in some palette PNGs. Handle both forms.
  - The Web Mercator bounds assumption should be asserted from the manifest (CRS field) rather than implied.
- **Interval semantics are fine.** Both intervals are labelled quantization or rounding only, not confidence. For aggregated means, ±0.05 is a bound on the midpoint convention, not on the cell mean of the true continuous field. One clause saying so is enough.

---

## Claims to keep or reword

**Keep:**
- Richfield is "source fidelity, not hazard accuracy."
- Porto experimental is "not production."
- Native is "same-author derivative, original TIFF unauthenticated."
- No self-accuracy claim.
- No second road control.
- The model is document-specific, not a general PDF solution.

**Reword:**
- The "independent rasterization" phrasing (see P1-3).
- Any statement derived from the current JSON files (see P1-1).

**Add:**
- The native raster layer is the benchmark reference itself. Recommending it is sensible, but the experimental metrics measure how much the PDF route loses relative to it. They are not validation of the native layer.

---

## Delivery judgement, conditional on regenerated evidence

1. **Richfield improved layers (5):** deliver only if the fresh run passes the existing gates *plus* the full-mask/boundary metric and the negative controls. Attach the new `validation.json` and the code hashes.
2. **Native PNG aggregation layers (6):** recommended, with provenance: unauthenticated derivative; 250 m cells are aggregation units, not footprints; low-support cells flagged; source PNG retained for detail.
3. **Scale-corrected existing layers (6):** fallback only. Keep "missing ≠ zero risk" in the layer metadata.
4. **Experimental layers (6):** quarantined, in a separate directory, with release status per hazard.
   - Do not "repair" flood by masking with the reference. That would make it reference-dependent.
   - If anything, recommend users use tier 2 instead.

No ML retraining is warranted. The remaining issues are evidence provenance and test sensitivity, not model capacity.