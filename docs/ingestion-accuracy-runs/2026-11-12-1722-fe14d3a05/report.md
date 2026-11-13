# PDF benchmark run 2026-11-12 17:22 UTC

- Commit: `fe14d3a05` on `david/cc-1124-build-a-reusable-pdf-extraction-benchmark`
- Extraction model: openai/gpt-5.6-luna; reasoning effort: provider default; OCR model: mistral-ocr-latest
- Prompt hash: fa433ff5842e
- Input representation: ocr-markdown
- Test-set version: 22fabc1d9bb8; scorer version: 2
- Attempts per case: 3
- Selection: C-004, C-005, C-006, C-007a, C-007b, C-007s, C-008, C-009, C-010, C-013, C-014, C-015, C-016, C-017, C-018, C-019, C-020, C-021, C-022, C-023, C-024, C-025, C-027, C-028, C-029, C-030, C-031
- MLflow: https://mlflow-dev.openearth.dev/#/experiments/12/runs/2f2f7efc875d4ef2ae5c802e35cd1f5d

## Block: validated

- 22 of 22 cases in this run
- Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count); cases with totals within tolerance: 8
- Recall over scored attempts only: n/a (0 cases counted)
- Provisional recall, cases whose `textTables` is unknown (failed attempts count as 0): 64% (17 cases counted)
- Attempts passing: 45%
- Attempts 10x or more off the expected total: 7
- Wrong totals that carried a warning: 0%
- Precision 76%, value accuracy 78%, classification accuracy 92% (means over 15 cases scored row by row, scored attempts only)
- Notation keys recovered: 78 of 125; cases that stored a distractor value: 5

## Block: held-out

- 5 of 5 cases in this run
- Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count); cases with totals within tolerance: 1
- Recall over scored attempts only: n/a (0 cases counted)
- Provisional recall, cases whose `textTables` is unknown (failed attempts count as 0): 51% (5 cases counted)
- Attempts passing: 33%
- Attempts 10x or more off the expected total: 3
- Wrong totals that carried a warning: 0%
- Precision 55%, value accuracy 58%, classification accuracy 99% (means over 5 cases scored row by row, scored attempts only)
- Notation keys recovered: 25 of 27; cases that stored a distractor value: 0

## Guardrails

- 10x guardrail: 10 attempts with a stored total 10x or more off the expected total
- Warnings: none

## Regressions against the baseline

| Case | Verdict | Reasons |
| --- | --- | --- |
| C-004 | ok | no baseline |
| C-005 | error | error: 1 attempt(s) failed; no baseline |
| C-006 | ok | no baseline |
| C-007a | ok | no baseline |
| C-007b | ok | no baseline |
| C-007s | ok | no baseline |
| C-008 | ok | no baseline |
| C-009 | error | error: 1 attempt(s) failed; no baseline |
| C-010 | ok | no baseline |
| C-013 | ok | no baseline |
| C-014 | ok | no baseline |
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
| C-025 | error | error: 3 attempt(s) failed; no baseline |
| C-027 | ok | no baseline |
| C-028 | ok | no baseline |
| C-029 | ok | no baseline |
| C-030 | ok | no baseline |
| C-031 | ok | no baseline |

## Change from the baseline

No case in this run has a baseline to compare with.

## Failure modes

- approve_error: 1
- zero_rows: 7
- truncated: 3

## Per case

Recall counts failed attempts as 0. Precision, accuracies and distractors stored are means over the scored attempts; notation keys are those of the first scored attempt. Runtime is summed over the attempts.

