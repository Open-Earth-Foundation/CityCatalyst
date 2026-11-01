# JVP PDF-to-GeoJSON: combined accuracy review

28 October 2026. Reviewers: Claude Opus 5.5, GPT-6.1 Sol and GPT-6 Astra. Scope: the two supplied document examples, six Porto Alegre hazard layers and five Richfield layers. Three extraction scripts do not mean three documents. Buenos Aires is excluded from this assessment.

## Combined conclusion

JVP's work preserves useful broad spatial information, but its outputs are not faithful substitutes for the source GIS. The dominant problems differ: Porto loses coverage and understates values/classes; Richfield traces many source edges closely but has a consequential geographic placement error. Neither “all about 30% accurate” nor “98–99% accurate” is a defensible summary.

The reviewer suitability scores and their equal-weight arithmetic mean are reported in the final response and combined-metrics.json. Those are subjective scores for cautious city-level screening, not percentages of correct data. Factual measurements use matched definitions and exact counts. Three reviewers checking the same reference are not three independent ground-truth datasets.

The three final subjective ratings, with equal weight:

| Reviewer | Porto Alegre | Richfield |
|---|---:|---:|
| Opus 5.5 | 5/10 | 5/10 |
| Sol 6.1 | 6/10 | 5/10 |
| Astra | 6/10 | 5/10 |
| Arithmetic mean | **5.7/10** | **5.0/10** |

Shared rubric: 0 unusable; 2 unverified major failures; 4 limited qualitative use; 6 cautious broad screening; 8 validated quantitative screening; 10 independently validated source equivalence. Opus is stricter about screening usefulness because of omissions and weak high-class recovery. Sol and Astra retain 6 for broad Porto pattern exploration, not hotspot selection. These are suitability opinions, not probabilities or accuracy percentages.

## Porto Alegre: measured agreement

The primary comparison tests **intended risk labels**: classify the reference mean using official boundaries .2/.4/.6/.8, and classify the delivered reconstructed mean using JVP's published round(9*s)//2 rule. Both are classes of a cell mean, not majority pixel classes. Reference cells must contain at least 15 valid indexed-PNG pixels on the same 250m grid. Missing cells count as unsuccessful in the last column, not as zero-risk values.

| Hazard | Eligible reference cells | Missing | Exact class among common cells | Correct and present / all eligible |
|---|---:|---:|---:|---:|
| River flood | 1,805 | 32.9% | 58.9% | 39.5% |
| Landslide | 3,806 | 20.0% | 78.0% | 62.3% |
| Heat | 3,809 | 19.7% | 76.1% | 61.1% |
| Drought | 3,744 | 18.3% | 80.7% | 65.9% |
| Arbovirus | 3,809 | 19.0% | 81.2% | 65.8% |
| Storm | 3,809 | 19.5% | 76.0% | 61.2% |
| Equal-hazard mean | — | **21.6%** | **75.1%** | **59.3%** |

This is agreement with repository-hosted derivatives attributed to municipal rasters, not independent proof of real-world risk. The original TIFF delivery was not authenticated. The indexed PNG values carry bilinear reprojection and 1/254 quantisation. We decoded indices, not RGB colours, and checked that index255 is nodata while index0 remains a valid value.

### What these results imply

