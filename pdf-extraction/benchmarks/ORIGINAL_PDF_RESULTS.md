# Original-PDF benchmark results · 17 November 2026

For the metric names and per-report comparison used with the old reference,
see [BENCHMARK_TABLE.md](BENCHMARK_TABLE.md). Follow-up work is listed in
[NEXT_STEPS.md](../NEXT_STEPS.md), with open and fixed bugs distinguished in
[KNOWN_ISSUES.md](../KNOWN_ISSUES.md).

The completed study contains **81 independent extraction attempts**: 11 eligible
Round 2 reports × Mistral OCR off/on × three repetitions, followed by five
held-out reports × three repetitions with the selected OCR setting. Paris was
excluded. The five held-out reports cover four cities because Chicago appears
for two inventory years. Development smoke tests are separate from these 81.

All new inputs are the supplied Drive originals. The catalogue has 28 cases,
27 distinct PDFs and 710 answer-key rows installed locally. File hashes were
verified against the original ZIP members. Publisher replacements and synthetic
PDFs are absent from the active catalogue; earlier results remain archived.

The agent used `gpt-6.1-sol`, medium reasoning and at most three repair turns
after its initial extraction. OCR on added structured `mistral-ocr-4-1` context;
the original PDF and the agent's PDF/image/local OCR tools remained available in
both conditions. JSON Schema defined the GHGI data model in this study.

| Set | Pipeline | Attempts (row-scored) | Row recall | Row precision | Row F1 | Row-total passes | Pipeline failures |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Round 2 | Recorded old, rescored | 33 (21) | 57.1% | 61.3% | 58.6% | 12/33 | 9 |
| Round 2 | Agent, Mistral off | 33 (21) | 86.1% | 85.6% | 85.8% | 24/33 | 0 |
| Round 2 | Agent, Mistral on | 33 (21) | 83.8% | 84.6% | 84.1% | 25/33 | 0 |
| Held-out | Recorded old, rescored | 15 (15) | 51.1% | 55.0% | 52.6% | 5/15 | 0 |
| Held-out | Agent, Mistral off | 15 (15) | 62.4% | 60.2% | 61.2% | 7/15 | 0 |

Row F1 balances recall and precision. Each row-scored attempt has equal weight;
failed attempts count as zero. Four Round 2 reports are total-only, so they have
no row metrics. Row-total passes compare the stored, included rows with the key
target; a correct source headline alone does not pass that check.

The agent improves these measured results compared with the recorded old
outputs. This compares complete pipelines with different models and prompts;
it does not isolate the effect of the agent harness itself.

Mistral did not improve average row F1 here. It added one row-total pass and
processed 1,281 pages, but used more agent input/output tokens. The predeclared
selection rule chose **OCR off** from Round 2 alone. The sample and three
repetitions do not establish statistical significance or a general OCR ranking.

Long Beach C-028 and Dunedin C-031 were already marked not fully held out. On
the other three held-out reports, row F1 was 81.2% versus the old 67.5%, with
7/9 versus 5/9 row-total passes. On the two previously used reports, it was
31.2% versus 30.3%, with neither pipeline passing a row total.

## What repair did

| Set / Mistral | Initial → final artifact row F1 | Initial → final row-total passes | Row F1 improved / unchanged / worse |
| --- | --- | --- | --- |
| Round 2 / off | 86.8% → 85.8% | 19/33 → 24/33 | 0 / 17 / 4 |
| Round 2 / on | 86.1% → 84.1% | 19/33 → 25/33 | 1 / 16 / 4 |
| Held-out / off | 61.5% → 61.2% | 4/15 → 7/15 | 1 / 11 / 3 |

The loop ran: 81 sessions produced 318 checked candidates and used 237 repair
turns. Six attempts stopped after two repairs. The other 75 used all three and
retained review flags. The final candidates had 935 ambiguity flags and 21
consistency flags, down from 1,104 initial issue instances of all categories.

Repair improved total reconciliation but slightly reduced average row F1.
Across 57 row-scored trajectories, two improved, 44 stayed unchanged and 11
regressed. Initial/final comparisons describe candidate artifacts; the primary
scores use actual final outputs. No best-scoring intermediate round was selected,
and no expected answers were sent to the agent or repair loop.

Keep repair optional. The frontend still defaults to extracting and flagging
issues. Further development should stop repeated checks of confirmed source
ambiguities and distinguish repairable errors from information needing review.

## Remaining problems

- Dunedin selected financial year 2020/21 and its gross total. The key targets
  2021/22 net emissions. Physical PDF pages 5 and 30 confirm the distinction.
  A matching integer year label does not prove selection of the right period.
