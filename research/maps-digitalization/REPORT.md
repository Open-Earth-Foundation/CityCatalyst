# A better recovery route for JVP's two examples

## What was achieved

**Richfield has a substantially better source reconstruction:** five valid vector layers extracted directly from the PDF, including fill-and-stroke paths (fill geometry only), with placement from the document's embedded GeoPDF coordinates. This avoids both pixel tracing and fitting placement to an approximate city boundary. Stroke widths and label halos are not risk geometry in these exports.

**Porto has a better source-data route and a promising but rejected PDF trial.** Six numerical-source layers are ingested from the published indexed raster derivatives. Six scale-corrected existing layers retain the original coverage. A separate colour-mixing trial improves class recovery but fails coverage/precision gates, so all six trial layers remain research-only.

No generative model supplies geometry or hazard values. Local ML was not added: the important Richfield information was already in the file, while Porto's failure is ambiguous colour mixing and unsupported coverage. A larger model would not make an unknown masked pixel an observation.

## Richfield: what the checks actually show

The PDF stores NAD83 / UTM 15N registration. Its corner fit is about 0.1 m internally and its scale is about 7.620 m per PDF point, matching the printed scale. Those are consistency checks on the document, **not surveyed accuracy**. All data pages and the shoreline-check page share the registration.

| Layer | Source paths | Min render interior covered | Min full-mask IoU | Max class boundary p99.9, m | Boundary maximum, m |
|---|---:|---:|---:|---:|---:|
| inundation-2yr | 378 | 99.998% | 0.9802 | 0.00007 | 0.000 |
| inundation-10yr | 577 | 100.000% | 0.9884 | 0.00006 | 0.000 |
| inundation-100yr | 746 | 100.000% | 0.9897 | 0.00006 | 3.408 |
| inundation-mce100 | 746 | 100.000% | 0.9909 | 0.00006 | 0.448 |
| prioritization-score | 746 | 99.999% | 0.8752 | 0.00006 | 1.704 |

The render and IoU columns are minima across classes, not whole-layer averages. Prioritization class 4.5–6.4 has full-mask IoU 0.8752, with roughly 59,194 m² of raster disagreement. Class-boundary antialiasing is a plausible contributor, but a boundary-band breakdown was not measured: **this full-mask discrepancy remains unexplained**, despite tight vector roundtrip and high interior agreement.

All five final GeoJSONs have zero invalid features after serialization. The worst symmetric-difference area change caused by projection/topology handling/serialization is **0.000216%**. Storage uses nine decimals to avoid unnecessary feature collapse; this does not imply sub-millimetre map accuracy.

The render comparison uses a different fill interpreter: MuPDF renders isolated path/clip commands while Shapely interprets the exported geometry. Both start from PyMuPDF extraction, so they share that potential failure mode. Full-mask IoU includes raster boundary differences; the interior percentages exclude a 2/3-point boundary strip. Up to **3.60% of a class's area** is in narrow components with no surviving interior, so the interior percentage alone cannot validate them. Full-mask, area and boundary checks supplement it.

The boundary gate checks 99.9% of vertices within 0.1 m and symmetric-difference area below 0.01%; maxima remain visible in the table. A few degenerate spikes can collapse during topology handling. A half-point shift (3.81 m) must fail the boundary gate; an omitted-clip fixture must fail the expected-area check. That coarse shift tests the roundtrip gate, not the rasterizer's near-threshold sensitivity. These are diagnostic validation gates, not a preregistered accuracy experiment.

The OSM comparison provides **weak, conditional consistency evidence**: **12 of 24 candidate lakes** match, with pooled one-way PDF-to-OSM shoreline distance median **3.5 m**, p90 **11.5 m**. Nothing was fitted to OSM. Matching conditions on overlap and approximate area and includes OSM ways/exterior shorelines only. Large unmatched lakes and omitted multipolygon relations limit the check; one matched lake has median error about 11.4 m. It is not surveyed accuracy. Per-lake errors and unmatched candidates are in `outputs/richfield/validation.json`.

JVP-versus-source overlap is recorded per layer/class in that file. It measures the old output's disagreement with the source document; direct extraction matching its own source is not “100% hazard accuracy.” The archived report itself may still have modelling or source-data errors.

## Porto: same held-out blocks, same denominators

The six deterministic configurations were compared on validation blocks. The selected trial (`blend35_8`) was frozen before the test call: grey-colour compositing, alpha at least 0.35, at least eight accepted source pixels, mean bin-midpoint aggregation. It was selected for its lower false coverage and MAE among blending trials, **not because it passed all gates**. Its validation coverage failure already prevented release.

