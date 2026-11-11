# PDF benchmark run 2026-11-09 18:45 UTC

- Commit: `c0b125fe5` on `david/cc-1124-build-a-reusable-pdf-extraction-benchmark`
- Extraction model: openai/gpt-5.6-luna; reasoning effort: provider default; OCR model: mistral-ocr-latest
- Prompt hash: 3f1c1271e342
- Input representation: ocr-markdown
- Test-set version: 9cf70a8cd3d9
- Attempts per case: 3
- Selection: C-015, C-016, C-017, C-018, C-019, C-020, C-021, C-022, C-023, C-024
- MLflow: MLflow not configured

## Block: validated

- 10 of 22 cases in this run
- Headline recall (failed attempts count as 0): n/a; cases with totals within tolerance: 2
- Recall over scored attempts only: n/a
- Attempts passing: 23%
- Attempts 10x or more off the expected total: 4
- Wrong totals that carried a warning: 0%

## Guardrails

- 10x guardrail: 4 attempts with a stored total 10x or more off the expected total
- Warnings: none

## Regressions against the baseline

| Case | Verdict | Reasons |
| --- | --- | --- |
| C-015 | ok | no baseline |
| C-016 | ok | no baseline |
| C-017 | error | error: 2 attempt(s) failed; no baseline |
| C-018 | ok | no baseline |
| C-019 | ok | no baseline |
| C-020 | error | error: 3 attempt(s) failed; no baseline |
| C-021 | ok | no baseline |
| C-022 | error | error: 2 attempt(s) failed; no baseline |
| C-023 | ok | no baseline |
| C-024 | ok | no baseline |

## Failure modes

- approve_error: 4
- zero_rows: 3

## Per case

Recall counts failed attempts as 0. Runtime is summed over the attempts.

| Case | Block | Verdict | Attempts passed | Recall | Total within tolerance | 10x | Failure modes | Cost | Tokens in / out | Runtime by stage | Tolerance source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | validated | ok | 1/3 | 93% | no | 0 | none | $0.596 | 768k / 78k | ocr 43 s, extraction 362 s, import 5 s | legacy |
| C-016 | validated | ok | 3/3 | 100% | yes | 0 | none | $0.416 | 467k / 54k | ocr 35 s, extraction 290 s, import 5 s | legacy |
| C-017 | validated | error | 0/3 | 1% | no | 1 | approve_error 2 | $0.523 | 734k / 83k | ocr 34 s, extraction 313 s, import 2 s | legacy |
| C-018 | validated | ok | 0/3 | 92% | no | 0 | none | $0.341 | 319k / 101k | ocr 63 s, extraction 395 s, import 5 s | legacy |
| C-019 | validated | ok | 0/3 | 0% | no | 3 | none | $2.06 | 1538k / 958k | ocr 76 s, extraction 2478 s, import 5 s | legacy |
| C-020 | validated | error | 0/3 | 0% | n/a | 0 | zero_rows 3 | $0.241 | 350k / 3k | ocr 26 s, extraction 58 s, import n/a | n/a |
| C-021 | validated | ok | 3/3 | 91% | yes | 0 | none | $0.540 | 553k / 18k | ocr 33 s, extraction 129 s, import 5 s | legacy |
| C-022 | validated | error | 0/3 | n/a | no | 0 | approve_error 2 | $0.381 | 569k / 63k | ocr 37 s, extraction 299 s, import 2 s | legacy |
| C-023 | validated | ok | 0/3 | n/a | no | 0 | none | $0.054 | 93k / 10k | ocr 21 s, extraction 69 s, import 5 s | legacy |
| C-024 | validated | ok | 0/3 | n/a | no | 0 | none | $0.102 | 141k / 21k | ocr 18 s, extraction 89 s, import 5 s | legacy |

Estimated cost of this run: $5.25

## Notes

- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: C-015, C-016, C-017, C-018, C-019, C-021, C-022, C-023, C-024
- Cases where `textTables` is unknown: C-022, C-023, C-024
