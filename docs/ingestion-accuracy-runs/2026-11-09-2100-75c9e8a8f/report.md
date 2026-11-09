# PDF benchmark run 2026-11-09 21:00 UTC

- Commit: `75c9e8a8f` on `david/cc-1124-build-a-reusable-pdf-extraction-benchmark` (dirty working tree)
- Extraction model: openai/gpt-5.6-luna; reasoning effort: provider default; OCR model: mistral-ocr-latest
- Prompt hash: 3f1c1271e342
- Input representation: ocr-markdown
- Test-set version: 2103eec680cb
- Attempts per case: 3
- Selection: C-017, C-022, C-025, C-027, C-028, C-029, C-030, C-031
- MLflow: MLflow not configured

## Block: validated

- 3 of 22 cases in this run
- Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count); cases with totals within tolerance: 0
- Recall over scored attempts only: n/a (0 cases counted)
- Attempts passing: 11%
- Attempts 10x or more off the expected total: 1
- Wrong totals that carried a warning: 0%

## Block: held-out

- 5 of 5 cases in this run
- Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count); cases with totals within tolerance: 1
- Recall over scored attempts only: n/a (0 cases counted)
- Attempts passing: 33%
- Attempts 10x or more off the expected total: 3
- Wrong totals that carried a warning: 0%

## Guardrails

- 10x guardrail: 4 attempts with a stored total 10x or more off the expected total
- Warnings: none

## Regressions against the baseline

| Case | Verdict | Reasons |
| --- | --- | --- |
| C-017 | ok | no baseline |
| C-022 | ok | no baseline |
| C-025 | error | error: 3 attempt(s) failed; no baseline |
| C-027 | ok | no baseline |
| C-028 | ok | no baseline |
| C-029 | ok | no baseline |
| C-030 | ok | no baseline |
| C-031 | ok | no baseline |

## Failure modes

- zero_rows: 3

## Per case

Recall counts failed attempts as 0. Runtime is summed over the attempts.

| Case | Block | Verdict | Attempts passed | Recall | Total within tolerance | 10x | Failure modes | Cost | Tokens in / out | Runtime by stage | Tolerance source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-017 | validated | ok | 0/3 | 23% | no | 1 | none | $0.525 | 727k / 86k | ocr 31 s, extraction 322 s, import 5 s | legacy |
| C-022 | validated | ok | 1/3 | n/a | no | 0 | none | $0.385 | 569k / 66k | ocr 32 s, extraction 306 s, import 5 s | legacy |
| C-025 | validated | error | 0/3 | n/a | n/a | 0 | zero_rows 3 | $0.125 | 182k / 4k | ocr 24 s, extraction 59 s, import n/a | n/a |
| C-027 | held-out | ok | 0/3 | 9% | no | 0 | none | $0.169 | 177k / 11k | ocr 29 s, extraction 109 s, import 5 s | legacy |
| C-028 | held-out | ok | 0/3 | 0% | no | 3 | none | $0.548 | 545k / 161k | ocr 39 s, extraction 496 s, import 16 s | legacy |
| C-029 | held-out | ok | 2/3 | 84% | no | 0 | none | $0.506 | 652k / 63k | ocr 33 s, extraction 247 s, import 9 s | legacy |
| C-030 | held-out | ok | 3/3 | 100% | yes | 0 | none | $0.834 | 694k / 29k | ocr 45 s, extraction 238 s, import 5 s | legacy |
| C-031 | held-out | ok | 0/3 | 41% | no | 0 | none | $0.563 | 794k / 77k | ocr 31 s, extraction 328 s, import 5 s | legacy |

Estimated cost of this run: $3.66

## Notes

- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: C-017, C-022, C-027, C-028, C-029, C-030, C-031
- Cases where `textTables` is unknown: C-022, C-025
- Held rows included automatically at approve: C-022 (1), C-028 (7), C-029 (6), C-030 (2)
