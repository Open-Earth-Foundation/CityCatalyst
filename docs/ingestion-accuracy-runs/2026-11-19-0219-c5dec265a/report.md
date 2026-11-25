# PDF benchmark run 2026-11-19 02:19 UTC

- Commit: `c5dec265a` on `david/cc-1295-benchmark-external-document-extraction`
- Extraction model: openai/gpt-5.6-luna; reasoning effort: provider default; OCR model: mistral-ocr-latest
- Prompt hash: fa433ff5842e
- Input representation: ocr-markdown
- Test-set version: 9cf70a8cd3d9; scorer version: 2
- Attempts per case: 3
- Selection: C-015, C-016, C-017, C-018, C-019, C-020, C-021, C-022, C-023, C-024
- MLflow: MLflow skipped (--no-mlflow)

## Block: validated

- 10 of 22 cases in this run
- Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count); cases with totals within tolerance: 3
- Recall over scored attempts only: n/a (0 cases counted)
- Provisional recall, cases whose `textTables` is unknown (failed attempts count as 0): 54% (7 cases counted)
- Attempts passing: 40%
- Attempts 10x or more off the expected total: 3
- Wrong totals that carried a warning: 0%
- Precision 82%, value accuracy 85%, classification accuracy 89% (means over 5 cases scored row by row, scored attempts only)
- Notation keys recovered: 10 of 39; cases that stored a distractor value: 4

## Guardrails

- 10x guardrail: 3 attempts with a stored total 10x or more off the expected total
- Warnings: none

## Regressions against the baseline

| Case | Verdict | Reasons |
| --- | --- | --- |
| C-015 | ok | no baseline |
| C-016 | ok | no baseline |
| C-017 | ok | no baseline |
| C-018 | ok | no baseline |
| C-019 | error | error: 3 attempt(s) failed; no baseline |
| C-020 | error | error: 3 attempt(s) failed; no baseline |
| C-021 | ok | no baseline |
| C-022 | ok | no baseline |
| C-023 | ok | no baseline |
| C-024 | ok | no baseline |

## Change from the baseline

No case in this run has a baseline to compare with.

## Failure modes

- truncated: 3
- zero_rows: 3

## Per case

Recall counts failed attempts as 0. Precision, accuracies and distractors stored are means over the scored attempts; notation keys are those of the first scored attempt. Runtime is summed over the attempts.

| Case | Block | Verdict | Attempts passed | Recall | Precision | Value acc. | Class. acc. | Notation keys | Distractors stored | Total within tolerance | 10x | Failure modes | Cost | Tokens in / out | Runtime by stage | Tolerance source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | validated | ok | 3/3 | 99% | 99% | 100% | 99% | 0/1 | 0 | yes | 0 | none | $0.613 | 806k / 87k | ocr 30 s, extraction 290 s, import 5 s | legacy |
| C-016 | validated | ok | 3/3 | 100% | 100% | 100% | 100% | 9/9 | 4 | yes | 0 | none | $0.425 | 498k / 56k | ocr 31 s, extraction 251 s, import 5 s | legacy |
| C-017 | validated | ok | 0/3 | 32% | 58% | 62% | 70% | 0/26 | 3 | no | 0 | none | $0.532 | 778k / 84k | ocr 25 s, extraction 234 s, import 5 s | legacy |
| C-018 | validated | ok | 0/3 | 69% | 70% | 75% | 89% | 1/3 | 2 | no | 0 | none | $0.353 | 333k / 109k | ocr 22 s, extraction 337 s, import 5 s | legacy |
| C-019 | validated | error | 0/3 | 0% | n/a | n/a | n/a | 0/0 | n/a | no | 3 | truncated 3 | $2.14 | 1519k / 1031k | ocr 42 s, extraction 2460 s, import 5 s | n/a |
| C-020 | validated | error | 0/3 | 0% | n/a | n/a | n/a | 0/0 | n/a | n/a | 0 | zero_rows 3 | $0.246 | 373k / 3k | ocr 23 s, extraction 32 s, import n/a | n/a |
| C-021 | validated | ok | 2/3 | 79% | 81% | 89% | 89% | 0/0 | 0 | no | 0 | none | $0.564 | 641k / 23k | ocr 29 s, extraction 123 s, import 5 s | legacy |
| C-022 | validated | ok | 3/3 | n/a | n/a | n/a | n/a | 0/0 | 0 | yes | 0 | none | $0.396 | 606k / 69k | ocr 29 s, extraction 261 s, import 5 s | legacy |
| C-023 | validated | ok | 0/3 | n/a | n/a | n/a | n/a | 0/0 | 0 | no | 0 | none | $0.052 | 91k / 8k | ocr 17 s, extraction 53 s, import 5 s | legacy |
| C-024 | validated | ok | 1/3 | n/a | n/a | n/a | n/a | 0/0 | 0.7 | no | 0 | none | $0.107 | 159k / 23k | ocr 16 s, extraction 77 s, import 5 s | legacy |

Estimated cost of this run: $5.43

## Notes

- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: C-015, C-016, C-017, C-018, C-021, C-022, C-023, C-024
- Cases where `textTables` is unknown: C-015, C-016, C-017, C-018, C-019, C-020, C-021
- Cases whose application total is off but would be within tolerance after removing the GPC-excluded references the app does not flag yet (CC-1201): none