**Post-test correction:** an exact-legend-swatch test then found the red-pixel filter rejected the two darkest swatches. The filter was corrected to include the printed ramp's maximum blue-minus-green difference plus the existing three-channel tolerance. No configuration reselection occurred, but the test blocks had already been observed before this bug fix. Results below are the fixed rerun; pre-fix results remain in `experiments/porto-before-swatch-bugfix.json`. Do not describe the final numbers as a pristine one-shot test.

| Hazard | Eligible test cells | Correct and present / all | Correct / common | Missing | Emitted where reference empty |
|---|---:|---:|---:|---:|---:|
| flood | 283 | 43.8% → 68.2% | 59.9% → 68.7% | 26.9% → 0.7% | 0.5% → 10.8% |
| landslide | 574 | 66.2% → 82.6% | 76.6% → 83.5% | 13.6% → 1.0% | 0.0% → 0.0% |
| heat | 574 | 65.2% → 82.4% | 75.3% → 83.1% | 13.4% → 0.9% | 0.0% → 0.0% |
| drought | 573 | 72.3% → 81.2% | 81.8% → 81.7% | 11.7% → 0.7% | 0.0% → 0.0% |
| arbovirus | 574 | 68.3% → 80.7% | 79.4% → 81.5% | 13.9% → 1.0% | 0.0% → 0.0% |
| storm | 574 | 63.6% → 80.3% | 73.4% → 81.0% | 13.4% → 0.9% | 0.0% → 0.0% |

Equal-hazard test averages:

- Correct-and-present: **63.22% → 79.22%**.
- Correct class among common cells: **74.40% → 79.92%**. Much of the larger first improvement comes from coverage.
- Missing eligible cells: **15.48% → 0.87%**.
- Numeric MAE: original **0.0688**, scale fix alone **0.0594**, experimental **0.0461**.

**The flood problem blocks an unqualified success claim:** 45 of 416 experimental test outputs (10.82%) fall in cells with zero reference pixels, compared with 1 of 220 original outputs (0.45%). Empty-reference disagreement is not proof that every such PDF pixel is false, but it fails the declared coverage gate. Do not mask these outputs with the reference and call that improved PDF extraction.

Other gates also matter: extra output in cells with only 1–14 reference pixels and high-risk precision. For example, test high-risk precision among common cells is 45.5% for drought and 56.4% for arbovirus. Per-hazard validation gate results are included in `outputs/porto-benchmark.json`. Every experimental layer remains quarantined because the method was selected jointly.

For continuity with the previous audit, the **all-cell descriptive** correct-and-present average is 59.29% original versus 75.63% experimental. Do not compare the old all-cell 59.3% to the new test-only 79.2%; those use different subsets.

## Which Porto output to use

1. **Numerical-source route:** ingest the published indexed PNGs directly (`index / 254`, 255 = no-data), retain all cells with at least one source pixel and flag cells below 15. The six source rasters and manifest are preserved for finer detail. Exact readback tests validate ingestion only. The original TIFFs have not been independently authenticated.
2. **Existing-PDF fallback:** apply `0.9 * v + 0.05` to repair the numeric bin-centre scale. Intended classes and missing counts remain unchanged; bias/MAE improve. Missing means unknown, not source-masked or zero risk.
3. **Experimental PDF recovery:** useful for research and visually inspecting candidate missing regions. It is not an approved substitute for the source data. Palette intervals exclude classification error and are not confidence intervals.

## Reproducibility and review

- Two specific document profiles; unexpected path/CRS/page assumptions fail closed. This is not a general-purpose PDF model.
- The primary benchmark requires at least 15 valid reference pixels per 250 m cell. Sensitivities at 5 and 30 are supplied. Missing cells count as failures in the correct-and-present metric, never as zero-valued observations.
- Spatial split: shared 3 km blocks across hazards, deterministic hash folds. Validation/test were separated for configuration choice, but the maps had already been audited. There is no buffer between blocks, no pristine blind-test claim, no independent original-TIFF reference, and no statistical confidence interval.
- Native Opus supplied the design and discovered GeoPDF registration. Two native follow-ups were rate-limited. OpenRouter Opus then reviewed the implementation; the first call returned no final review after hitting its token limit, and the next review produced concrete fixes. A final closeout inspection found no blocker within the labelled scope and requested the wording clarifications above. These reviews inspected supplied source code/evidence, not tool-enabled independent reruns. See `reviews/` and its response log.
- Final full run: 2026-10-28T12:41:43.249397+00:00 to 2026-10-28T12:46:00.108143+00:00. `outputs/run-manifest.json` ties code, selection, inputs and outputs to hashes. See `README.md` for commands.
- OpenRouter spend currently recorded: **$0.845876 / $10**. `BUDGET.json` is authoritative if a later review is added. No key or credential is included in the artifacts.

Not checked: surveyed controls, an independent road alignment check, original Porto TIFF authentication, other reports, or downstream production integration. The principal remaining risk is interpreting reconstructed source maps as independently validated hazard data.
