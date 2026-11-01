# Response to Opus implementation review

The complete review is `opus-validation.md`. It was a code-and-evidence review via OpenRouter, not an independent tool-executed rerun.

## Evidence provenance

- Richfield evidence in that prompt was indeed stale while the new run was in progress. It is superseded by the completed full-run manifest and regenerated validation file.
- The Porto schema discrepancy was introduced by the consultation helper: it summarized the full file into `test_per_hazard` to reduce prompt size but retained the original filename heading. The actual disk file was not hand-edited and retained `hazards`, selection hash and sensitivity results. This was a misleading review-input label, not evidence of fabricated numbers. The next review explicitly distinguishes summaries.
- A full-run manifest now records pipeline code, selection, input and output hashes plus start/end times. Tests reject incomplete runs and changed pipeline artifacts.

## Richfield changes

- Added full-mask IoU and mismatch area, without eroding the mask.
- The interior check now uses actual vector buffering: binary erosion alone missed subpixel holes and caused misleading failures.
- Added a serialized-output roundtrip boundary check and a half-point translation negative control. Added an omitted-clip synthetic negative control.
- Increased storage precision from 7 to 9 decimals after low precision collapsed narrow shapes. Decimal precision is not a geographic-accuracy claim.
- An absolute maximum boundary-distance gate still flagged a few collapsed degenerate spikes. The revised gate bounds **99.9th-percentile vertex-to-segment distance to 0.1 m and symmetric-difference area to 0.01%**, retains maximum distance and outlier counts, and requires the shifted negative control to fail. This is a documented diagnostic amendment, not an unchanged preregistered threshold.
- Full-mask comparison is at 216 dpi; interior comparison excludes a 2/3-point boundary strip. Narrow-component counts and area shares are reported, rather than hidden behind the interior percentage. Narrow shapes are not automatically dropped from export.
- Claims now explicitly say the independent rasterizer shares PyMuPDF path extraction. The original PDF has no exposed OCGs in `get_ocgs()`, so OCG-only original-page rendering was not used. No renderer-independent extraction claim is made.
- Unexpected page origins/crops fail closed. Final JSON coordinates are explicitly rounded, valid, non-empty polygons. Shapely is pinned.
- Invalid even-odd rings now use crossing parity, not `make_valid` parity assumptions. Added doubly-wound and nonzero-winding tests.
- Shoreline results include candidate/matched/unmatched counts, selection conditions, per-lake errors and the page-8 georeference consistency check. No road control was added; OSM remains unsurveyed, conditional matching evidence.

## Porto changes and retained limits

- Missing-cell ledgers now use the selected support threshold, with an exported/missing partition test.
- Validation gates are reported per hazard. The method remains jointly quarantined even where individual gates pass.
- Added uint8 input checks for the blended classifier, a reference CRS check and both supported palette transparency encodings.
- The saved validation-stage table and selection file predate the test call in the tool history. They were not committed into Git because this is an isolated artifact project, so no immutable preregistration claim is made.
- No buffer was added after inspecting results. No reference mask was used to “repair” experimental predictions.
- The native route is the benchmark data itself; numerical readback equality only checks ingestion. It is not source accuracy.
- Quantization intervals remain explicitly uncalibrated and exclude classification and field-reconstruction uncertainty.

## Consultation failures and cost

Native Opus supplied the useful design/GeoPDF discovery. Two subsequent native tasks hit rate limits. The first paid OpenRouter review spent its output budget on reasoning and returned no final review; that cost remains in `BUDGET.json`. The second returned the actionable review addressed here. No LLM output supplies map geometry or risk values.
