# PDF benchmark run 2026-11-23 12:45 UTC (exploratory) (rescore)

- Commit: `9a7d361aa` on `david/benchmark-subsector-scoring` (dirty working tree)
- Pipeline: precomputed (originals-v2/round2)
- Exploratory: pipeline
- Extraction model: n/a (precomputed pipeline)
- Prompt hash: n/a (precomputed pipeline)
- Input representation: n/a (precomputed pipeline)
- Test-set version: c39dd99afef0; scorer version: 3
- Attempts per case: 3
- Rescored from the run of 2026-11-20 12:40 UTC (`df11e0909`) with the current scorer and answer keys; no OCR or LLM call was made
- Selection: C-022, C-023, C-024, C-025
- MLflow: not logged (rescore)

## Block: validated

- 4 of 22 cases in this run
- Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count); cases with totals within tolerance: 1
- Recall over scored attempts only: n/a (0 cases counted)
- Attempts passing: 25%
- Attempts 10x or more off the expected total: 0
- Wrong totals that carried a warning: 0%
- Precision n/a, value accuracy n/a, classification accuracy n/a (means over 0 cases scored row by row, scored attempts only)
- Notation keys recovered: 0 of 0; cases that stored a distractor value: 0
- Rows stored without scope (subsector ref, scope null): 11 (data quality, not scored)

## Guardrails

- 10x guardrail: 0 attempts with a stored total 10x or more off the expected total
- Warnings: none

## Regressions against the baseline

No baseline comparison in this run.

## Change from the baseline

No case in this run has a baseline to compare with.

## Failure modes

- zero_rows: 3

## Per case

Recall counts failed attempts as 0. Precision, accuracies and distractors stored are means over the scored attempts; notation keys are those of the first scored attempt. Runtime is summed over the attempts.

| Case | Block | Verdict | Attempts passed | Recall | Precision | Value acc. | Class. acc. | Notation keys | Distractors stored | Unscoped rows | Total within tolerance | 10x | Failure modes | Cost | Tokens in / out | Runtime by stage | Tolerance source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-022 | validated | n/a | 0/3 | n/a | n/a | n/a | n/a | 0/0 | 0 | 0 | no | 0 | none | n/a | 5004k / 40k | ocr n/a, extraction n/a, import 5 s | legacy |
| C-023 | validated | n/a | 0/3 | n/a | n/a | n/a | n/a | 0/0 | 0 | 2 | no | 0 | none | n/a | 2022k / 28k | ocr n/a, extraction n/a, import 5 s | legacy |
| C-024 | validated | n/a | 3/3 | n/a | n/a | n/a | n/a | 0/0 | 0 | 9 | yes | 0 | none | n/a | 2669k / 35k | ocr n/a, extraction n/a, import 5 s | legacy |
| C-025 | validated | n/a | 0/3 | n/a | n/a | n/a | n/a | 0/0 | n/a | n/a | n/a | 0 | zero_rows 3 | n/a | 2077k / 23k | ocr n/a, extraction n/a, import n/a | n/a |

Estimated cost of this run: n/a

## Pipeline notes

What the pipeline reported for each attempt: facts about the envelope, not scored. Lost rows are the rows approve skipped, by import issue code; `unexplained` and `notSkipped` mark a mismatch between the rows approve skipped and the issues it reported.

