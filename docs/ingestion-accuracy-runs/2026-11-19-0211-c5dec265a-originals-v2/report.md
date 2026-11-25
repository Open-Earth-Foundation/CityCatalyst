# PDF benchmark run 2026-11-19 02:11 UTC (exploratory)

- Commit: `c5dec265a` on `david/cc-1295-benchmark-external-document-extraction`
- Pipeline: precomputed (originals-v2/round2)
- Exploratory: pipeline
- Extraction model: n/a (precomputed pipeline)
- Prompt hash: n/a (precomputed pipeline)
- Input representation: n/a (precomputed pipeline)
- Test-set version: ff8d56a46d96; scorer version: 2
- Attempts per case: 3
- Selection: C-025
- MLflow: MLflow skipped (--no-mlflow)

## Block: validated

- 1 of 22 cases in this run
- Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count); cases with totals within tolerance: 0
- Recall over scored attempts only: n/a (0 cases counted)
- Attempts passing: 0%
- Attempts 10x or more off the expected total: 0
- Wrong totals that carried a warning: n/a
- Precision n/a, value accuracy n/a, classification accuracy n/a (means over 0 cases scored row by row, scored attempts only)
- Notation keys recovered: 0 of 0; cases that stored a distractor value: 0

## Guardrails

- 10x guardrail: 0 attempts with a stored total 10x or more off the expected total
- Warnings: none

## Regressions against the baseline

| Case | Verdict | Reasons |
| --- | --- | --- |
| C-025 | error | error: 3 attempt(s) failed; no baseline |

## Change from the baseline

No case in this run has a baseline to compare with.

## Failure modes

- zero_rows: 3

## Per case

Recall counts failed attempts as 0. Precision, accuracies and distractors stored are means over the scored attempts; notation keys are those of the first scored attempt. Runtime is summed over the attempts.

| Case | Block | Verdict | Attempts passed | Recall | Precision | Value acc. | Class. acc. | Notation keys | Distractors stored | Total within tolerance | 10x | Failure modes | Cost | Tokens in / out | Runtime by stage | Tolerance source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-025 | validated | error | 0/3 | n/a | n/a | n/a | n/a | 0/0 | n/a | n/a | 0 | zero_rows 3 | n/a | 0k / 0k | ocr n/a, extraction n/a, import n/a | n/a |

Estimated cost of this run: n/a

## Pipeline notes

What the pipeline reported for each attempt: facts about the envelope, not scored. Lost rows are the rows approve skipped, by import issue code; `unexplained` and `notSkipped` mark a mismatch between the rows approve skipped and the issues it reported.

| Case | Attempt | Execution status | Rows in envelope | Unknown row roles | Dropped rows | Lost rows | Reported totals (t) | Total basis / kind | Scope basis | Total inclusion | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-025 | 1 | completed | 0 | none | none | none | total 1788000, gross 1788000, net n/a, removals n/a | Gross community energy-related emissions for calendar year 2022 on the entire municipal territory of Münster under the report's BISKO inventory, covering private households, commerce/other services, industry and transport; not municipal corporate operations alone. Selected explicitly printed total: 1.788 kt CO₂ = 1,788,000 tonnes, also printed as 1.788.000 tonnes in Figure 5. Classified as gross from its energy-emissions boundary; the report does not use a printed gross/net pair. No reported 2022 removals or net total was found. Non-energy agricultural emissions are supplementary, excluded from BISKO, and the local agricultural series ends in 2021. Source labels the main total CO₂ rather than explicitly CO₂e; retain this qualification. The page 4 footnote states that the electricity factor is approximately half national and half local, so the stated territorial BISKO boundary must not be read as a GPC scope-1-only inventory. No all-sector GPC coverage is asserted. / gross | none | none | n/a (none) |
| C-025 | 2 | completed | 0 | none | none | none | total 1788000, gross 1788000, net n/a, removals n/a | Gross community energy-related emissions for the entire Stadtgebiet Münster in 2022 under the report’s BISKO territorial energy-consumption accounting; not a municipal corporate inventory or an all-sector GPC total. Printed as 1.788.000 Tonnen CO₂ in Figure 5 and 1.788 kt in the headline, normalized to 1788000 tonnes. Gross is the requested classification of the reported energy-emission total, which has no stated removal deduction; the report does not explicitly use a gross label. The electricity factor mixes national and local generation factors (page 4), so this is not a direct-emissions-only total. Non-energy agriculture is presented separately for years through 2021 and is outside the BISKO total. No separate 2022 removals or net total is printed. The source labels emissions CO₂ rather than explicitly CO₂e; other-gas coverage is not established. / gross | none | none | n/a (none) |
| C-025 | 3 | completed | 0 | none | none | none | total 1788000, gross 1788000, net n/a, removals n/a | 2022 annual community-wide energy-related emissions for the entire Stadtgebiet Münster under the territorial BISKO inventory, covering private households, commerce/other, industry and transport; not municipal corporate operations. Selected as gross within this reported energy boundary: the printed emissions sum has no removal deduction, although the report does not explicitly call it brutto. Figure 5 prints 1.788.000 Tonnen CO₂ (caption t/a); page 4 repeats 1.788 kt, with kt defined as 1,000 tonnes on page 3. The source calls these CO₂ emissions and does not explicitly establish CO₂e gas/GWP coverage. Page 4 states that the electricity factor blends national and local factors approximately equally. Non-energy agriculture is supplementary, excluded from BISKO, and the city agriculture series ends in 2021. No 2022 removal total or net alternative is printed. The 9.293.077 tonnes on page 10 is the remaining 2022 carbon budget, not annual emissions. No comprehensive all-sector gross total is asserted. / gross | none | none | n/a (none) |

## Score variant: parent references

The standard score is the headline. The parent refs (Mirco) variant also scores the rows the pipeline gave as an unsplit I, II or III subsector (such as I.3) that approve dropped, and writes every such reference as `<ref>.x` (Mirco's `scoringReference`): it can match a key row written as that subsector or as `<ref>.x`, never an exact child row with a scope such as I.3.1. When the pipeline also gave the children of a parent reference and approve stored them, the variant counts that amount twice (see the last column); the standard score is unaffected. Recall counts failed attempts as 0; precision is the mean over the scored attempts; parent-reference rows are summed over the attempts.

| Block | Headline recall: standard | Headline recall: parent refs (Mirco) | Precision: standard | Precision: parent refs (Mirco) |
| --- | --- | --- | --- | --- |
| validated | n/a | n/a | n/a | n/a |

| Case | Block | Recall: standard | Recall: parent refs (Mirco) | Precision: standard | Precision: parent refs (Mirco) | Totals within tolerance: standard | Totals within tolerance: parent refs (Mirco) | Parent-reference rows added | Of which children were stored too |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-025 | validated | n/a | n/a | n/a | n/a | n/a | n/a | 0 | 0 |

## Notes

- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: none
- Cases where `textTables` is unknown: none
- Cases whose application total is off but would be within tolerance after removing the GPC-excluded references the app does not flag yet (CC-1201): none
