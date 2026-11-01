import json
from porto import ROOT,OUT

def read(p):return json.loads(p.read_text(encoding='utf-8'))
r=read(OUT/'richfield/validation.json');p=read(OUT/'porto-benchmark.json');budget=read(ROOT/'BUDGET.json');manifest=read(OUT/'run-manifest.json')
if manifest['status']!='complete' or manifest['route']!='all':raise SystemExit('Cannot report an incomplete full run')
rows=[]
for name,layer in r['layers'].items():
    render=layer['render_check'];boundary=layer['serialized_boundary_vertex_to_segment_m']
    rows.append(f"| {name} | {sum(layer['source_paths'].values())} | {min(v['rendered_colour_interior_covered_pct'] for v in render.values()):.3f}% | {min(v['full_mask_iou'] for v in render.values()):.4f} | {max(v['p99_9_m'] for v in boundary.values()):.5f} | {max(v['max_m'] for v in boundary.values()):.3f} |")
porto=[]
for h,v in p['hazards'].items():
    a=v['comparisons']['test']['jvp'];b=v['comparisons']['test']['experimental']
    porto.append(f"| {h} | {a['eligible']} | {a['exact_all_pct']:.1f}% → {b['exact_all_pct']:.1f}% | {a['exact_common_pct']:.1f}% → {b['exact_common_pct']:.1f}% | {a['missing_pct']:.1f}% → {b['missing_pct']:.1f}% | {a['predicted_zero_reference_pct']:.1f}% → {b['predicted_zero_reference_pct']:.1f}% |")