| Case | Block | Verdict | Attempts passed | Recall | Precision | Value acc. | Class. acc. | Notation keys | Distractors stored | Total within tolerance | 10x | Failure modes | Cost | Tokens in / out | Runtime by stage | Tolerance source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-004 | validated | ok | 0/3 | 28% | 27% | 31% | 45% | 0/0 | 0 | no | 2 | none | $0.378 | 497k / 82k | ocr 27 s, extraction 407 s, import 5 s | legacy |
| C-005 | validated | error | 0/3 | 0% | 0% | 0% | n/a | 0/2 | 0 | no | 1 | approve_error 1 | $0.556 | 748k / 59k | ocr 48 s, extraction 446 s, import 5 s | legacy |
| C-006 | validated | ok | 0/3 | n/a | n/a | n/a | n/a | 0/0 | 0.3 | no | 0 | none | $0.702 | 687k / 180k | ocr 37 s, extraction 609 s, import 5 s | legacy |
| C-007a | validated | ok | 3/3 | 100% | 100% | 100% | 100% | 0/0 | 0 | yes | 0 | none | $0.193 | 229k / 37k | ocr 30 s, extraction 187 s, import 5 s | legacy |
| C-007b | validated | ok | 3/3 | 100% | 100% | 100% | 100% | 0/0 | 0 | yes | 0 | none | $0.197 | 236k / 40k | ocr 28 s, extraction 184 s, import 5 s | legacy |
| C-007s | validated | ok | 3/3 | 100% | 100% | 100% | 100% | 0/0 | 0 | yes | 0 | none | $0.186 | 221k / 33k | ocr 30 s, extraction 156 s, import 5 s | legacy |
| C-008 | validated | ok | 3/3 | 100% | 100% | 100% | 100% | 21/23 | 0 | yes | 0 | none | $0.576 | 825k / 58k | ocr 30 s, extraction 339 s, import 5 s | legacy |
| C-009 | validated | error | 0/3 | 0% | 0% | 0% | n/a | 0/5 | 0 | no | 0 | zero_rows 1 | $0.151 | 167k / 8k | ocr 28 s, extraction 100 s, import 3 s | legacy |
| C-010 | validated | ok | 3/3 | 100% | 100% | 100% | 100% | 0/0 | 0 | yes | 0 | none | $0.274 | 241k / 13k | ocr 35 s, extraction 94 s, import 5 s | legacy |
| C-013 | validated | ok | 0/3 | 61% | 100% | 100% | 100% | 22/24 | 0 | no | 1 | none | $0.446 | 529k / 54k | ocr 37 s, extraction 183 s, import 5 s | legacy |
| C-014 | validated | ok | 3/3 | 91% | 91% | 95% | 95% | 30/32 | 0 | yes | 0 | none | $0.045 | 28k / 28k | ocr 31 s, extraction 162 s, import 7 s | legacy |
| C-015 | validated | ok | 2/3 | 96% | 96% | 99% | 98% | 0/1 | 0 | no | 0 | none | $0.616 | 813k / 88k | ocr 35 s, extraction 369 s, import 5 s | legacy |
| C-016 | validated | ok | 3/3 | 90% | 94% | 94% | 100% | 5/9 | 4 | yes | 0 | none | $0.440 | 498k / 69k | ocr 35 s, extraction 274 s, import 32 s | legacy |
| C-017 | validated | ok | 0/3 | 31% | 56% | 59% | 67% | 0/26 | 3 | no | 0 | none | $0.537 | 770k / 90k | ocr 31 s, extraction 260 s, import 12 s | legacy |
| C-018 | validated | ok | 0/3 | 92% | 92% | 92% | 100% | 0/3 | 1 | no | 0 | none | $0.345 | 341k / 101k | ocr 27 s, extraction 295 s, import 5 s | legacy |
| C-019 | validated | error | 0/3 | 0% | n/a | n/a | n/a | 0/0 | n/a | no | 3 | truncated 3 | $2.50 | 1698k / 1298k | ocr 57 s, extraction 2531 s, import 5 s | n/a |
| C-020 | validated | error | 0/3 | 0% | n/a | n/a | n/a | 0/0 | n/a | n/a | 0 | zero_rows 3 | $0.246 | 372k / 3k | ocr 25 s, extraction 53 s, import n/a | n/a |
| C-021 | validated | ok | 3/3 | 91% | 91% | 100% | 91% | 0/0 | 0 | yes | 0 | none | $0.547 | 593k / 17k | ocr 35 s, extraction 104 s, import 5 s | legacy |
| C-022 | validated | ok | 2/3 | n/a | n/a | n/a | n/a | 0/0 | 0 | no | 0 | none | $0.401 | 615k / 71k | ocr 31 s, extraction 243 s, import 5 s | legacy |
| C-023 | validated | ok | 1/3 | n/a | n/a | n/a | n/a | 0/0 | 0 | no | 0 | none | $0.058 | 99k / 12k | ocr 19 s, extraction 69 s, import 5 s | legacy |
| C-024 | validated | ok | 1/3 | n/a | n/a | n/a | n/a | 0/0 | 0.7 | no | 0 | none | $0.114 | 173k / 27k | ocr 17 s, extraction 81 s, import 5 s | legacy |
| C-025 | validated | error | 0/3 | n/a | n/a | n/a | n/a | 0/0 | n/a | n/a | 0 | zero_rows 3 | $0.127 | 193k / 4k | ocr 28 s, extraction 45 s, import n/a | n/a |
| C-027 | held-out | ok | 0/3 | 9% | 7% | 9% | 100% | 0/0 | 0 | no | 0 | none | $0.171 | 188k / 11k | ocr 26 s, extraction 83 s, import 5 s | legacy |
| C-028 | held-out | ok | 0/3 | 0% | 0% | 0% | n/a | 0/0 | 0 | no | 3 | none | $0.567 | 581k / 170k | ocr 31 s, extraction 423 s, import 6 s | legacy |
| C-029 | held-out | ok | 2/3 | 98% | 98% | 100% | 98% | 0/0 | 0 | no | 0 | none | $0.502 | 656k / 59k | ocr 26 s, extraction 190 s, import 5 s | legacy |
| C-030 | held-out | ok | 3/3 | 96% | 96% | 100% | 96% | 25/27 | 0 | yes | 0 | none | $0.850 | 742k / 34k | ocr 42 s, extraction 243 s, import 5 s | legacy |
| C-031 | held-out | ok | 0/3 | 52% | 73% | 81% | 100% | 0/0 | 0 | no | 0 | none | $0.594 | 864k / 91k | ocr 29 s, extraction 311 s, import 5 s | legacy |

Estimated cost of this run: $12.32

## Notes

- Token and cost figures corrected on 13 Nov 2026. The harness at `fe14d3a05` counted LLM usage once per context created so far, so cases C-014..C-023 (second group of `--all`) were counted twice and C-024..C-031 (third group) three times. The stored usage was divided by its group number and the costs recomputed (fixed in #3416, `f6fe7491f`). Scores are unchanged. The MLflow run still shows the uncorrected token and cost metrics.
- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: C-004, C-005, C-006, C-007a, C-007b, C-007s, C-008, C-009, C-010, C-013, C-014, C-015, C-016, C-017, C-018, C-021, C-022, C-023, C-024, C-027, C-028, C-029, C-030, C-031
- Cases where `textTables` is unknown: C-004, C-005, C-007a, C-007b, C-007s, C-008, C-009, C-010, C-013, C-014, C-015, C-016, C-017, C-018, C-019, C-020, C-021, C-027, C-028, C-029, C-030, C-031
- Cases whose application total is off but would be within tolerance after removing the GPC-excluded references the app does not flag yet (CC-1201): none
- Not recorded in the baseline: C-005 (approve_error)
- Held rows included automatically at approve, whatever their issue (scores measure extraction, not a reviewed import): C-004 (2), C-017 (1), C-027 (1), C-028 (6), C-030 (2)
