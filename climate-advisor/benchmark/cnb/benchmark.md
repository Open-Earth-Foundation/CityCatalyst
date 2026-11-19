# CNB golden-set benchmark

This is the developer guide for the Concept Note Builder benchmark: how to run
it, compare runs and approve a baseline. The benchmark runs three Markdown
fixture documents (Harbor Point, Kraków, Richfield) through the real production
pipeline in four stages — extraction, chapter writing, verification, editing —
and an LLM judge scores each stage against the golden expectations. Production
code never imports anything from here, and the service's Docker image does not
include it.

Nothing runs the benchmark automatically, and there is no CI job: a developer
runs it by hand, because every run spends provider usage.

## Run it

From `climate-advisor/`, with `OPENROUTER_API_KEY` in `climate-advisor/.env`:

```bash
uv sync --locked
uv run python -m benchmark.cnb.scripts.evaluate --label my-change
```

A full run calls the configured producer and judge models. Expect about $8–10
and 45–60 minutes one fixture at a time, or about 20 minutes with `--parallel`,
which runs the three fixtures at once. For reference, the 2026-11-10 baseline
cost $8.23, and its stages took 46 minutes in total before the clean-draft
verification control was added. `--fixture <id>` and `--stage <name>`
(repeatable) select part of the corpus.
The run is saved in `output/cnb_golden_set/runs/<run-id>/` (git-ignored) and
compared with the approved baseline in `baseline.json`.

Each run records everything except the models' own output, so two runs with
the same recorded inputs differ only by LLM variation: git commit (plus a diff
hash when the tree is dirty), hashes of every configured prompt, the full LLM
configuration (`llm_config.json`), the `uv.lock` hash, the fixtures and the
judge policy.

Every run claims its own folder and refuses an existing one. Reports checkpoint
after each completed stage, so setup errors, timeouts and stage failures keep a
partial report. `delivery.json` separates execution, ground-truth approval,
baseline compatibility and publication. Missing judgments never count as
resolved failures, and missing usage is not proof of zero spend.

Exit codes answer "did my change make things worse than the baseline?":

- `0`: nothing regressed (outcome `improved` or `unchanged`).
- `1`: something regressed (outcome `regressed` or `mixed`).
- `2`: the run ID already exists.
- `3`: the evaluation, ground-truth approval, baseline comparison or publication
  is unavailable.

The absolute gates (thresholds, single failures) are still reported per stage,
but they are not the exit code: the approved baseline itself fails some of them.
A failed `--mlflow` upload is logged and recorded in `delivery.json`; retry it
with `mlflow_log log`.

## Compare two runs

```bash
uv run python -m benchmark.cnb.scripts.compare --baseline-run benchmark/cnb/results/runs/<run-a> --candidate-run output/cnb_golden_set/runs/<run-b>
```

Any two run folders work, including one restored from MLflow. Add
`--baseline-repeat <run>` (repeatable) for other runs of run A's configuration;
they set the noise range. The command writes
`output/cnb_compare/<run-a>__<run-b>/` with `comparison.md`, `comparison.json`
and `index.html`, which opens on the A → B comparison. It uses the same exit codes
as `evaluate`. Changes appear only when both runs used the same fixtures, golden
expectations and judge policy. Otherwise the runs are shown side by side with
the reason, and the command exits `3`.

### Deciding better or worse

The first line of `comparison.md`, the viewer's **Baseline review**, and the
MLflow tag `comparison_outcome` give one outcome: `improved`, `regressed`,
`mixed` (some of each), `unchanged` or `unavailable`. It is built from two kinds
of evidence:

- **Items**: every expected fact, topic, gap, chapter, seeded defect, edit case
  and extraction evidence row has a stable golden ID. An item **regressed** when
  its verdict got worse (for example `covered` → `missing`), and **improved**
  when it got better. The judge's wording never counts as a change.
- **Metrics**: each rate knows its direction (for example, a lower false-alarm
  rate is better). Pure counts are shown as context only.

One run of each configuration cannot tell a change from model variation: two
runs of the same code on 2026-11-09 and 2026-11-10 differed by 10–17 points on
several metrics. The approved baseline therefore lists **repeats**, which are
independent runs with the same producer revision, model and prompt settings, dependency lock, fixtures and stages. A candidate requesting a stage absent from the baseline gets an unavailable comparison. A metric inside the spread of the
baseline runs is `within_noise`, and an item inside a varying baseline verdict range
is `flaky`. Changes beyond every observed rank still count. Added or resolved integrity failures are also compared by item. Neither counts as better or worse. Without repeats the report says
"noise not measured", and every change counts. Treat a small change as
unconfirmed until it holds in a second run.