| Case | Attempt | Execution status | Rows in envelope | Unknown row roles | Dropped rows | Lost rows | Reported totals (t) | Total basis / kind | Scope basis | Total inclusion | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-022 | 1 | completed | 19 | none | none | gpc-reference-unresolved 10, no-value-or-notation-key 2 | total 7333400, gross 7333400, net n/a, removals n/a | Gross community inventory for the municipality of Madrid, 2023: all reported direct emissions (scope 1) plus indirect grid-electricity generation (scope 2) and electricity transmission losses (scope 3... / gross | explicit 19 | included 19 | n/a (none) |
| C-022 | 2 | completed | 19 | none | none | gpc-parent-gap 2, gpc-reference-unresolved 8, no-value-or-notation-key 2 | total 7333400, gross 7333400, net n/a, removals n/a | Gross community emissions for the municipal territory of Madrid, 2023; not a corporate-operations inventory. The explicitly printed total is 7.333,4 kt CO2 equivalent (7,333,400 tCO2e), covering direc... / gross | explicit 17, combined 2 | included 19 | n/a (none) |
| C-022 | 3 | completed | 19 | none | none | gpc-parent-gap 2, gpc-reference-unresolved 7, no-value-or-notation-key 3 | total 7333400, gross 7333400, net n/a, removals n/a | Gross community inventory for the municipality of Madrid in 2023: all reported direct emissions (scope 1), plus grid-electricity generation (scope 2) and electricity transmission losses (scope 3); exc... / gross | explicit 15, combined 4 | included 19 | n/a (none) |
| C-023 | 1 | completed | 9 | none | none | gpc-reference-unresolved 6 | total 5923000, gross 5923000, net 5676000, removals -247000 | FY2023 Kyoto city-area community-wide gross greenhouse gas emissions, before forest, farmland and green-space removals. Table 1 explicitly reports actual emissions of 592.3 万トン-CO2 (5,923,000 tCO2e). ... / gross | combined 4, unknown 4, inferred 1 | included 8, excluded 1 | n/a (none) |
| C-023 | 2 | completed | 9 | none | none | gpc-reference-unresolved 7 | total 5923000, gross 5923000, net 5676000, removals -247000 | Fiscal year 2023, Kyoto City territory/community-wide gross greenhouse gas emissions, before forest, cropland and green-space absorption; not municipal corporate operations. Selected printed gross tot... / gross | combined 4, unknown 5 | included 8, excluded 1 | n/a (none) |
| C-023 | 3 | completed | 9 | none | none | gpc-reference-unresolved 7 | total 5923000, gross 5923000, net 5676000, removals -247000 | FY2023 community inventory for Kyoto city area (京都市域), gross emissions actually emitted, before forest/agricultural/green-space removals. Source unit 万トン-CO2 = 10,000 tonnes CO2e. Selected printed gro... / gross | combined 4, unknown 5 | included 8, excluded 1 | n/a (none) |
| C-024 | 1 | completed | 10 | none | none | no-value-or-notation-key 1 | total 4638344.86, gross 4638344.86, net n/a, removals n/a | Gross community-scale GHG emissions for Coimbatore City Municipal Corporation, for the report's 2019-20 inventory (also labelled 2019 in Table 2). Selected printed value: 46,38,344.86 tonnes of CO2e (... / gross | unknown 10 | included 10 | n/a (none) |
| C-024 | 2 | completed | 11 | none | none | no-value-or-notation-key 2 | total 4638344.86, gross 4638344.86, net n/a, removals n/a | Gross community-scale emissions for Coimbatore city, covering the reported stationary energy, transport and waste inventory in 2019-20 (labelled 2019 in Table 2), not municipal corporate operations. S... / gross | combined 3, unknown 8 | included 11 | n/a (none) |
| C-024 | 3 | completed | 11 | none | information 1 | no-value-or-notation-key 1 | total 4638344.86, gross 4638344.86, net n/a, removals n/a | Gross community-scale emissions for Coimbatore City Municipal Corporation, requested 2019 inventory identified in Table 2 as 2019 and elsewhere as 2019-20; calendar-year-only timing is not established... / gross | combined 3, unknown 8 | included 11 | n/a (none) |
| C-025 | 1 | completed | 0 | none | none | none | total 1788000, gross 1788000, net n/a, removals n/a | Gross community energy-related emissions for calendar year 2022 on the entire municipal territory of Münster under the report's BISKO inventory, covering private households, commerce/other services, i... / gross | none | none | n/a (none) |
| C-025 | 2 | completed | 0 | none | none | none | total 1788000, gross 1788000, net n/a, removals n/a | Gross community energy-related emissions for the entire Stadtgebiet Münster in 2022 under the report’s BISKO territorial energy-consumption accounting; not a municipal corporate inventory or an all-se... / gross | none | none | n/a (none) |
| C-025 | 3 | completed | 0 | none | none | none | total 1788000, gross 1788000, net n/a, removals n/a | 2022 annual community-wide energy-related emissions for the entire Stadtgebiet Münster under the territorial BISKO inventory, covering private households, commerce/other, industry and transport; not m... / gross | none | none | n/a (none) |

## Score variant: parent references

The standard score is the headline. The parent refs (Mirco) variant also scores the rows the pipeline gave as an unsplit I, II or III subsector (such as I.3) that approve dropped, and writes every such reference as `<ref>.x` (Mirco's `scoringReference`): it can match a key row written as that subsector or as `<ref>.x`, never an exact child row with a scope such as I.3.1. When the pipeline also gave the children of a parent reference and approve stored them, the variant counts that amount twice (see the last column); the standard score is unaffected. Recall counts failed attempts as 0; precision is the mean over the scored attempts; parent-reference rows are summed over the attempts.

| Block | Headline recall: standard | Headline recall: parent refs (Mirco) | Precision: standard | Precision: parent refs (Mirco) |
| --- | --- | --- | --- | --- |
| validated | n/a | n/a | n/a | n/a |

| Case | Block | Recall: standard | Recall: parent refs (Mirco) | Precision: standard | Precision: parent refs (Mirco) | Totals within tolerance: standard | Totals within tolerance: parent refs (Mirco) | Parent-reference rows added | Of which children were stored too |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-022 | validated | n/a | n/a | n/a | n/a | no | no | 4 | 4 |
| C-023 | validated | n/a | n/a | n/a | n/a | no | no | 0 | 0 |
| C-024 | validated | n/a | n/a | n/a | n/a | yes | yes | 3 | 0 |
| C-025 | validated | n/a | n/a | n/a | n/a | n/a | n/a | 0 | 0 |

## Notes

- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: C-022, C-023, C-024
- Cases where `textTables` is unknown: none
- Cases whose application total is off but would be within tolerance after removing the GPC-excluded references the app does not flag yet (CC-1201): none
