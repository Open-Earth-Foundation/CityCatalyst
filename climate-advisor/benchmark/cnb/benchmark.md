# CNB golden-set benchmark

Everything for the Concept Note Builder benchmark lives in this folder. The
benchmark runs three fixture documents (Harbor Point, Kraków, Richfield) through
the real production pipeline in four stages — extraction, chapter writing,
verification, editing — and an LLM judge scores each stage against the golden
expectations. Production code never imports anything from here, and the
service's Docker image does not include it.

## What is here

### Grant point and file scoring

Run the grant evaluation on the workspace snapshot taken **after all allowed city files finish reading and before anyone edits a point**. The historical Krosno replay uses the three December 2021 source documents. The completed application, later reports and the answer key are reserved for scoring. The working EUCF setup contains no Krosno answers.

From the `climate-advisor` folder, set `PYTHONPATH=service` and run:

```text
python -m benchmark.cnb.scripts.score_points --workspace workspace.json --answer-key answer-key.json --policy benchmark/cnb/fixtures/krosno-eucf-scoring.json --output output/krosno-score
```

The JSON answer key is the version supplied with JVP's [Krosno benchmark](https://github.com/Open-Earth-Foundation/CityCatalyst/pull/3462). File placement is compared against the categories in the policy. For point matching, the scorer checks the support level, source filename and physical page (within one page), then asks the configured golden-set judge to compare the English value and Polish quotation to the independent key. Point precision is the share of reported answers or partial findings that meet these checks. Recall is the share of expected full or partial findings recovered. City profile candidates are excluded from this documents-only replay. Missing inputs stop scoring.

Open `report.html` for point rows and the historical per-chapter gold-set results side by side. On 27 November 2026 Piotr Nowakowski approved 90% correct sorting, 90% point precision and 80% point recall for the Krosno pilot. The primary score covers 35 points. Eleven disputed points from JVP's draft key are reported separately pending Polish-language review. The scorer records the input hashes and policy in `scores.json`. Set `--judgments` to reuse reviewed findings for precisely the same candidate inputs. A second grant uses its own setup, key and policy with the same command.

The unit of scoring is one form point. A correct cited candidate earns credit for finding the point even when the reader also offers another value. The report separately counts points with competing full values that need a person to choose between them.

The first official Krosno run correctly filed all three documents. On the 35 primary points, precision was 2/22 and recall was 2/22 (9.1% each). On the eleven disputed points, precision was 1/5 and recall was 1/8. Both primary point metrics fell below the pilot thresholds. [First pilot report](results/runs/20261127-krosno-eucf-first/report.html) · [Score and input fingerprints](results/runs/20261127-krosno-eucf-first/scores.json).

The revised reader used the current municipality and bilingual search terms for each group of requirements. In a fresh workspace, it classified 3/3 files correctly. Primary precision rose to 13/25 (52.0%) and recall to 13/22 (59.1%). Among the eleven disputed points, precision was 3/7 and recall was 3/8. Both runs used the same answer key, page tolerance and thresholds. The second run also fell below the point-finding thresholds. [Second pilot report](results/runs/20261127-krosno-eucf-second/report.html) · [Score and input fingerprints](results/runs/20261127-krosno-eucf-second/scores.json).

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

The site is generated, not committed. From `climate-advisor/`, build it from
`viewer/` and the saved runs (no model calls, no network):

```bash
uv run python -m benchmark.cnb.scripts.publish --results-dir benchmark/cnb/results
```

Then open `benchmark/cnb/results/index.html` in a browser (no server needed):

```bash
start benchmark/cnb/results/index.html      # Windows
open benchmark/cnb/results/index.html       # macOS
xdg-open benchmark/cnb/results/index.html   # Linux
```

Or serve it and open http://127.0.0.1:8765:

```bash
python -m http.server 8765 --directory benchmark/cnb/results
```

The "Open original PDF" buttons also need the PDFs, which are kept out of git:
place each pinned `source.pdf` in its fixture folder (see `fixtures/README.md`)
before running `publish`. Rerun `publish` after pulling viewer or run changes.

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
# Needs the pinned source.pdf files placed locally (they are not in git).
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
