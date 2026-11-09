# CNB golden-set benchmark

This is the developer guide for the Concept Note Builder benchmark: how to run
it, compare runs and approve a baseline. The benchmark runs three Markdown
fixture documents (Harbor Point, Kraków, Richfield) through the real production
pipeline in four stages — extraction, chapter writing, verification, editing —
and an LLM judge scores each stage against the golden expectations. Production
code never imports anything from here, and the service's Docker image does not
include it.

Nothing runs the benchmark automatically. Run it yourself, or dispatch the
manual workflow described in [DELIVERY.md](DELIVERY.md).

## Run it

From `climate-advisor/`, with `OPENROUTER_API_KEY` in `climate-advisor/.env`:

```bash
uv sync --locked
uv run python -m benchmark.cnb.scripts.evaluate --label my-change
```

A full run calls the configured producer and judge models, takes about 15–35
minutes and costs a few dollars. `--parallel` runs the three fixtures at once;
`--fixture <id>` and `--stage <name>` (repeatable) select part of the corpus.
The run is saved in `output/cnb_golden_set/runs/<run-id>/` (git-ignored) and
compared with the approved baseline in `baseline.json`.

Each run records everything except the models' own output, so two runs with
the same recorded inputs differ only by LLM variation: git commit (plus a diff
hash when the tree is dirty), hashes of every configured prompt, the full LLM
configuration (`llm_config.json`), the `uv.lock` hash, the fixtures and the
judge policy.

Exit codes: `0` passing against an approved baseline; `1` quality failure; `2`
the run ID already exists; `3` evaluation, approval, baseline comparison or
publication unavailable.

## Compare two runs

```bash
uv run python -m benchmark.cnb.scripts.compare --baseline-run benchmark/cnb/results/runs/<run-a> --candidate-run output/cnb_golden_set/runs/<run-b>
```

Any two run folders work, including an extracted CI artifact. The command writes
`output/cnb_compare/<run-a>__<run-b>/` with `comparison.md`, `comparison.json`
and `index.html`, which opens on the A → B comparison. Score deltas, new and
resolved failures appear only when both runs used the same fixtures, golden
expectations and judge policy. Otherwise the runs are shown side by side with
the reason, and the command exits `3`.

## Store runs in MLflow (draft)

Add `--mlflow` to `evaluate` to upload the finished run folder to the
[`Clima-CNB-Benchmark`](https://mlflow-dev.openearth.dev/#/experiments/11)
experiment, separate from the service's `Clima` traces. It needs
`MLFLOW_TRACKING_URI`, `MLFLOW_TRACKING_USERNAME` and `MLFLOW_TRACKING_PASSWORD`
(the `.env` values work). Each run becomes one parent MLflow run with the
provenance as params, plus one child per fixture with `<stage>.<metric>` and
usage metrics, so MLflow's **Compare** view lines up scores, cost and time
across runs. The whole run folder, with a SHA-256 manifest, is the parent's
artifact. `delivery.json` records the MLflow run ID.

Existing folders can be uploaded and any MLflow run restored, checksum-verified,
for `compare`, the viewer or `propose_baseline`:

```bash
uv run python -m benchmark.cnb.scripts.mlflow_log log output/cnb_golden_set/runs/<run-id>
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

It copies the run's durable files into `results/runs/<run-id>/`, writes
`baseline.json` with the run's hashes and fingerprints, and checks them with the
evaluator's own baseline loader. Commit both in a PR; that review is the
approval. A run can only become a baseline when it completed, every fixture's
ground truth is approved and every stage has a valid judgment. See
[DELIVERY.md](DELIVERY.md) for the manifest rules.

## Judge calibration

```bash
uv run python -m benchmark.cnb.scripts.calibrate
```

Scores the judge against human-labelled candidates; see
[calibration/README.md](calibration/README.md).

## What is here

| Path | Contents |
| --- | --- |
| `fixtures/` | The three documents with golden expectations, drafting inputs and reference drafts. [`fixtures/README.md`](fixtures/README.md) explains the format, gates and approval. |
| `prompts/` | The four judge prompts, one per stage, with few-shot examples. |
| `golden_set/` | Stage execution and scoring (below). |
| `scripts/` | `evaluate`, `compare`, `propose_baseline`, `publish`, `calibrate`. |
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
