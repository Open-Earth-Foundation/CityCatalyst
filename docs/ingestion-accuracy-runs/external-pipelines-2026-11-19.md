# External extraction pipelines vs built-in import (CC-1295, 2026-11-19)

Comparison of the built-in PDF import with three external document-extraction services and with Mirco's agent pipeline. All runs used the same scorer, the same import path (approve, then read back) and commit `c5dec265a`. This is a reduced study (about US$ 3 budget, approved 18 Nov). The full run (about US$ 320) was not done, so read every vendor result as a single data point.

The per-attempt `results.json` and `extracted-values.json` files and the vendor generators were removed before merge. They are in commit [`54b066c8a`](https://github.com/Open-Earth-Foundation/CityCatalyst/tree/54b066c8acf67898fe78477b9bb2b153ee904c60/docs/ingestion-accuracy-runs) (generators under [`app/scripts/pdf-benchmark/generators/`](https://github.com/Open-Earth-Foundation/CityCatalyst/tree/54b066c8acf67898fe78477b9bb2b153ee904c60/app/scripts/pdf-benchmark/generators)).

## Runs

| Pipeline | Cases | Attempts | Run folders |
| --- | --- | --- | --- |
| Built-in import (Mistral OCR + `gpt-5.6-luna`, direct OpenAI) | C-015 to C-025 | 3 | [2026-11-19-0219-c5dec265a](./2026-11-19-0219-c5dec265a/report.md), [2026-11-19-0336-c5dec265a](./2026-11-19-0336-c5dec265a/report.md) |
| Mirco's agent pipeline (`originals-v2/round2`, precomputed envelopes) | C-015 to C-025 | 3 | [2026-11-19-0209-c5dec265a-originals-v2](./2026-11-19-0209-c5dec265a-originals-v2/report.md), [2026-11-19-0211-c5dec265a-originals-v2](./2026-11-19-0211-c5dec265a-originals-v2/report.md) |
| Reducto Deep Extract v3, citations on | C-018 | 1 | [2026-11-19-0212-c5dec265a-reducto](./2026-11-19-0212-c5dec265a-reducto/report.md) |
| LlamaExtract Agentic Plus | C-018 | 1 | [2026-11-19-0212-c5dec265a-llamacloud](./2026-11-19-0212-c5dec265a-llamacloud/report.md) |
| Mistral Document AI annotations (`mistral-ocr-4-1`, whole document) | C-018 | 1 | [2026-11-19-0212-c5dec265a-mistral](./2026-11-19-0212-c5dec265a-mistral/report.md) |

All pipeline runs are exploratory and change no baseline. No case in this selection has a baseline yet. C-015 to C-021 have row-level answer keys; C-022 to C-025 are scored on the total only.

## Built-in vs Mirco's pipeline, C-015 to C-025, 3 attempts each

Recall counts failed attempts as 0. Precision is the mean over scored attempts. "Total" is the per-case verdict "total within tolerance".

| Case | Built-in recall | Built-in precision | Built-in total | Mirco recall | Mirco precision | Mirco total | Mirco recall, parent refs variant |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C-015 | 99% | 99% | yes | 100% | 98% | yes | 100% |
| C-016 | 100% | 100% | yes | 95% | 96% | no | 95% |
| C-017 | 32% | 58% | no | 81% | 98% | no | 81% |
| C-018 | 69% | 70% | no | 100% | 100% | yes | 100% |
| C-019 | 0% (truncated 3/3) | n/a | no | 42% | 100% | no | 42% |
| C-020 | 0% (zero rows 3/3) | n/a | n/a | 33% | 87% | no | 92% (total yes) |
| C-021 | 79% | 81% | no | 27% | 100% | no | 91% |
| C-022 | total only | | yes (3/3) | total only | | no | |
| C-023 | total only | | no (0/3) | total only, 2 attempts `approve_error` | | no | |
| C-024 | total only | | no (1/3 passing) | total only, 3 attempts `approve_error` | | n/a | |
| C-025 | zero rows 3/3 | | n/a | zero rows 3/3 | | n/a | |

Summary over the run:

| Measure | Built-in | Mirco |
| --- | --- | --- |
| Mean recall, C-015 to C-021 (provisional, `textTables` unknown) | 54% | 68% (86% with the parent refs variant) |
| Mean precision over cases scored row by row | 82% (5 cases) | 97% (7 cases) |
| Attempts passing, C-015 to C-024 | 40% | 20% |
| Cases with total within tolerance, C-015 to C-024 | 3 | 2 |
| Attempts 10x or more off the expected total | 3 (all C-019) | 8 (C-019 1, C-020 3, C-021 3, C-023 1) |
| Notation keys recovered | 10 of 39 | 26 of 39 |
| Cases that stored a distractor value | 4 | 3 |
| Failure modes | truncated 3, zero_rows 6 | approve_error 5, zero_rows 3 |
| Cost | US$ 5.56 (11 cases x 3) | n/a (envelopes name no model) |
| Runtime per attempt | extraction about 10 s to 14 min (C-019: 41 min for 3 attempts) | not recorded in envelopes |

Reading the two pipelines:

- Mirco's rows are more precise (97% vs 82%) and find more notation keys, but read this with the caveat on per-case guidance below: the two pipelines did not get the same inputs.
- Mirco's recall losses on C-020 and C-021 are mostly import losses, not extraction losses. The pipeline reports unsplit subsectors (for example `I.3` with no scope). Approve drops these as `gpc-reference-unknown` (7 to 9 rows per attempt), and the total then falls 10x short. With those rows added back, C-020 goes from 33% to 92% recall and its total is within tolerance; C-021 goes from 27% to 91%. The variant is an upper bound: on C-022 all 4 added parent rows also had their children stored, so the amount counts twice there.
- Mirco's `approve_error` on C-023 and C-024 ("No valid rows to import") has the same cause: every row is a parent reference or has an unresolved reference, so approve keeps nothing.
- The built-in import is better on totals: 3 cases within tolerance against 2, and more passing attempts. It fails hard on C-019 (output truncated, 10x off on all 3 attempts, US$ 2.14 of the US$ 5.56) and on C-020 (zero rows).
- Both fail C-025 with zero rows. Mirco's envelopes for C-025 report a total but no rows (an energy-only BISKO inventory, not a GPC table).

## Vendors on C-018, 1 attempt each

C-018 is a 26-page Spanish-language GPC BASIC+ report. Both the built-in import and Mirco's pipeline already have numbers for it, so it is the only case sent to vendors.

| Pipeline | Recall | Precision | Total | Notation keys | Distractors stored | Lost rows in approve | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Reducto Deep Extract | 100% | 100% | yes | 0 of 3 | 4 | none | US$ 1.04 (list price US$ 0.04/page) |
| LlamaExtract Agentic Plus | 100% | 100% | yes | 3 of 3 | 4 | 25 without value or notation key | US$ 2.34 (60 credits/page x US$ 0.0015) |
| Mistral annotations, whole document | 83% | 83% | no | 0 of 3 | 4 | 7 without value or notation key | US$ 0.13 (US$ 0.005/page) |
| Mirco's pipeline (3 attempts, for reference) | 100% | 100% | yes | 0 of 3 | 4 | 30 without value or notation key | n/a |
| Built-in import (3 attempts, for reference) | 69% | 70% | no | 1 of 3 | 2 | | about US$ 0.12 per attempt |

Earlier Mistral runs with one call per 8-page range scored 0% recall on C-009 and C-018 because rows were duplicated across ranges; whole-document mode replaced that default (ruling R12 in the task ledger).

Every pipeline stored 4 distractor values on C-018 except the built-in import (2). All of them read the same non-inventory figures in that report, so this measures the case more than the pipeline.

## Caveats

- Mirco's envelopes say his pipeline used per-case guidance (`case_context`) and a repair stage. The built-in import and the vendors got no per-case context. What that context held, and whether round 2 used feedback from the benchmark, is unconfirmed and still to be asked to Mirco, so compare his pipeline with the others with care.
- The spec asked for the dev block as well, but the manifest has no dev cases, so only validated cases ran.
- One attempt on one case per vendor. It shows that Reducto and LlamaExtract can match the best result on a clean, tabular report. It does not show how they handle the hard cases (C-017, C-019 to C-024), where the built-in import and Mirco's pipeline differ most.
- LlamaExtract was run without the `<example_output>` block of the shared instructions, because its `system_prompt` has a length limit (ruling R13). The other vendors got the full instructions.
- Mistral pricing: the annotations price is the list price per page. Whether OCR is billed on top was not confirmed.
- Mirco's cost is n/a: the envelopes report tokens but name no model, so the tokens cannot be priced.
- Approve cannot carry `total_inclusion: excluded` (`excludedNotCarried` in the run reports). Those rows count in the application total, while Mirco's `adapt` omits them. A total can therefore read high for any pipeline that marks exclusions.
- Recall for C-015 to C-021 is provisional because their `textTables` flag is unknown, so the headline recall of every run is n/a.
- The budget was about US$ 3. The built-in run cost US$ 5.56, mostly C-019 (US$ 2.14, truncated output on all 3 attempts). Total spend for the study, vendors included: about US$ 12.

## Differences from Mirco's `adapt`

The precomputed mode maps fields only and imports through the real approve step. Where it differs from Mirco's `comparison-bridge.ts` `adapt`:

- Parent references (`I.3`, scope null) are dropped by approve. `adapt` keeps them and scores them as `I.3.x`. The "parent refs (Mirco)" variant in each report shows the score with `adapt`'s rule.
- `total_inclusion: excluded` is not carried into the total (see Caveats). `adapt` omits the row.
- `row_role: information` rows are dropped and counted; `notation` rows import with a null value; an unknown role drops only that row and is counted as `unknownRowRoles` (none occurred).
- Rows with neither a value nor a notation key are dropped by approve and listed as lost rows.

## Verdict

- No external pipeline is ready to replace the built-in import on this evidence. Reducto and LlamaExtract are perfect on C-018, but so is Mirco's pipeline, and one easy case cannot rank them.
- The largest measured gain does not need a vendor: approve drops parent references. Mirco's pipeline would move from 68% to up to 86% mean recall, and C-020 would pass its total, if approve kept the parent rows (the variant measures keeping them as `<ref>.x`, not splitting them by scope). This is an import change, not an extraction change, and it would apply to any pipeline that reports unsplit subsectors.
- Mirco's pipeline shows higher precision on C-017 to C-021 (with per-case guidance the built-in import did not get), recovers more notation keys overall (26 against 10 of 39) and never truncates. The built-in import is better on C-016 and still wins on totals in this run.
- Next useful evidence, cheapest first: (1) decide how approve should treat parent references and re-score Mirco's envelopes (free); (2) run Reducto on C-017 and C-019 to C-021 once (about US$ 0.04/page) to test it on the hard cases; (3) only then consider LlamaExtract, which costs about twice as much as Reducto per page.
