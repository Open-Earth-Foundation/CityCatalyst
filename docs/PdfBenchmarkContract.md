# GHGI PDF Benchmark Contract

Ticket: [CC-1123](https://linear.app/openearth/issue/CC-1123/define-the-pdf-benchmark-contract-and-delivery-milestones)

This document defines how the accuracy of GHGI inventory extraction from PDFs is measured, what counts as a pass, and the delivery milestones. It covers unstructured PDF extraction only. Structured formats such as eCRF keep their own targets (CC-950).

**Status: draft.** Items marked **Agreed** were settled in the `#gcom-ds-ai-core-ingestion` thread of 3 Nov 2026. Items marked **Proposed** are the technical proposal and wait for a decision. Items marked **Open** need a named owner. Section 11 lists every open decision.

## 1. Roles

| Area | Owner |
|---|---|
| Technical proposal: key format, matching, reporting, tooling | David, with Cephas |
| PDF accuracy definition, target and tolerances | Stefania |
| PDFs and ground-truth answer keys | Product, coordinated by Stefania (through CC-951) |
| Shared scorer and structured-format targets | Cephas (CC-950) |

## 2. Test set

**Agreed**

- 27 cases replace the earlier "5 to 10 PDFs": 22 validated cases (C-004 to C-025) and 5 held-out cases (C-027 to C-031).
- C-022 to C-025 are not GPC layouts and are scored on the total only. Seattle is also scored on the total only.
- C-027 and C-028 were reviewed row by row. The keys for C-029 to C-031 are complete, and Stefania verified a sample of about 20 rows of each. No full review is needed unless a result points to a disputed row.
- Long Beach (C-028) and Dunedin (C-031) are no longer fully held out, because their key reviews fed the extraction rules. Reports must say so.

**Proposed**

- Masterton (PDF and key now exist) joins the held-out block, since no extraction rules came from it.
- Every run records the test-set version. A key change creates a new version, and earlier runs are rescored before any comparison.

## 3. Answer-key format

**Agreed**, as implemented in the benchmark harness on PR #3317 (`app/tests/ingestion-accuracy/score.ts`).

- File record: case id, city, country, year, file name, expected total, row tolerance, total tolerance.
- Key row: description, year, value, GPC reference, scope, row type, notation key, scored flag, note.
- Distractors: numbers that must not be stored, such as other years, totals, offsets and other inventories.

**Proposed**

- Add an optional `sourcePage` to key rows for new keys, so values can be traced to the source. Existing keys are not backfilled. CC-1128 (source evidence) needs this later.

## 4. Expected total

**Agreed.** The expected total is what CityCatalyst shows after a perfect import.

- BASIC+ rows count: scope 3 of energy and transport, IPPU and AFOLU.
- Removals count.
- Left out: I.4.4, III.x.3, VI.1 and CO2(b).
- The app currently excludes only I.4.4 (CC-1201). The scorer applies the full exclusion list until CC-1201 lands.

## 5. Row matching

**Agreed**

- A stored row is one (GPC reference, scope) group, because the app stores one value per pair.
- A stored row matches when the reference and scope are equal and the value is within the row tolerance (section 8).
- A key reference without a scope split, such as `I.1`, matches any child reference (`I.1.x`).
- Several key rows with the same reference and scope are compared as one sum.
- Value rows with an explicit `Scored = No` are not measured. A blank cell counts as scored.
- A zero Value row matches a stored zero or no stored row.
- Values marked "not in total" must be stored but stay out of the total.
- Notation keys are scored only when marked.

These rules differ from the structured path, which requires the same reference, scope and value. They belong in a per-format profile on the shared scorer (section 10).

## 6. Metrics and pass rules

**Agreed**

- **Headline metric:** row recall with failed runs counted as 0, shown next to the number of cases with the total within tolerance.
- Validated and held-out cases are reported as separate blocks, never merged. The target is judged on the validated block and held-out is always shown beside it.
- **Stability:** a case passes only when all 3 runs pass.
- **Unit guardrail:** a case fails when its stored total is off by a factor of 10 or more, whatever its recall. No run may be off by 10x or more unless the flow warns the user.
- **Warning metric:** of the runs with a wrong total, the share that showed the user a warning. Target: all of them.

**Proposed**

- Also report the mean over row-scored cases and the share of runs that pass.
- Report the count of runs off by 10x or more as its own line. The current report uses a factor of 50, so the harness must change.
- Each run records commit, model, reasoning effort, prompt version, input representation, runtime, tokens and cost.

Other metrics already computed by the harness (row precision, value accuracy, classification accuracy, notation keys, distractors stored) stay in the report. They are not part of the target.

## 7. Target

**Agreed (Stefania)**

- 90% row recall, judged on the validated cases whose PDFs have text tables.
- Charts-only and percentage-only reports, for example Toronto 2019 and Münster, are reported but do not count toward the target.

**Open:** the date. Stefania wrote end of November. The roadmap and the ticket say end of January 2027. See section 11.

**Baseline** (31 Oct 2026, `openai/gpt-5.6-luna`, local stack, before the eligible-case filter and before CC-1191 and CC-1201):

| Block | Row recall | Value accuracy | Totals within tolerance |
|---|---|---|---|
| Validated, 22 cases | 68% (64% counting failed runs as 0) | 72% (68%) | 8 of 22 cases, 26 of 66 runs |
| Held-out, 5 cases | 28% | 35% | 0 of 5 cases, 3 of 15 runs |

10 of 76 finished runs had a total off by a factor of 50 or more.

## 8. Tolerances

**Agreed (Stefania).** One rule, applied per file.

- **Rows:** half a unit of the last printed digit, converted to tonnes. Examples: ±0.5 t for whole tonnes, ±5,000 t for MMT with 2 decimals.
- **Total:** the precision of the printed total.
- **No percentage floor.** The -0.1% in Madrid and the +0.1% in Santiago are real errors.

Existing keys store a tolerance per file. Changing them to this rule can change scores, so earlier runs are rescored before comparison.

## 9. Ground-truth plan

| Item | Owner | Date | Status |
|---|---|---|---|
| 27-case test set | Stefania | Done | Agreed |
| Masterton PDF and key | Stefania | Done | Added to the sheet; not loaded in the harness yet |
| Full review of C-029 to C-031 | None | Not needed | Only if a result points to a disputed row |
| Real scanned GHGI PDFs | Open | Open | Only a synthetic Miami scan exists |
| Flag which of the 283 C40 URLs have no text layer | David | Open | Small script, separate from the harness (Stefania's request) |
| Access and confidentiality gaps | Open | Open | Not answered yet |

Coordinate through CC-951. No separate developer-owned dataset.

## 10. Tooling

**Agreed (with Cephas)**

- One scorer and one report shape: file, path, metrics, pass or fail.
- Targets stay separate. Structured imports keep the CC-950 bars (about 99% recall and precision, 100% value accuracy). PDF uses the target in section 7.
- Matching rules go in a per-format profile on the shared scorer, not in a second report.
- CC-1124 is the home of the harness and owns the merge path. PR #3317 is a measurement vehicle and does not merge as-is.
- CC-950 stays the structured runner and calls the same scorer. It does not host the PDF OCR harness.

**Changes CC-1124 must make:** per-format profile, the tolerance rule of section 8, the 10x count, an eligible-case filter, and the warning metric.

## 11. Delivery plan

The end-of-November date is Stefania's. The roadmap date is end of January.

| Milestone | When | Content | Depends on |
|---|---|---|---|
| Measurement agreement | Open | This contract agreed and linked from CC-1123 | Decisions below |
| First PDF fixes | November | PR #3364 (model, truncation guard), PR #3289 (CC-1008), CC-1163 (unit errors), CC-1201 (total), CC-1202 (0-row imports) | Reviews and merges |
| Warning in the flow | To confirm | Warn on unreliable results and measure it in the harness | Warning rules; no ticket yet |
| Model comparison | November | CC-1125, then the with/without-rules experiment | CC-1124 |
| PDF target | End of November or end of January | 90% row recall on eligible validated cases | Date decision |
| Accuracy checkpoint | 31 Dec 2026 | CC-1130 report against the agreed target | CC-1124, CC-1125 |

Dependencies on the adapter work (from Cephas):

- CC-1126: CC-991 is merged to `develop` and in QA (PR #3360).
- CC-1128: CC-990 is still in progress.
- CC-1129: reported as done and ready to merge (PR #3370). The question was about CC-956, so this needs confirming.

Effort estimates and the date the plugin interface is stable are not given yet.

## 12. Open decisions

| # | Decision | Owner | Why it matters |
|---|---|---|---|
| 1 | Target date: end of November or end of January | Stefania | Sets the whole delivery plan |
| 2 | Which validated cases count as "text tables"; whether total-only cases count toward the target | Stefania | The target is not computable without it |
| 3 | What counts as an unreliable result (proposal: total off beyond tolerance, off by 10x or more, or 0 rows stored) | Stefania | Needed to measure warnings and the guardrail |
| 4 | Masterton in the held-out block | Stefania | Changes the held-out numbers |
| 5 | Access and confidentiality limits on the PDFs | Stefania | Required by the ticket |
| 6 | Owner and date for real scanned PDFs | Stefania | Scan accuracy is unknown today |
| 7 | Ticket for targeted questions to the user (unit, city vs region column, fiscal year, BASIC/BASIC+) | Stefania | Offered in the thread |
| 8 | Effort estimates and plugin-stable date | Cephas | Needed for the delivery plan |
| 9 | Status of CC-956 | Cephas | CC-1129 depends on it |
| 10 | `sourcePage` in new keys | David proposes, Stefania and Cephas confirm | Ticket asks for source references |
| 11 | Ticket for the warning feature in the flow | David and Stefania | No ticket exists; the guardrail cannot be met without it |

## 13. Risks

- The target is far from today: 64% row recall on all validated cases, before the eligible-case filter.
- The unit guardrail needs a warning in the flow, which does not exist yet.
- The target may be measured on a model that later changes. Fix the model with CC-1125 before the checkpoint, or state the difference.
- Test and prod model configuration is not confirmed.
- Held-out has 5 cases, so one case moves the mean a lot, and two of them are partly used.
- Real scanned PDFs are missing, so scan accuracy is unknown.
