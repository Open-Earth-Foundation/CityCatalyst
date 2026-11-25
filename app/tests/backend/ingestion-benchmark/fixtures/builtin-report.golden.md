# PDF benchmark run 2026-10-27 15:30 UTC - INCOMPLETE

- Commit: `abc1234` on `test`
- Extraction model: gpt-x; reasoning effort: provider default; OCR model: o
- Prompt hash: hash123
- Input representation: ocr-text
- Test-set version: tsv1; scorer version: n/a
- Attempts per case: 1
- Selection: A
- MLflow: not logged

**INCOMPLETE**: this full-set run does not cover every case; numbers cover the cases listed under Selection only.
- Missing inputs (not run): C-004 (PDF not found in pdfDir)
- Did not finish every attempt: C-010

## Block: validated

- 1 of 1 cases in this run
- Headline recall (failed attempts count as 0): 68% (1 case counted; total-only cases have no row recall); cases with totals within tolerance: 0
- Recall over scored attempts only: 70% (1 case counted)
- Attempts passing: 0%
- Attempts 10x or more off the expected total: 0
- Wrong totals that carried a warning: n/a
- Precision 50%, value accuracy 80%, classification accuracy 90% (means over 1 case scored row by row, scored attempts only)
- Notation keys recovered: 1 of 4; cases that stored a distractor value: 0

## Guardrails

- 10x guardrail: 0 attempts with a stored total 10x or more off the expected total
- Warnings: none

## Regressions against the baseline

No baseline comparison in this run.

## Change from the baseline

No case in this run has a baseline to compare with.

## Failure modes

No failed attempts.

## Per case

Recall counts failed attempts as 0. Precision, accuracies and distractors stored are means over the scored attempts; notation keys are those of the first scored attempt. Runtime is summed over the attempts.

| Case | Block | Verdict | Attempts passed | Recall | Precision | Value acc. | Class. acc. | Notation keys | Distractors stored | Total within tolerance | 10x | Failure modes | Cost | Tokens in / out | Runtime by stage | Tolerance source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | validated | n/a | 0/1 | 50% | 50% | 80% | 90% | 1/4 | 0 | no | 0 | none | n/a | 0k / 0k | ocr n/a, extraction n/a, import n/a | n/a |

Estimated cost of this run: n/a

## Notes

- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: none
- Cases where `textTables` is unknown: none
- Cases whose application total is off but would be within tolerance after removing the GPC-excluded references the app does not flag yet (CC-1201): none

---INDEX---
| 2026-10-27 15:30 (incomplete) | `abc1234` | 1 | 68% | n/a | n/a | [f](./f/report.md) |