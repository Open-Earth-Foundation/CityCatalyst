# PDF benchmark run 2026-11-23 12:45 UTC (exploratory) (rescore)

- Commit: `9a7d361aa` on `david/benchmark-subsector-scoring` (dirty working tree)
- Pipeline: precomputed (originals-v2/round2)
- Exploratory: pipeline
- Extraction model: n/a (precomputed pipeline)
- Prompt hash: n/a (precomputed pipeline)
- Input representation: n/a (precomputed pipeline)
- Test-set version: ff8d56a46d96; scorer version: 3
- Attempts per case: 3
- Rescored from the run of 2026-11-19 02:11 UTC (`c5dec265a`) with the current scorer and answer keys; no OCR or LLM call was made
- Selection: C-025
- MLflow: not logged (rescore)

## Block: validated

- 1 of 22 cases in this run
- Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count); cases with totals within tolerance: 0
- Recall over scored attempts only: n/a (0 cases counted)
- Attempts passing: 0%
- Attempts 10x or more off the expected total: 0
- Wrong totals that carried a warning: n/a
- Precision n/a, value accuracy n/a, classification accuracy n/a (means over 0 cases scored row by row, scored attempts only)
- Notation keys recovered: 0 of 0; cases that stored a distractor value: 0
- Rows stored without scope (subsector ref, scope null): 0 (data quality, not scored)

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
| C-025 | validated | n/a | 0/3 | n/a | n/a | n/a | n/a | 0/0 | n/a | n/a | n/a | 0 | zero_rows 3 | n/a | 2077k / 23k | ocr n/a, extraction n/a, import n/a | n/a |

Estimated cost of this run: n/a

## Pipeline notes

What the pipeline reported for each attempt: facts about the envelope, not scored. Lost rows are the rows approve skipped, by import issue code; `unexplained` and `notSkipped` mark a mismatch between the rows approve skipped and the issues it reported.

| Case | Attempt | Execution status | Rows in envelope | Unknown row roles | Dropped rows | Lost rows | Reported totals (t) | Total basis / kind | Scope basis | Total inclusion | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
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
| C-025 | validated | n/a | n/a | n/a | n/a | n/a | n/a | 0 | 0 |

## Notes

- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: none
- Cases where `textTables` is unknown: none
- Cases whose application total is off but would be within tolerance after removing the GPC-excluded references the app does not flag yet (CC-1201): none