a=p['test_macro_average']['jvp'];b=p['test_macro_average']['experimental'];c=p['test_macro_average']['scale_fix_only'];shore=r['shoreline_check']
all_macro={name:sum(v['comparisons']['all_descriptive'][name]['exact_all_pct'] for v in p['hazards'].values())/6 for name in ['jvp','experimental']}
max_sym=max(v for layer in r['layers'].values() for v in layer['serialized_symmetric_difference_area_fraction'].values())*100
max_narrow=max(v['narrow_polygon_area_fraction'] for layer in r['layers'].values() for v in layer['render_check'].values())*100
flood=p['hazards']['flood']['comparisons']['test'];f=flood['experimental'];fo=flood['jvp']
drought_precision=p['hazards']['drought']['comparisons']['test']['experimental']['high_precision_common_pct']
arbo_precision=p['hazards']['arbovirus']['comparisons']['test']['experimental']['high_precision_common_pct']
text=f'''# A better recovery route for JVP's two examples

## What was achieved

**Richfield has a substantially better source reconstruction:** five valid vector layers extracted directly from the PDF, including fill-and-stroke paths (fill geometry only), with placement from the document's embedded GeoPDF coordinates. This avoids both pixel tracing and fitting placement to an approximate city boundary. Stroke widths and label halos are not risk geometry in these exports.

**Porto has a better source-data route and a promising but rejected PDF trial.** Six numerical-source layers are ingested from the published indexed raster derivatives. Six scale-corrected existing layers retain the original coverage. A separate colour-mixing trial improves class recovery but fails coverage/precision gates, so all six trial layers remain research-only.

No generative model supplies geometry or hazard values. Local ML was not added: the important Richfield information was already in the file, while Porto's failure is ambiguous colour mixing and unsupported coverage. A larger model would not make an unknown masked pixel an observation.

## Richfield: what the checks actually show

The PDF stores NAD83 / UTM 15N registration. Its corner fit is about 0.1 m internally and its scale is about 7.620 m per PDF point, matching the printed scale. Those are consistency checks on the document, **not surveyed accuracy**. All data pages and the shoreline-check page share the registration.

| Layer | Source paths | Min render interior covered | Min full-mask IoU | Max class boundary p99.9, m | Boundary maximum, m |
|---|---:|---:|---:|---:|---:|
{chr(10).join(rows)}

The render and IoU columns are minima across classes, not whole-layer averages. Prioritization class 4.5–6.4 has full-mask IoU 0.8752, with roughly 59,194 m² of raster disagreement. Class-boundary antialiasing is a plausible contributor, but a boundary-band breakdown was not measured: **this full-mask discrepancy remains unexplained**, despite tight vector roundtrip and high interior agreement.

All five final GeoJSONs have zero invalid features after serialization. The worst symmetric-difference area change caused by projection/topology handling/serialization is **{max_sym:.6f}%**. Storage uses nine decimals to avoid unnecessary feature collapse; this does not imply sub-millimetre map accuracy.

The render comparison uses a different fill interpreter: MuPDF renders isolated path/clip commands while Shapely interprets the exported geometry. Both start from PyMuPDF extraction, so they share that potential failure mode. Full-mask IoU includes raster boundary differences; the interior percentages exclude a 2/3-point boundary strip. Up to **{max_narrow:.2f}% of a class's area** is in narrow components with no surviving interior, so the interior percentage alone cannot validate them. Full-mask, area and boundary checks supplement it.

The boundary gate checks 99.9% of vertices within 0.1 m and symmetric-difference area below 0.01%; maxima remain visible in the table. A few degenerate spikes can collapse during topology handling. A half-point shift (3.81 m) must fail the boundary gate; an omitted-clip fixture must fail the expected-area check. That coarse shift tests the roundtrip gate, not the rasterizer's near-threshold sensitivity. These are diagnostic validation gates, not a preregistered accuracy experiment.

The OSM comparison provides **weak, conditional consistency evidence**: **{shore['matched_lakes']} of {shore['candidate_lakes']} candidate lakes** match, with pooled one-way PDF-to-OSM shoreline distance median **{shore['median_m']:.1f} m**, p90 **{shore['p90_m']:.1f} m**. Nothing was fitted to OSM. Matching conditions on overlap and approximate area and includes OSM ways/exterior shorelines only. Large unmatched lakes and omitted multipolygon relations limit the check; one matched lake has median error about 11.4 m. It is not surveyed accuracy. Per-lake errors and unmatched candidates are in `outputs/richfield/validation.json`.

JVP-versus-source overlap is recorded per layer/class in that file. It measures the old output's disagreement with the source document; direct extraction matching its own source is not “100% hazard accuracy.” The archived report itself may still have modelling or source-data errors.

## Porto: same held-out blocks, same denominators

The six deterministic configurations were compared on validation blocks. The selected trial (`blend35_8`) was frozen before the test call: grey-colour compositing, alpha at least 0.35, at least eight accepted source pixels, mean bin-midpoint aggregation. It was selected for its lower false coverage and MAE among blending trials, **not because it passed all gates**. Its validation coverage failure already prevented release.

**Post-test correction:** an exact-legend-swatch test then found the red-pixel filter rejected the two darkest swatches. The filter was corrected to include the printed ramp's maximum blue-minus-green difference plus the existing three-channel tolerance. No configuration reselection occurred, but the test blocks had already been observed before this bug fix. Results below are the fixed rerun; pre-fix results remain in `experiments/porto-before-swatch-bugfix.json`. Do not describe the final numbers as a pristine one-shot test.

| Hazard | Eligible test cells | Correct and present / all | Correct / common | Missing | Emitted where reference empty |
|---|---:|---:|---:|---:|---:|
{chr(10).join(porto)}

Equal-hazard test averages:

- Correct-and-present: **{a['exact_all_pct']:.2f}% → {b['exact_all_pct']:.2f}%**.
- Correct class among common cells: **{a['exact_common_pct']:.2f}% → {b['exact_common_pct']:.2f}%**. Much of the larger first improvement comes from coverage.
- Missing eligible cells: **{a['missing_pct']:.2f}% → {b['missing_pct']:.2f}%**.
- Numeric MAE: original **{a['mae']:.4f}**, scale fix alone **{c['mae']:.4f}**, experimental **{b['mae']:.4f}**.

**The flood problem blocks an unqualified success claim:** {f['predicted_zero_reference_cells']} of {f['predicted_cells']} experimental test outputs ({f['predicted_zero_reference_pct']:.2f}%) fall in cells with zero reference pixels, compared with {fo['predicted_zero_reference_cells']} of {fo['predicted_cells']} original outputs ({fo['predicted_zero_reference_pct']:.2f}%). Empty-reference disagreement is not proof that every such PDF pixel is false, but it fails the declared coverage gate. Do not mask these outputs with the reference and call that improved PDF extraction.

Other gates also matter: extra output in cells with only 1–14 reference pixels and high-risk precision. For example, test high-risk precision among common cells is {drought_precision:.1f}% for drought and {arbo_precision:.1f}% for arbovirus. Per-hazard validation gate results are included in `outputs/porto-benchmark.json`. Every experimental layer remains quarantined because the method was selected jointly.

For continuity with the previous audit, the **all-cell descriptive** correct-and-present average is {all_macro['jvp']:.2f}% original versus {all_macro['experimental']:.2f}% experimental. Do not compare the old all-cell 59.3% to the new test-only {b['exact_all_pct']:.1f}%; those use different subsets.

## Which Porto output to use

1. **Numerical-source route:** ingest the published indexed PNGs directly (`index / 254`, 255 = no-data), retain all cells with at least one source pixel and flag cells below 15. The six source rasters and manifest are preserved for finer detail. Exact readback tests validate ingestion only. The original TIFFs have not been independently authenticated.
2. **Existing-PDF fallback:** apply `0.9 * v + 0.05` to repair the numeric bin-centre scale. Intended classes and missing counts remain unchanged; bias/MAE improve. Missing means unknown, not source-masked or zero risk.
3. **Experimental PDF recovery:** useful for research and visually inspecting candidate missing regions. It is not an approved substitute for the source data. Palette intervals exclude classification error and are not confidence intervals.

## Reproducibility and review

- Two specific document profiles; unexpected path/CRS/page assumptions fail closed. This is not a general-purpose PDF model.
- The primary benchmark requires at least 15 valid reference pixels per 250 m cell. Sensitivities at 5 and 30 are supplied. Missing cells count as failures in the correct-and-present metric, never as zero-valued observations.
- Spatial split: shared 3 km blocks across hazards, deterministic hash folds. Validation/test were separated for configuration choice, but the maps had already been audited. There is no buffer between blocks, no pristine blind-test claim, no independent original-TIFF reference, and no statistical confidence interval.
- Native Opus supplied the design and discovered GeoPDF registration. Two native follow-ups were rate-limited. OpenRouter Opus then reviewed the implementation; the first call returned no final review after hitting its token limit, and the next review produced concrete fixes. A final closeout inspection found no blocker within the labelled scope and requested the wording clarifications above. These reviews inspected supplied source code/evidence, not tool-enabled independent reruns. See `reviews/` and its response log.
- Final full run: {manifest['started_utc']} to {manifest['finished_utc']}. `outputs/run-manifest.json` ties code, selection, inputs and outputs to hashes. See `README.md` for commands.
- OpenRouter spend currently recorded: **${budget['openrouter_spent_usd']:.6f} / $10**. `BUDGET.json` is authoritative if a later review is added. No key or credential is included in the artifacts.

Not checked: surveyed controls, an independent road alignment check, original Porto TIFF authentication, other reports, or downstream production integration. The principal remaining risk is interpreting reconstructed source maps as independently validated hazard data.
'''
(ROOT/'REPORT.md').write_text(text,encoding='utf-8')
print('Wrote REPORT.md')