### Reading extraction scores

The headline is `fact_evidence_retained`: did extraction keep the fact at all?
Routing it to the right chapter is a second, diagnostic question. Chapter
writing also receives the full source text, so a misrouted fact can still reach
the draft. `required_fact_coverage` is the judge's share of mandatory
chapter-fact pairs fully covered in their receiving chapter. Python adds
judge-free metrics from whether all passages in any one sufficient evidence group survive
verbatim at allowed source locations. Evidence from different groups cannot be combined. They change only when the producer's output
changes:

- `fact_evidence_retained`: share of facts with a mandatory pair whose evidence
  was kept anywhere (any chapter or the document-level quotations). Each fact
  counts once, however many chapters need it.
- `pair_evidence_in_chapter`: share of mandatory pairs whose evidence is in the
  receiving chapter.
- `pairs_misrouted`: pairs whose evidence was kept, but not in that chapter.
  This is a routing problem.
- `pairs_not_extracted`: pairs whose evidence was not kept anywhere. This is an
  extraction loss.

The per-pair status is in `details.evidence_retention` of `report.json`. A fact
paraphrased from a different passage than its golden evidence shows as not
extracted here, while the judge may still accept it.

### What the other stages score

- **Claims** (extraction and chapter writing): each output unit gets one verdict,
  its worst claim. `claim_support_rate` is the share of fully supported units,
  so the way the judge splits text into claims does not move the score.
- **Chapter writing**: `chapters_satisfied_rate` is the share of required chapters
  the judge marks satisfied. Transfer is traced per linked fact and receiving chapter. Its draft verdict covers the allowed chapters together.
  Every claim must carry a verdict against the drafter's own input.
- **Verification**: the gate is `min_defect_recall`; a single missed defect shows
  as a regressed item, not as an automatic failure. `false_alarm_rate` counts
  distinct issues, so repeating a finding cannot dilute it, and
  `duplicate_findings` is reported separately. The validator also runs on the
  clean reference draft as a control (`clean_false_alarm_rate`). The judge sees
  the template the validator checks against. A detected defect must cite a
  finding.
- **Editing**: resizing requests have a deterministic `length_ratio` band on every
  edited chapter.

## Store runs in MLflow (draft)

Add `--mlflow` to `evaluate` to upload the finished run to the
[`Clima-CNB-Benchmark`](https://mlflow-dev.openearth.dev/#/experiments/11)
experiment, separate from the service's `Clima` traces, or upload an existing
folder:

```bash
uv run python -m benchmark.cnb.scripts.mlflow_log log output/cnb_golden_set/runs/<run-id>
```

`MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME` and `MLFLOW_TRACKING_PASSWORD`
come from the environment or `climate-advisor/.env`; existing environment values
take precedence.

To compare runs, select two parent runs in the experiment and click **Compare**:

- `mean.<stage>.<metric>` is the average rate across fixtures, and
  `<fixture>.<stage>.<metric>` is each fixture's score, next to the provenance
  params, cost and time.
- The tags `baseline_run_id`, `comparison_outcome` and `quality_regression`
  record the comparison against the approved baseline.
- Check that the `corpus_fingerprint` and `evaluator_fingerprint` params match
  before reading a difference.

Expand a parent to reach its `<run-id>/<fixture>` child runs. Each carries the
same provenance params, that fixture's stage scores and its own status tags. The
complete run folder is the parent's artifact, with a SHA-256 manifest. Restore
it, checksum-verified, for `compare`, the viewer or `propose_baseline`:

```bash
uv run python -m benchmark.cnb.scripts.mlflow_log download <mlflow-run-id> --results-dir output/cnb-restored
```

The approved baseline still lives in git (`baseline.json` and `results/runs/`);
an MLflow tag never approves anything.

## Open the viewer

The viewer is a static site generated from saved runs; it is not committed:

```bash
uv run python -m benchmark.cnb.scripts.publish --results-dir benchmark/cnb/results
start benchmark/cnb/results/index.html
```

Use `open` on macOS or `xdg-open` on Linux. Every evaluation also refreshes
`output/cnb_golden_set/index.html` and writes a self-contained
`review-bundle.zip` into its run folder.

Pages:

- **Overview** — pass/fail per document and stage for the selected run.
- **1 · Extraction … 4 · Editing** — every judge verdict with the quoted evidence.
- **Harbor Point / Kraków / Richfield** — one document: golden expectations,
  each stage's output, the reference draft and the source with its golden facts.
- **Compare runs** — run A against run B: what changed (code, prompts, LLM
  config, dependencies, models, fixtures), stage results, time and cost, and
  changed verdicts, plus the history of all runs.

## Approve a baseline

When a run should become the reference for later runs:

```bash
uv run python -m benchmark.cnb.scripts.propose_baseline --run output/cnb_golden_set/runs/<run-id> --reviewer "Your Name" --reference <approval-PR-URL>
```

It copies the run's durable files (report, outputs, `llm_config.json`,
`viewer.js`; not its comparison or review bundle) into `results/runs/<run-id>/`,
writes `baseline.json` with the report and artifact hashes, the fingerprints and
the reviewer, and checks them with the evaluator's own baseline loader before
writing anything. Add `--repeat <run>` for each extra run of the same commit,
run with `evaluate --label baseline-repeat`. One independent repeat establishes an observed range across two runs. Commit each repeat beside the baseline. Commit everything in a
PR; that review is the approval. A JSON field does not prove a review happened.

