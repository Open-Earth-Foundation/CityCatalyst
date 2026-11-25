# PDF benchmark run 2026-11-19 02:12 UTC (exploratory)

- Commit: `c5dec265a` on `david/cc-1295-benchmark-external-document-extraction`
- Pipeline: precomputed (mistral/2026-11-19, annotations/whole mistral-ocr-4-1)
- Exploratory: pipeline
- Extraction model: n/a (precomputed pipeline)
- Prompt hash: n/a (precomputed pipeline)
- Input representation: n/a (precomputed pipeline)
- Test-set version: 510369476497; scorer version: 2
- Attempts per case: 1
- Selection: C-018
- MLflow: MLflow skipped (--no-mlflow)

## Block: validated

- 1 of 22 cases in this run
- Headline recall (failed attempts count as 0): n/a (0 cases counted; only eligible cases with row recall count); cases with totals within tolerance: 0
- Recall over scored attempts only: n/a (0 cases counted)
- Provisional recall, cases whose `textTables` is unknown (failed attempts count as 0): 83% (1 case counted)
- Attempts passing: 0%
- Attempts 10x or more off the expected total: 0
- Wrong totals that carried a warning: 0%
- Precision 83%, value accuracy 83%, classification accuracy 100% (means over 1 case scored row by row, scored attempts only)
- Notation keys recovered: 0 of 3; cases that stored a distractor value: 1

## Guardrails

- 10x guardrail: 0 attempts with a stored total 10x or more off the expected total
- Warnings: none

## Regressions against the baseline

| Case | Verdict | Reasons |
| --- | --- | --- |
| C-018 | ok | no baseline |

## Change from the baseline

No case in this run has a baseline to compare with.

## Failure modes

No failed attempts.

## Per case

Recall counts failed attempts as 0. Precision, accuracies and distractors stored are means over the scored attempts; notation keys are those of the first scored attempt. Runtime is summed over the attempts.

| Case | Block | Verdict | Attempts passed | Recall | Precision | Value acc. | Class. acc. | Notation keys | Distractors stored | Total within tolerance | 10x | Failure modes | Cost | Tokens in / out | Runtime by stage | Tolerance source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-018 | validated | ok | 0/1 | 83% | 83% | 83% | 100% | 0/3 | 4 | no | 0 | none | $0.130 | 0k / 0k | ocr n/a, extraction n/a, import 2 s | legacy |

Estimated cost of this run: $0.130

## Pipeline notes

What the pipeline reported for each attempt: facts about the envelope, not scored. Lost rows are the rows approve skipped, by import issue code; `unexplained` and `notSkipped` mark a mismatch between the rows approve skipped and the issues it reported.

| Case | Attempt | Execution status | Rows in envelope | Unknown row roles | Dropped rows | Lost rows | Reported totals (t) | Total basis / kind | Scope basis | Total inclusion | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-018 | 1 | completed | 19 | none | excludedNotCarried 7 | no-value-or-notation-key 7 | total 2145243.596, gross 2145243.596, net 2145243.596, removals n/a | Total de Emisiones (netas) for the 2022 reporting period (01/01/2022–31/12/2022), Comuna de Santiago, GPC Básico+ level, community-wide. Printed in Anexo 2 as 2.145.243.596 KgCO2e = 2,145,243.596 tCO2e (Tabla 4 rounds to 2.145.244 tCO2e). No removals reported (Remociones-Suelos Gestionados = N/A), so gross equals net. Scope totals: Alcance 1 = 1,249,052.717 t; Alcance 2 = 542,082.372 t; Alcance 3 = 354,108.507 t. / net | inferred 7, explicit 12 | excluded 7, included 12 | $0.130 (envelope) |

## Score variant: parent references

The standard score is the headline. The parent refs (Mirco) variant also scores the rows the pipeline gave as an unsplit I, II or III subsector (such as I.3) that approve dropped, and writes every such reference as `<ref>.x` (Mirco's `scoringReference`): it can match a key row written as that subsector or as `<ref>.x`, never an exact child row with a scope such as I.3.1. When the pipeline also gave the children of a parent reference and approve stored them, the variant counts that amount twice (see the last column); the standard score is unaffected. Recall counts failed attempts as 0; precision is the mean over the scored attempts; parent-reference rows are summed over the attempts.

| Block | Headline recall: standard | Headline recall: parent refs (Mirco) | Precision: standard | Precision: parent refs (Mirco) |
| --- | --- | --- | --- | --- |
| validated | n/a | n/a | 83% | 83% |

| Case | Block | Recall: standard | Recall: parent refs (Mirco) | Precision: standard | Precision: parent refs (Mirco) | Totals within tolerance: standard | Totals within tolerance: parent refs (Mirco) | Parent-reference rows added | Of which children were stored too |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-018 | validated | 83% | 83% | 83% | 83% | no | no | 0 | 0 |

## Notes

- C-028 and C-031 are not fully held out.
- Cases using the legacy tolerance: C-018
- Cases where `textTables` is unknown: C-018
- Cases whose application total is off but would be within tolerance after removing the GPC-excluded references the app does not flag yet (CC-1201): none
