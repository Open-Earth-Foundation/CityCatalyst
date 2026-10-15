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

The code in `golden_set/`:

| File | What it does |
| --- | --- |
| `models.py` | Data shapes: fixture files, judge inputs and verdicts, reports, usage. |
| `core.py` | Loads and checks the fixtures; stage 1 (extraction) judge input and scoring; shared scoring helpers. |
| `chapters.py` | Stage 2: runs the production drafter and support check per chapter, then scores. |
| `verification.py` | Stage 3: plants defects in the reference draft, runs the production validator, then scores. |
| `editing.py` | Stage 4: runs the production edit planner on each editing case, then scores. |
| `workspace.py` | Builds the in-memory workspace the pipeline normally reads from the database. |
| `judge.py` | Calls the judge model with a stage's judge prompt. |
| `usage.py` | Records time, requests, tokens, and cost per stage and agent. |
| `viewer.py` | Writes each run's website data and the run index. |

The judge model (`models.cnb_golden_set_judge`) and the judge prompt paths are
configured in `climate-advisor/llm_config.yaml`.

Committed run: `results/runs/20261014-232449-five-fixes` (commit `0026fa7b2`;
producers `openai/gpt-5.6-terra`, judge and edit planner `openai/gpt-6-sol`). Its
recorded cost ($7.03) misses about $0.78 of streamed edit-planner calls, which
later runs record.

## Open the website

From `climate-advisor/`, open `benchmark/results/index.html` in a browser
(no server needed):

```bash
start benchmark/results/index.html      # Windows
open benchmark/results/index.html       # macOS
xdg-open benchmark/results/index.html   # Linux
```

Or serve it and open http://127.0.0.1:8765:

```bash
python -m http.server 8765 --directory benchmark/results
```

The "Open original PDF" buttons need the PDFs copied next to the site once
(they are kept out of git; the originals are in `fixtures/`):

```bash
uv run python -m benchmark.scripts.publish --results-dir benchmark/results
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
uv run pytest benchmark/tests -q

# Full run: calls the configured models, about 15 minutes and $8.
# Needs OPENROUTER_API_KEY in climate-advisor/.env.
uv run python -m benchmark.scripts.evaluate --parallel --label my-change

# Save the run with the committed ones instead of output/cnb_golden_set/.
uv run python -m benchmark.scripts.evaluate --parallel --results-dir benchmark/results --label my-change
```

Runs go to `climate-advisor/output/cnb_golden_set/` by default, which git
ignores; open its `index.html` the same way. A run saved in `results/` updates
the website there; commit the new `results/runs/<run-id>/` folder together with
`results/runs/index.js`. `--fixture` and `--stage` select single documents or
stages; see `uv run python -m benchmark.scripts.evaluate --help`.
