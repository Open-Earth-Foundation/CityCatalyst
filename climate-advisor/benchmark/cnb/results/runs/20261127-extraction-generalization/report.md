# Concept Note Builder extraction benchmark · 27 November 2026

**The Krosno pilot missed its point-quality targets.** The default workspace reader classified all three plans correctly. It returned 14 correct findings among 23 reported (60.9% precision) and found 14 of 22 expected (63.6% recall). The approved thresholds are 90% classification, 90% precision and 80% recall.

## Krosno · grant application fields

Each run used the same three public municipal plans available for the 2021 European City Facility application. The institutional development plan contributed 252 physical pages, the local development plan 294 and the low-emission plan 567. The reader received page-preserving Markdown. Scores cover proposed answers before any user decision. Credit requires the right meaning, full or partial support as specified by the reference, and a citation to the reference file within one physical page.

| Run | File classification | Precision · 35 scored fields | Recall · 35 scored fields | Precision · 11 held fields | Recall · 11 held fields |
| --- | ---: | ---: | ---: | ---: | ---: |
| First official pilot | 3/3 | 2/22 (9.1%) | 2/22 (9.1%) | 1/5 (20.0%) | 1/8 (12.5%) |
| Previous official baseline | 3/3 | 13/25 (52.0%) | 13/22 (59.1%) | 3/7 (42.9%) | 3/8 (37.5%) |
| V3 | 3/3 | 15/25 (60.0%) | 15/22 (68.2%) | 2/7 (28.6%) | 2/8 (25.0%) |
| V5 · product default | 3/3 | 14/23 (60.9%) | 14/22 (63.6%) | 3/7 (42.9%) | 3/8 (37.5%) |

The 11 held fields await Polish-language review and are excluded from the threshold decision. V3 found one more correct field than V5. V5 returned one fewer wrong answer. Both use the same draft reference and scoring policy as the official baseline. [First pilot scores](../20261127-krosno-eucf-first/scores.json) · [Previous baseline scores](../20261127-krosno-eucf-second/scores.json)

An offline replay through the product defaults reproduced all 120 V5 proposals from recorded responses, including their values, quotes, citation locations and file categories. The three plans returned 36, 49 and 35 proposals respectively, with zero additional or omitted proposals. The optional per-field search using dense embeddings defaults to off and has no official end-to-end score.

<details>
<summary>All 11 fields held for Polish-language review</summary>

The reference statuses below are provisional. A match requires both a supporting quotation at the accepted location and the correct meaning.

| Application field | Draft reference | Product default | Provisional assessment |
| --- | --- | --- | --- |
| Type of applicant | Full | Partial | Support level differs |
| NUTS 3 code | Missing | Missing | Correctly left blank |
| LAU code | Missing | Missing | Correctly left blank |
| Total population | Full | Full | Match |
| Needs and expectations | Partial | Partial | Evidence did not match |
| Main sector | Partial | Missing | Missed |
| Link to the adopted plan | Partial | Partial | Evidence did not match |
| Expected renewable energy production | Missing | Missing | Correctly left blank |
| Baseline energy use | Partial | Partial | Match |
| Emission reduction target | Full | Full | Match |
| Baseline emissions | Full | Partial | Support level differs |

</details>

## Golden set · evidence for draft chapters

