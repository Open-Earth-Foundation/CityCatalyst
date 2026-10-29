# CNB golden-set benchmark

Everything for the Concept Note Builder benchmark lives in this folder. The
benchmark runs three fixture documents (Harbor Point, Kraków, Richfield) through
the real production pipeline in four stages — extraction, chapter writing,
verification, editing — and an LLM judge scores each stage against the golden
expectations. Production code never imports anything from here, and the
service's Docker image does not include it.

## What is here

| Folder | Contents |
| --- | --- |
| `fixtures/` | The three documents with their golden expectations, drafting inputs, and reference drafts. [`fixtures/README.md`](fixtures/README.md) explains the format and gates. |
| `prompts/` | The four judge prompts, one per stage, with their few-shot examples. |
| `golden_set/` | The Python code that runs the stages and scores them (below). |
| `scripts/` | `evaluate.py` runs the benchmark; `publish.py` rebuilds the website. |
| `viewer/` | The website source: `index.html` and `app.js`. |
| `tests/` | Offline tests for all of the above; no model calls. |
| `results/` | Committed runs and the published website. |
| `calibration/` | Proposed held-out candidates and private human verdicts; approval is required before judge calls. |

The code in `golden_set/`:

| File | What it does |
| --- | --- |
| `models.py` | CNB fixture, judge and report contracts, including chapter requirements and approval. |
| `core.py` | Loads and checks the fixtures; stage 1 (extraction) judge input and scoring; shared scoring helpers. |
| `chapters.py` | Stage 2: runs the production drafter and support check per chapter, then scores. |
| `verification.py` | Stage 3: plants defects in the reference draft, runs the production validator, then scores. |
| `editing.py` | Stage 4: runs the production edit planner on each editing case, then scores. |
| `workspace.py` | Builds the in-memory workspace the pipeline normally reads from the database. |
| `judge.py` | Calls the judge model with a stage's judge prompt. |
| `../utils/usage.py` | Shared OpenRouter usage attribution; unavailable cost is explicit. |
| `viewer.py` | Writes each run's website data and the run index. |
| `pdf.py` | Runs or validates production PDF conversion without changing the authoritative reference. |
| `baseline.py` | Validates a reviewed baseline and generates comparable results. |
| `calibration.py` | Blinds human labels and scores judge agreement and serious false passes. |

The judge model (`models.cnb_golden_set_judge`) and the judge prompt paths are
configured in `climate-advisor/llm_config.yaml`.

Committed run: `results/runs/20261014-232449-five-fixes` (commit `0026fa7b2`;
producers `openai/gpt-5.6-terra`, judge and edit planner `openai/gpt-6-sol`). Its
recorded cost ($7.03) misses about $0.78 of streamed edit-planner calls, which
later runs record.

## Open the website

From `climate-advisor/`, open `benchmark/cnb/results/index.html` in a browser
(no server needed):

```bash
start benchmark/cnb/results/index.html      # Windows
open benchmark/cnb/results/index.html       # macOS
xdg-open benchmark/cnb/results/index.html   # Linux
```

Or serve it and open http://127.0.0.1:8765:

```bash
python -m http.server 8765 --directory benchmark/cnb/results
```

The "Open original PDF" buttons need the PDFs copied next to the site once
(they are kept out of git; the originals are in `fixtures/`):

```bash
uv run python -m benchmark.cnb.scripts.publish --results-dir benchmark/cnb/results
```

Pages:

- **Overview** — pass/fail per document and stage for the selected run.
- **1 · Extraction … 4 · Editing** — every judge verdict with the quoted evidence.
- **Harbor Point / Kraków / Richfield** — one document: golden expectations, each
  stage's output, the reference draft, and **Source document** with the golden
  facts listed on the left; click a fact to jump to its passage.
- **Compare runs** — pick run A and run B to see what changed (models, prompts,
  scores, time and cost, individual verdicts) and the history of all runs.
- **Run** (top right) — switch the run every page shows.

## Run the benchmark

From `climate-advisor/`:

```bash
# Offline tests, no model calls.
uv run pytest benchmark/cnb/tests -q

# Full run: calls the configured models; runtime and cost depend on configuration.
# Needs OPENROUTER_API_KEY in climate-advisor/.env.
uv run python -m benchmark.cnb.scripts.evaluate --parallel --label my-change

# Fresh pinned PDF -> production visual_context conversion -> extraction.
uv run python -m benchmark.cnb.scripts.evaluate --input-path pdf --baseline-manifest benchmark/cnb/baseline-pdf.json

# Judge-only calibration; unapproved cases are reported without model calls.
uv run python -m benchmark.cnb.scripts.calibrate

# Save the run with the committed ones instead of output/cnb_golden_set/.
uv run python -m benchmark.cnb.scripts.evaluate --parallel --results-dir benchmark/cnb/results --label my-change
```

Runs go to `climate-advisor/output/cnb_golden_set/` by default, which git
ignores; open its `index.html` the same way. A run saved in `results/` updates
the website there; commit the new `results/runs/<run-id>/` folder together with
`results/runs/index.js`. `--fixture` and `--stage` select single documents or
stages; see `uv run python -m benchmark.cnb.scripts.evaluate --help`.

See [DELIVERY.md](DELIVERY.md) for non-required live CI, provider/storage setup,
partial-report behavior and downloadable baseline/candidate bundles. Both
baseline manifests and the fixture approvals are pending: draft measurements
must not be presented as approved quality results. [Calibration approval](calibration/README.md)
is separate from source ground-truth approval.
