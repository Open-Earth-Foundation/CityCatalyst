# Final review: Richfield/Porto recovery pipeline

This verdict comes from reading the code and evidence. I did not run anything. Within the stated scope, I see no remaining blocker for any of the four deliverable groups. What remains are limitations, plus two or three small wording and diagnostic fixes the user should see.

## Deliverability by group

**1. Five Richfield source vectors: deliverable as source-fidelity reconstructions.**

- **Full run is consistent.** The manifest status is `complete`, route is `all`, and pipeline, input and output hashes are present. `test_all_delivered_geometry` re-checks the hashes and polygon validity.
- **Roundtrip is tight.** p99.9 is about 6.5e-5 m on every class. The worst symmetric-difference fraction is 2.16e-6, which matches the REPORT's 0.000216%.
- **Negative controls fail as required.** Every class has p99.9 of about 3.81 m against a 0.1 m gate.
- **Interior agreement is high.** Both interior directions are at least 99.86% on every class.
- **Disclosure is adequate.** Shared PyMuPDF extraction, the 2/3-pt blind band, the narrow-component share and the shoreline selection bias are all stated.
- **Not a blocker:** the gate amendment from absolute maximum to p99.9. It is disclosed as non-preregistered, maxima stay in the table, and area change is separately bounded at 1e-4.

**2. Six Porto native aggregates: deliverable as ingestion of the published PNG derivative.**

- The code checks the CRS string, the transparency encoding and readback equality.
- The REPORT correctly says this validates ingestion only, that TIFF provenance is unauthenticated, and that the route is not scored against itself.
- No blocker.

**3. Six conservative value-corrected layers: deliverable.**

- `0.9v+0.05` maps the j/9 storage onto 0.1-bin midpoints. `floor(5·(0.1j+0.05)) = j//2` equals the original class rule, so classes and coverage are unchanged.
- The benchmark confirms this: exact-class percentages are identical, and MAE improves from 0.0688 to 0.0594.
- Missing cells are labelled unknown. No blocker.

**4. Six Porto experiments: deliverable only as research-only, which is how they are labelled.**

- `release_status` is `research_only_failed_coverage_gate`, and the provenance says "not recommended".
- The post-test swatch-filter bug fix is disclosed and pre-fix metrics are retained. The fix changes a filter constant, not a selected parameter.
- The flood empty-reference rate (10.8%) and the drought/arbovirus high-risk precision (45–56%) are reported.
- Not blocking, because nothing claims a pristine test.

## Remaining concrete issues

None of these block the data. Each needs a limitation or a small fix.

**P2-a. Prioritization class 4.5–6.4 full-mask IoU of 0.875 is not explained or bounded in REPORT.md.**
- Its mismatch is 59,194 m² against 43.2 ha of class area, about 14% of the class. That is large relative to the inundation layers.
- The "class anti-alias boundary" explanation is plausible. Adjacent dark blues sit close in RGB, and the alpha projection assumes compositing on white, which is wrong at class-to-class edges. But this is currently an assertion, not a measurement.
- Minimal fix: also report mismatch outside a ±1–2 raster-pixel band around the vector boundaries.
  - If the remaining mismatch is near zero, the explanation is supported.
  - If not, state it as unexplained.
- Either way, add one sentence to REPORT.md under the table. Today the 0.8752 appears with no interpretation.

**P2-b. Table column semantics.**
- For the prioritization row, "Render interior covered" and "Full-mask IoU" are minima across four classes.
- Label them "min across classes". Otherwise a reader may read 0.875 as the whole layer.

**P2-c. The negative control is coarse.**
- A 0.5-pt (3.81 m) shift against a 0.1 m gate shows the gate is not vacuous. It does not show sensitivity near the threshold.
- It also exercises only the roundtrip comparison, not `render_check`.
- Optional cheap improvement: add a roughly 0.02-pt shift (about 0.15 m) that must fail, and one shifted vector fed to `render_check` that must drop interior agreement.
- Otherwise state the control's resolution.

**P2-d. Shoreline evidence is weaker than "independent placement check" suggests.**
- 12 of 24 candidates matched. Unmatched candidates include the two largest lakes (about 47 and 44 ha). That points to OSM multipolygon relations being excluded, not to misplacement.
- One matched lake has a median error of 11.4 m.
- The distance is one-directional, from PDF shoreline to OSM boundary.
- Fix: in REPORT.md, call it "weak, conditional consistency evidence". Optionally include `relation` members.
- Note that the registration itself rests on the embedded GPTS: a 0.078 m residual and a 7.620 m/pt scale.

**P3-a. Portability.** `output_hashes` keys use Windows backslashes. The manifest test may fail on POSIX. Normalise with `as_posix()`.

**P3-b. Narrow components.** Up to 3.6% of a class's area (prioritization 0.0–2.4) and about 3% of the inundation areas have no interior samples. They are validated only by full-mask and roundtrip checks. This is already disclosed; no further action needed.

**P3-c. `fs` paths.** Only the fill of fill-and-stroke paths is exported. Visible stroke width can widen the printed extent by part of a point (several metres on the ground). The `limitation` field says strokes are omitted; REPORT.md's "including fill-and-stroke paths" should add "(fill geometry only)".

**P3-d. Weak test assertion.** `assertNotEqual(...,64)` in the omitted-clip test is weak. Asserting the unclipped sum equals 100 would make it meaningful.

## Things I checked that are fine

- **Fill and clip handling:**
  - Even-odd pairwise symmetric difference is correct for valid rings.
  - The crossing-number winding rule handles self-overlapping rings.
  - Draw-order reconciliation runs only when classes actually overlap (0.06 pt² on page 31).
  - Clip intersection follows the level stack.
- **Mismatch-area conversion:** the determinant sign handling yields positive m².
- **Benchmark denominators:**
  - Missing cells count as failures in `exact_all_pct`.
  - Empty and low-reference cells are tracked separately.
  - Spatial blocks are shared across hazards.
- **Porto schema:** the summary is now explicitly labelled as derived. Its numbers match the REPORT tables, including the 79.22/79.92/0.87 test averages and the flood 45/416.
- **Model use:** no ML or LLM output enters geometry or values. Declining larger models is justified, because the signal is already in the source files.

## Bottom line

After the stated scope (source fidelity, not hazard accuracy; shared PyMuPDF extraction; same-author PNG reference; non-pristine Porto test), there is no blocker. All four groups can be delivered as labelled.

Before handover, I recommend:
1. Adding the boundary-band breakdown, or an explicit "unexplained" note, for the 0.875 class.
2. Labelling the table minima.
3. Softening the shoreline wording.

None of this constitutes independent validation. The principal user-facing risk remains reading faithful reconstructions as validated hazard data, and REPORT.md already states this.