The loader accepts a baseline only when the saved run matches its report and
artifact hashes, the run completed with every requested fixture and stage, every
fixture's ground truth is approved, every stage has a valid judgment, the viewer
snapshot exists and the approval date is not in the future. Known quality
failures are allowed in a baseline; an incomplete run is not. The scoped
`.gitattributes` rule keeps saved runs byte-identical on Windows and Linux.

Two runs are comparable when they share two fingerprints: the **corpus** (every
fixture's golden expectations, source, drafting input and reference draft, but
not its approval record) and the **judge policy** (judge model, all four judge
prompts, the scoring, judge-call and workspace code in `golden_set/`, and the
judge's output schemas). Changing production code, prompts or models never
breaks comparability; that is what the benchmark measures. A run of selected
fixtures or stages is compared on that scope only.

A change that only affects scoring does not need a new paid run. This covers
metrics, gates and citation checks.

```bash
uv run python -m benchmark.cnb.scripts.rescore --run benchmark/cnb/results/runs/<run-id>
```

It re-scores every stage from the saved judge inputs and judgments, and writes
the copy to `output/cnb_golden_set/rescored/<run-id>/`. To re-approve the copy,
replace the committed run folder and run `propose_baseline` on the copy, once
for the baseline and once per repeat. `rescore` refuses when the judge model,
the judge prompts or the fixtures changed, or when the current code would build
a different judge input. Those changes need a new run.

## Judge calibration

```bash
uv run python -m benchmark.cnb.scripts.calibrate
```

Scores the judge against human-labelled candidates; see
[calibration/README.md](calibration/README.md). The 28 proposed cases cover only the
extraction judge. The chapter, gap, defect and edit judgments have no
calibration yet.

## What is here

| Path | Contents |
| --- | --- |
| `fixtures/` | The three documents with golden expectations, drafting inputs and reference drafts. [`fixtures/README.md`](fixtures/README.md) explains the format, gates and approval. |
| `prompts/` | The four judge prompts, one per stage, with few-shot examples. |
| `golden_set/` | Stage execution and scoring (below). |
| `scripts/` | `evaluate`, `compare`, `rescore`, `propose_baseline`, `publish`, `mlflow_log`, `calibrate`. |
| `viewer/` | The static site source: `index.html` and `app.js`. |
| `results/` | Committed runs; the approved baseline lives here. |
| `calibration/` | Human-labelled judge calibration cases. |
| `baseline.json` | The reviewed baseline manifest. |

| `golden_set/` file | What it does |
| --- | --- |
| `models.py` | Fixture, judge and report contracts, including chapter requirements and approval. |
| `core.py` | Loads and checks fixtures; stage 1 (extraction) judge input and scoring. |
| `chapters.py` | Stage 2: production drafter and support check per chapter, then scoring. |
| `verification.py` | Stage 3: seeds defects in the reference draft, runs the production validator, then scores. |
| `editing.py` | Stage 4: production edit planner on each editing case, then scoring. |
| `workspace.py` | The in-memory workspace the pipeline normally reads from the database. |
| `judge.py` | Calls the judge model with a stage's judge prompt. |
| `baseline.py` | Baseline validation, run compatibility and comparison summaries. |
| `viewer.py` | Run snapshots, the run index and review sites. |
| `calibration.py` | Blinds human labels and scores judge agreement. |
| `../../utils/usage.py` | OpenRouter usage and cost attribution; unavailable cost stays explicit. |

The judge model (`models.cnb_golden_set_judge`) and the judge prompt paths are
configured in `climate-advisor/llm_config.yaml`.
