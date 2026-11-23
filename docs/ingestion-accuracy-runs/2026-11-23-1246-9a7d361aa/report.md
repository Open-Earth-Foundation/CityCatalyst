# PDF benchmark run 2026-11-23 12:46 UTC (rescore)

- Commit: `9a7d361aa` on `david/benchmark-subsector-scoring` (dirty working tree)
- Extraction model: openai/gpt-5.6-luna; reasoning effort: provider default; OCR model: mistral-ocr-latest
- Prompt hash: fa433ff5842e
- Input representation: ocr-markdown
- Test-set version: ff8d56a46d96; scorer version: 3
- Attempts per case: 3
- Rescored from the run of 2026-11-19 03:36 UTC (`c5dec265a`) with the current scorer and answer keys; no OCR or LLM call was made
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
| C-025 | validated | n/a | 0/3 | n/a | n/a | n/a | n/a | 0/0 | n/a | n/a | n/a | 0 | zero_rows 3 | $0.127 | 193k / 3k | ocr 20 s, extraction 32 s, import n/a | n/a |

Estimated cost of this run: $0.127

## Notes

- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: none
- Cases where `textTables` is unknown: none
- Cases whose application total is off but would be within tolerance after removing the GPC-excluded references the app does not flag yet (CC-1201): none