- Long Beach found the printed gross total, 3,311,673 tCO2e, but its included
  rows did not exclude the key's 60,179 waste-to-energy and 608 imported
  wastewater amounts. The normalized key target is 3,250,886 tCO2e. Source
  headlines and GPC-normalized totals need separate definitions.
- Münster extracted the correct printed 2022 total, 1,788,000 tCO2e, but
  returned no detailed 2022 rows. Its row-sum score therefore fails.
- Aggregates spanning multiple GPC subsectors remain difficult to represent
  in a schema permitting one reference. Unclear mappings stay null rather than
  receiving invented allocations.

These held-out failures remain in the results. Extraction prompts, schema and
model settings were not tuned using their outputs. The next development study
should specify periods/boundaries explicitly and support composite aggregates.

## Evaluation fixes and limits

The unchanged upstream PDF scorer and the same Product keys score both sets of
saved rows. At their boundary, an unsplit parent such as `I.1` is represented
using the scorer's nonnumeric `I.1.x` syntax. Scope and values do not change;
an exact scoped key still rejects an unknown scope or child reference. The
mapping applies equally to both pipelines.

This evaluator-only fix corrected preliminary Round 2 F1 figures of 68.4% and
67.9% to the final 85.8% and 84.1%. The original adapter, reports, scores and
plan remain preserved. All 73 available historical scores replay exactly across
81 recorded historical attempts; eight had no recorded score. Selection still
chose OCR off, and the same three already accepted held-out jobs were resumed.
Seven regression cases cover valid aggregate matching and invalid scope matches.

The reference is the [12 November recorded run](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/21797f86236243f83ee84e3545cabb0b913ccde9/docs/ingestion-accuracy-runs/2026-11-12-1722-fe14d3a05/report.md),
not a fresh run of current production. It has no per-PDF hashes, so historical
byte identity with the new originals cannot be verified. The new paired inputs
have verified identical bytes. Shared legacy matching rules include parent
aggregation and treating an absent expected-zero row as a match.

Three early polling disconnects were recovered using the same session IDs. An
initial brief overlap of six hosted jobs and the later evaluator pause are
recorded in the plan. Timing is diagnostic; the compact overview separates
controller completion from collection delay. No extraction attempts were
replaced. Reported usage is best-effort provider accounting, not a final bill;
all 81 jobs have known usage, with cached tokens included in input totals.
Historical cost/metering labels are not used for a quantitative resource ranking.

Source evidence and claimed page inspection are not independently verified.
The reported-total diagnostic compares with the key target, which can be a
normalized row sum rather than a printed headline. It is not proof that a
quoted headline was copied correctly or incorrectly.

## Local evidence and reproduction

Detailed files are ignored under `runs/originals-v2/`:

- `overview.html` / `.md`: compact results, interpretation, resources and limits.
- `comparison.html` / `.md`: every report/condition and repair issue.
- `repair-analysis/report.html`, `summary.json`, `scores.json`: all 318
  candidate scores and per-attempt trajectories.
- `plan.json`, `input-audit.json`, `audit.json`: inputs, amendments, 81 unique
  sessions, actual model/effort/cap checks and 54 verified frozen files.
- `usage-reconciliation.json`: read-only accounting refreshes and unchanged
  extraction hashes; original collected JSON is retained beside refreshed JSON.
- `baseline-replay.json`, `environment.json`, `frozen-source.zip`: replay checks,
  local runtime versions and the public frozen-source snapshot.

Raw Mistral context is in hosted input files, not cached locally. Final evidence
currently exports PDF pages and quotes, not bounding boxes. PDFs and Product
answer keys stay outside Git.

From Command Prompt in `pdf-extraction`, these regenerate reports without new
agent calls; they require the prepared private inputs and local artifacts:

```cmd
.venv\Scripts\python.exe -m examples.experiment --stage report
.venv\Scripts\python.exe -m examples.analyze_repairs
.venv\Scripts\python.exe -m examples.audit_experiment
start "" "benchmarks\runs\originals-v2\overview.html"
```

The offline regression suite passed **109 tests**. See [README.md](README.md)
for original-only setup and a new frozen experiment. A new study must use a
different output folder; it must not overwrite this plan.

During later commit preparation, the offline reporting scripts were promoted to
`examples/` and `api.py` received a Black formatting-only cleanup. Its Python
syntax tree is identical. The plan records this post-study amendment and preserves
the previous plan and source archive as `*.before-commit-preparation.*`. No
extraction data, prompts, schema, scoring behavior or benchmark attempts changed.