**Missingness is material.** Flood loses 594/1805 eligible reference cells. Of those, 314 have medium and 131 high reference mean risk. Their mean index (.489) is almost identical to the mean on common flood cells (.485). Missing cells cannot be explained universally as source-masked areas or harmless low-risk background. The [payload's coverage note](https://github.com/joaquinOEF/NBS-Project-Preparation/blob/ab4a2eb10f4b65c7dffce79b78ceaebe4935b643/scripts/combine-arvc-grid.py#L80) overstates that explanation. The 15-recognised-pixel export threshold and colour rejection cause additional omissions; map overprinting and mixed colours contribute. The precise cause of every omission was not experimentally isolated.

**Values are systematically lower.** Delivered-minus-reference mean bias is -0.108 for flood and -0.054 to -0.059 for the other hazards, on a 0–1 scale. MAE is .113 for flood and .058–.066 elsewhere. The six-hazard means are bias -.066 and MAE .071. Correlation is .753 for flood and .866–.905 elsewhere: broad spatial patterns survive even when numerical values are wrong. Correlation is not accuracy.

**High-class decisions are much less reliable than tolerant agreement suggests.** Using the intended labels, the reconstruction retains an Alta-or-higher label for only 43/371 high-reference flood cells (11.6%) across all eligible cells. The other hazard recalls range from0% to26.5%; drought has only 27 high-reference cells. These are fixed threshold tests after 250 m aggregation, not recall of all flood areas or pixel-level hazard detections. Averaging and downward bias make such hotspot selection unsafe to infer from a “within one class” score.

**Alignment is not the principal Porto failure.** Printed-tick fits have roughly6–16 m residuals, and registration against the raster derivatives suggests a relative shift around 8–12 m. Those estimates support reasonable placement for 250 m cells, not metre-level certified positional accuracy. Full grid squares deliberately blur ~30m source detail; valid polygons and sub-metre coordinate-rounding consistency cannot restore that detail.

### Why the reviewers initially reported different class scores

The source uses ten .1-wide bins grouped into five named classes. JVP maps palette step k to k/9, while a bin-centre estimate is .1*k+.05. A delivered cell mean s therefore converts to .9*s+.05 if using midpoint estimates. That is still an estimate of unknown original values, not their recovery.

- **Intended labels:** reference uses official bins; reconstruction uses its own published class rule. Result 75.1% common, 59.3% across all eligible. This is the primary table above.
- **Literal numeric compatibility:** apply official bins directly to both raw numbers. Result 71.2% common, 56.2% across all eligible. This measures what happens if downstream consumers treat the delivered values as official-scale indices without conversion.
- **Our old audit:** applied the reconstruction rule to both datasets. That puts the reference thresholds in the wrong places and should not be labelled official-class accuracy.

The difference is methodological, not reviewer noise. We did not average75.1% and71.2% into a compromise score. The midpoint conversion improves average bias/MAE but does not solve omitted cells or recover within-bin information.

### Sensitivity and reproducibility

The missing-cell fraction depends on minimum reference support. For flood it is 53.5% with any valid reference pixel, 32.9% at 15 pixels, 17.2% at 30 and8.5% at 50. More sparsely covered cells are harder to retain. Reference pixels and PDF pixels differ in ground area; a matching count threshold is not an identical area threshold. Pixel-area weighting and cell weighting also answer different questions.

Sol's municipality-boundary clipping check changed correct/all-eligible results by only about .02–.04 percentage points. The boundary does not explain the reported large omission rates. Class comparisons are conditional on the chosen source, registration, aggregation and eligibility rules.

Opus reproduced all six supplied cell/value dictionaries exactly using the source JPEGs decoded by Pillow/libjpeg and the author's logic. MuPDF decoding changes many rounded values and some cell membership. This demonstrates reproducibility under a specified decoder, not accuracy or fresh-environment CLI portability. The recovery method should pin decoder versions and preserve support counts and intermediate masks.

## Richfield: newly recovered source changes the assessment

The live source URL returns 404, but Opus recovered the [archived Barr report](https://web.archive.org/web/20260211140548/https://cms9files.revize.com/richfieldmn/Richfield_FloodRiskPrioritization.pdf). Astra independently matched its SHA-1 digest to the live archive index and rendered the 100-year figure. The PDF contains flood-colour vector paths with even-odd fills and straight segments. They provide a direct reference for printed source geometry; raster tracing was not necessary to recover those shapes.

This supersedes our earlier “Richfield cannot be compared” conclusion. It does **not** turn the PDF into surveyed flood ground truth.

Opus registered PDF lake outlines to nine OSM water polygons. The fitted 7.6208 m/point scale agrees with the printed 7.620 m/point scale bar; median shoreline residual is 2.6 m and leaving out one lake changes the fitted map-centre location by at most 1.4 m. These checks support the fit, but OSM/cartographic controls are not surveyed checkpoints. Report all geographic errors below relative to this OSM-based reference.

| Inundation layer | IoU with lake-registered PDF | Source area recovered | IoU when using JVP's own placement |
|---|---:|---:|---:|
| 2-year | 47.8% | 65.8% | 76.3% |
| 10-year | 48.1% | 66.0% | 81.1% |
| 100-year | 50.5% | 68.8% | 85.4% |
| MCE100 | 53.5% | 69.6% | 85.5% |

IoU is intersection area divided by union area; it penalises both missing and extra area. It is neither class accuracy nor the fraction of all land correctly labelled.

**Tracing and placement must be separated.** Under JVP's own placement, median shipped-to-source edge distance is about .8–1.3 m. Against the lake-based geographic reference it is about 8–9 m, with 90th-percentile errors around 29–33 m. The coordinate transform itself differs by a median 26 m and up to 60 m over sampled city locations, mostly eastward; its scale is about .66% too large. A nearest-edge distance and a displacement of the same geographic point are different measures, so these numbers are consistent.

**Prioritisation has excellent conditional class matching but incomplete coverage.** Classes agree over 99.4% of common classified area, while correct-class area covers only 57.8% of all source-classified area under the reference registration. The highest-priority class has only about 72.9% of the source's area; the palest class has IoU around 24.4%. Conditional class accuracy hides missing and displaced areas.

**Cross-review correction:** Sol found that Opus's page-31 parser omitted 474 filled-and-outlined (`fs`) data paths. Astra recomputed the full class reference including both `f` and `fs` paths, with verified even-odd fill rules. The old subset first reproduced Opus's 99.71%/62.74% results to within .01 percentage point, validating the calculation control. The corrected full-reference results are 99.42% common-class agreement and57.75% correct-class coverage over289.49ha. The precise lower-class and highest-class figures above use this corrected reference. This parser defect does not affect the four inundation pages, whose selected data paths are fill-only. See [corrected calculation](astra/priority-corrected.json) and [script](astra/priority_recheck.py).

**Nine serialized features remain invalid:** three 100-year, five MCE100 and one prioritisation feature. Repairs were temporary measurement copies. The output needs final post-rounding validity checks; 9/1839 invalid features is not an estimate of map accuracy.

**The eastern boundary test was weak.** It measured dark-pixel hits, never blocked export, and compared an OSM boundary with a differently drawn Barr boundary near the airport. A 30–38% hit rate is not “30–38% accurate.” Source flood shapes are almost nested, but JVP's unions enforce nesting by editing recovered geometry; the resulting nesting cannot itself validate extraction. Near-nesting supports the assumption for these maps without proving that every raw discrepancy was solely a missing larger-storm pixel.

## What deserves credit, and what must change

The approaches are technically sensible for difficult cartography: coordinate-grid recovery for Porto, difference imaging against a matching aerial basemap for Richfield, hole preservation, explicit reconstruction attribution and later discussion of limitations. Opus's exact Porto reproduction is a real strength. The later [official-raster write-up](https://github.com/joaquinOEF/NBS-Project-Preparation/blob/ab4a2eb10f4b65c7dffce79b78ceaebe4935b643/docs/arvc-official.md) openly reports range compression and missing flood coverage.

Before quantitative use: use original source GIS/raster data where available; extract existing PDF vectors; calibrate Richfield registration against independent controls; validate final geometry; preserve support fractions and missingness reasons; fix the Porto numeric scale contract; test class-specific omissions and decision thresholds; make QA failures prevent export. These fixes address the measured problems rather than merely making overlays look closer.

For exploratory neighbourhood/city-scale visuals with explicit caveats, parts of this work are useful. For precise hotspot selection, parcel treatment, funder-citable values or engineering/regulatory decisions, the reconstructed outputs are insufficiently faithful.

## Evidence, reviewer disagreements and limits

Individual assessments: [Astra](astra/astra-review.md), [Astra reconciliation](astra/reconciliation.md), [Sol](sol/sol-review.md), [Sol reconciliation](sol/reconciliation.md), [Opus](opus/opus-review.md). Their full raw scripts, confusion matrices and diagnostics remain alongside the reports. The combined figures distinguish independently recomputed Porto measurements from newly derived Richfield reference estimates; no statistical confidence is manufactured by averaging reviewers.

Pinned NBS revision: ab4a2eb10f4b65c7dffce79b78ceaebe4935b643. Viewer revision:1767cd5dd13150b2fe589c4a0a95f0e6f67234a7. Richfield PDF SHA256:f4ce5c2381a2bcd055ad0828fba8f9a6341e97736081e96d8339c5df218ba758. Porto linked PDF SHA256:6a6555c7620e83cf05ee0f35fe7b737a5a42afadf53eab6fe5d029785fff82b3.

The previous videos remain valid demonstrations of selected Porto omissions; they predate the Richfield archive discovery. They are not random samples or prevalence estimates.

Not established: original Porto TIFF authenticity, surveyed Richfield accuracy, physical risk-model validity, full unmodified Richfield pipeline regeneration, absent pdf-to-geojson skill text, or Buenos Aires accuracy. Those limits apply to the final judgement and prevent a single defensible overall accuracy percentage.

