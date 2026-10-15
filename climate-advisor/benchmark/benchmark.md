# CNB golden-set benchmark results

Saved runs of the Concept Note Builder golden-set benchmark and the static
website for browsing them. The benchmark runs three fixture documents (Harbor
Point, Kraków, Richfield) through four stages — extraction, chapter writing,
verification, editing — and an LLM judge scores each stage against the golden
expectations in `service/tests/fixtures/cnb_golden_set/`.

## What is here

| Path | Contents |
| --- | --- |
| `index.html`, `app.js` | The website (no build step, no server needed). |
| `runs/index.js` | Summary of every saved run, for the run picker and run comparison. |
| `runs/<run-id>/report.md` | Human-readable scores, failures, time and cost of one run. |
| `runs/<run-id>/report.json` | The same report as data. |
| `runs/<run-id>/outputs/` | What the pipeline produced per document and stage, and the judge's verdicts. |
| `runs/<run-id>/viewer.js` | Snapshot the website loads for that run. |

Saved run: `20261014-232449-five-fixes` (current implementation, commit
`0026fa7b2`; producers `openai/gpt-5.6-terra`, judge and edit planner
`openai/gpt-6-sol`). Its recorded cost ($7.03) misses about $0.78 of streamed
edit-planner calls, which were recorded from later runs on.

## Open the website

From `climate-advisor/`, open `benchmark/index.html` in a browser:

```bash
start benchmark/index.html      # Windows
open benchmark/index.html       # macOS
xdg-open benchmark/index.html   # Linux
```

Or serve it locally and open http://127.0.0.1:8765:

```bash
python -m http.server 8765 --directory benchmark
```

The "Open original PDF" buttons need the PDFs copied next to the site once
(they are kept out of git; the originals are in the fixtures folder):

```bash
uv run --directory service python -m scripts.cnb_golden_set_viewer.publish --results-dir ../benchmark
```

## What to look at

- **Overview** — pass/fail per document and stage for the selected run.
- **1 · Extraction … 4 · Editing** — every judge verdict with the quoted evidence.
- **Harbor Point / Kraków / Richfield** — one document: golden expectations, each
  stage's output, the reference draft, and **Source document** with the golden
  facts listed on the left; click a fact to jump to its passage.
- **Compare runs** — pick run A and run B to see what changed (models, prompts,
  scores, time and cost, individual verdicts) and the history of all runs.
- **Run** (top right) — switch the run every page shows.

## Add a run

A run calls the configured models (about 15 minutes and $8 for all three
documents) and needs `OPENROUTER_API_KEY` in `climate-advisor/.env`:

```bash
uv run --directory service python -m scripts.evaluate_cnb_golden_set --parallel --results-dir ../benchmark --label my-change
```

The run is saved under `runs/<timestamp>-my-change/` and the website updates
itself; commit the new run folder together with `runs/index.js`. Without
`--results-dir` runs go to `output/cnb_golden_set/`, which git ignores. See the
golden-set section of `climate-advisor/README.md` for running single fixtures or
stages.