Both readers processed identical source files and chapter templates. The PR reader (`pr-native`) used its original extraction code. The JVP candidate (`context-native`) ran chapter extraction with quotation context recovery. Both used the fixtures, judge configuration and scoring code from commit `f243854ed661e0f6f64d8237917b6b83052bef13`. This comparison measures chapter evidence. The Krosno comparison above measures answers to application fields. [Golden benchmark PR #3430](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3430)

| Source | Reader | Required fact–chapter pairs covered by meaning | Required pairs with matching evidence in the specified chapter | Fully supported output units | Exact quotes at cited page or block |
| --- | --- | ---: | ---: | ---: | ---: |
| Harbor Point | PR | 12/12 | 12/12 | 38/38 (100%) | 38/38 |
| Harbor Point | JVP | 12/12 | 12/12 | 41/41 (100%) | 41/41 |
| Kraków | PR | 10/10 | 9/10 | 36/42 (85.7%) | 79/79 |
| Kraków | JVP | 9/10 | 9/10 | 95/100 (95.0%) | 105/105 |
| Richfield | PR | 12/12 | 12/12 | 67/75 (89.3%) | 165/165 |
| Richfield | JVP | 11/12 | 9/12 | 60/66 (90.9%) | 178/178 |

The judge scores each output unit by its least-supported claim and checks whether it carries enough context. The locator check tests every emitted quote against the exact PDF page or Markdown block. All 324 JVP quotes passed that check. Evidence appeared outside the requested chapter for one required pair in Kraków and three in Richfield. The JVP reader covered 32/34 required pairs by meaning, compared with 34/34 for the PR. The evidence for generalization is limited to these three documents and one historical grant.

### Additional check on field-level evidence

The three PR fixtures have chapter-level reference answers. They have no reference key for the workspace's individual fields. As a separate diagnostic, we passed every original field citation from the V4 reader on those same forms to the PR's deterministic evidence-retention function. No citation-count cap or semantic judge was applied. It found the required passage in the expected chapter for 10/12 pairs in Harbor Point, 3/10 in Kraków and 3/12 in Richfield. These figures refer to the V4 field-reader experiment. The independently measured scores of 12/12, 9/10 and 11/12 above apply to the chapter reader. Field-level precision and recall outside Krosno remain unmeasured.

### Local experiments after the provider limit

#### What applicants now see at a citation

The registered-field reader can display a contiguous table header, list introduction or governing sentence alongside the original quoted words. A replay through the product entry point produced the same 120 proposals and all 401 original quote appearances, with the same answers, support levels and locations. The institutional, local and low-emission plans gained context at 8, 12 and 10 appearances respectively (28 distinct citations overall). The official Krosno scorer accepted the identical input hash for its saved V5 judgments. This yielded 14/23 precision and 14/22 recall on the primary fields, and 3/7 and 3/8 on the 11 provisional fields. File classification was 3/3. The pilot thresholds for precision and recall remain unmet.

On the three PR documents we took identical frozen V4 field answers and their citations. In both arms we kept at most twenty citations per chapter, in the same order, and ran the PR's deterministic required-passage check. Showing the surrounding source text retained 10/12 required pairs in Harbor Point (previously 10/12), 3/10 in Kraków (previously 3/10) and 5/12 in Richfield (previously 3/12). All 110 contextual citations were exact substrings at their recorded locations. This comparison measures the evidence a reviewer can see.

#### Does the field answer actually convey the required fact?

An independent reviewer mapped the 34 mandatory fact–chapter pairs from the PR to the unfilled application forms before seeing product output. The forms explicitly requested 23 of those pairs. A second reviewer scored anonymous packets for whether the answer to a matching field conveyed the fact with a quotation at the expected source location. Cases without eligible locations received zero credit. Both readers saw the same documents and blank forms.

| Positive-only field coverage | Harbor Point | Kraków | Richfield | Total |
| --- | ---: | ---: | ---: | ---: |
| Frozen V4 field reader | 8/11 | 3/8 | 3/4 | 14/23 |
| Release path with local review model | 8/11 | 4/8 | 3/4 | 15/23 |

The second run reused exact recorded primary readings and used local `qwen3:8b` for previously unseen review requests. One invalid Harbor Point review used the application's normal fallback. The blind adjudicator was an agent. This diagnostic has no reference set for unwanted field answers and cannot establish precision or the production-model score. The audit records the mapping of all 34 pairs, fixture hashes, both judgments for each mapped pair and the reasons for disagreements. [Field audit](field-audit.json)

#### Where the Krosno reader loses evidence

The unfiltered set of 1,456 source-verified contributions contained an allowed file and physical page for each of the 22 primary and eight provisional expected findings. This is a location-only upper bound. A local cross-source selection pass could qualify at most 12/22 primary findings after applying the required support level and location. Splitting full narrative answers from their partial components could qualify at most 15/22 after accounting for previous judgments on identical evidence. Neither experiment met the pilot thresholds. The next bottleneck is selecting evidence that answers the precise field at the correct support level.

On the same 20 citation-eligible Krosno V3 decisions, a local 8B judge agreed with the official judge on 14; a local 27B judge agreed on 17. All three disagreements for the 27B judge were extra positive judgments. Neither substitute was used for the product scores. A further form-only policy generated by the 27B model left suitable evidence at the reference location and support level for only 14/22 expected primary findings even before a meaning check. It was discarded.

## Cost and audit trail

The experiment meter booked **USD 67.035929 of the USD 80.00 limit** across 1,673 requests, including controls, retries, grading and exploratory variants. At the snapshot, 1,665 requests returned success, eight were denied before billing and no reservations remained open. This figure covers the experiment meter only.

The follow-up used stored provider responses, local models and offline scoring and added USD 0 in provider charges. The project's OpenRouter key reported USD 0 remaining, leaving USD 12.964071 of the authorized testing budget unused.

The local audit inputs under `output/extraction-generalization-20261127/` are `v3/krosno/scores.json`, `v5/krosno/scores.json`, the paired `pr-native` and `context-native` per-document `score.json` and `selected.json` files, and `calls.jsonl` (latest entry per request ID).
