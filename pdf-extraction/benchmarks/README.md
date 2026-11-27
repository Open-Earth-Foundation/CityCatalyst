# Original-PDF extraction benchmark

The completed 81-attempt study and its limits are in
[ORIGINAL_PDF_RESULTS.md](ORIGINAL_PDF_RESULTS.md). Detailed private artifacts
remain in the ignored `runs/originals-v2/` directory.
The [per-report comparison table](BENCHMARK_TABLE.md) includes recall, precision,
value accuracy, classification, F1, row-total passes and failures. See also
[next steps](../NEXT_STEPS.md) and [known issues](../KNOWN_ISSUES.md).

The active catalogue contains only the supplied Round 1, Round 2, held-out and
Masterton C-032 development cases. Paris is excluded. Publisher replacement PDFs
and our small synthetic inputs were removed from active storage. The supplied
Miami scanned variant remains an original Product case. Earlier outputs remain
archived and are not part of the new frozen evaluation.

There are **28 cases, 27 PDF files and 710 answer-key rows** installed locally.
Repeated years can use the same PDF. Local PDFs, keys, schemas and outputs stay
in ignored `.local/` and `runs/`, outside Git and the Docker image. Structured
OCR context is uploaded as an additional agent-workspace file; local result
summaries record the provider, model, page coverage and reported OCR usage.

## Import the supplied originals

Original sources: [Round 1](https://drive.google.com/drive/folders/14N55wzvhOsPBqsNQt5eqlW0YC2HUTfiS),
[Round 2](https://drive.google.com/drive/folders/1pluOLWvWYoeg4UU2ZpEF5aVuMbW4bNMh),
and [held-out](https://drive.google.com/drive/folders/1ZBr-QHh7HgPYuouw1IF1YzOE18INvklg).

Run from Command Prompt:

```cmd
cd /d C:\Users\mirco\Projects\CityCatalyst\pdf-extraction
.venv\Scripts\python.exe -m examples.prepare_benchmarks --zip C:\Users\mirco\Downloads\round1.zip --zip C:\Users\mirco\Downloads\round2.zip --zip C:\Users\mirco\Downloads\holdout.zip
.venv\Scripts\python.exe -m examples.benchmark --list
```

Only fixed manifest filenames are read. ZIP paths cannot select output locations.
PDF signature, readability, encryption, page count and the 45 MiB limit are
checked. `.local/provenance.json` records ZIP/member, SHA-256, size and pages.
`--pdf-dir C:\originals` imports matching local originals. Different bytes under
the same canonical filename cause an error.

The four Product key sheets are exported into `.local/source-sheets/`:
[Round 1](https://docs.google.com/spreadsheets/d/1U_kmcA94N4fVNDHIVfSy6pHUarFor7GUblTgNHIjS6A/edit),
[Round 2](https://docs.google.com/spreadsheets/d/1qHawPFtkmFQ8tOG8_3AoOWbKpc_YT5aAXqUVnOpZ5Tc/edit),
[held-out](https://docs.google.com/spreadsheets/d/1Ap400QpjBHaXjG3XnTj4MirYOOeeU0uno8YW_zetDLg/edit),
and [Masterton development](https://docs.google.com/spreadsheets/d/1fi_z5Ykb3emfMCjGoggSbU-boB2T9KMSV4dIqDhzVs0/edit).
Rebuild the private normalized JSON after exporting those sheets:

```cmd
.venv\Scripts\python.exe -m examples.import_key_tables --source-dir benchmarks/.local/source-sheets --output benchmarks/.local/answer-keys.json
```

Expected answers are used only after extraction, never in agent prompts or repair
messages. Distractor parsing follows the upstream exporter, including its
approximate unsigned numeric matching and treatment of composite File ID cells.

## Source contract and development

`schemas/ghgi.schema.json` version 2 distinguishes selected reported total,
reported gross emissions, signed removals and reported net emissions. They remain
null when not printed. Source-based rounding tolerance supports an internal
reconciliation check without expected answers. Rows record their role, scope
basis and inclusion in the selected boundary. Gross excludes removals; a source
may exclude further categories from its gross definition. Excluded numeric rows
remain available for row classification. Unclear inclusion cannot pass strict
total checking.

Scope is explicit, source-inferred, combined or unknown. Combined values keep
scope null; no allocation is invented to satisfy a key. Source conflicts can
remain after repair and are reported separately from execution failures.

Start the server, then use a second Command Prompt for a paid development test:

```cmd
.venv\Scripts\python.exe -m uvicorn extractor.api:create_app --factory --host 127.0.0.1 --port 8081 --no-access-log
```

```cmd
.venv\Scripts\python.exe -m examples.benchmark --cases C-032 --run --mistral-ocr --auto-repair --max-repairs 3 --base-url http://127.0.0.1:8081 --output benchmarks/runs/development-masterton
```

A job permits one initial extraction plus **three repairs** by default. Result
JSON retains each checked round's candidate, issues, issue groups resolved/new/
persisting, changed data paths, turn ID, timestamps and best-effort usage. Array
paths are positional; a changed path is not proof of a changed logical fact.
Final output reports remaining issues and whether further review/repair is
needed. The frontend shows issue resolution and validation history live.

## Freeze and run the paired experiment

Finish development, restart the API, then:

```cmd
.venv\Scripts\python.exe -m examples.experiment --stage prepare
.venv\Scripts\python.exe -m examples.experiment --stage round2 --execute
.venv\Scripts\python.exe -m examples.experiment --stage held-out --execute
.venv\Scripts\python.exe -m examples.experiment --stage report
start "" "benchmarks\runs\originals-v2\comparison.html"
```

Preparation pins code, prompts/schema, input PDFs, keys, scorer hashes, model
(`gpt-6.1-sol`), medium reasoning, Mistral model and three-repair budget in
`runs/originals-v2/plan.json`. The API reports its startup fingerprint: stale
servers and changed files/settings block further submissions.

Round 2 has 66 jobs: 11 eligible reports, OCR off/on, three attempts each.
At most three independent jobs run at once (`--workers 1` makes it sequential).
The condition is selected only from Round 2 using the rule written before
evaluation in the plan. The final held-out stage has five cases times three
attempts (15 jobs) with the selected condition. No subsequent tuning uses their
answers. C-028 and C-031 were already marked not fully held out.

Repeating a stage resumes saved job IDs; completed jobs are not resubmitted.
Unknown submissions stop new sends for reconciliation. Do not delete checkpoints
to force retries: inspect the existing job and OpenAI session first.
`--output PATH` creates/selects a separate experiment. Stages without
`--execute` only validate; `--stage report` makes no provider calls.
The schema, prompt, model and repair budget stay identical between OCR modes.
OCR off disables **Mistral preprocessing only**. The agent retains its built-in
PDF text, image and available local OCR tools in both conditions. Every OCR-on
attempt makes its own Mistral request; original PDFs remain available alongside
the structured OCR context.

The first batch exposed closed local polling sockets. Its client-only recovery
amendment is recorded in the plan, with old/new client hashes and interrupted
attempts. Existing session IDs were resumed, without replacing extraction
attempts. A brief overlap above the intended concurrency is disclosed as a
latency limitation. The PDF bytes, prompts, schema, model, server, scorer and
repair budget stayed frozen. Read-only GETs now reconnect; unknown submission
POST outcomes still stop new work for reconciliation.

## Metrics and old baseline

Outputs include `comparison.md`, standalone `comparison.html`, `scores.json`
and `scoring/scoring-input.json`. They cover per-city/condition results,
execution failures, repair use, remaining issues, time and usage. Both new rows
and saved old rows use the unchanged cached CityCatalyst PDF scorer and the same
Product keys. Upstream Git blob hashes are verified. This is an artifact
comparison, not a CityCatalyst import test.

- Primary recall/precision count failed attempted row-scored cases as zero.
  Total-only cases have no row metrics. Conditional classification includes only
  defined denominators, with defined-attempt and failure counts shown.
- Value accuracy is conditional on finding expected references; 100% does not
  establish coverage. Subsector recall does not establish scope correctness.
  The upstream PDF profile permits parent-reference aggregation and treats an
  expected zero row as matched by an absent stored row. These are the shared
  benchmark rules, not independent proof that every source row was inspected.
- At the scorer boundary, an unsplit parent such as `I.1` is represented as
  `I.1.x`, the legacy key's wildcard syntax. Its scope stays null or keeps its
  original value; no numeric child code or scope allocation is invented. This
  same answer-independent mapping applies to both pipelines. It matches an
  all-scopes key, but cannot satisfy an exact scoped reference. An evaluator
  amendment fixes the earlier failure to recognize these valid aggregates;
  preliminary scores, the old adapter and its hashes are preserved in the run.
- Totals use source-based inclusion and fixed upstream GPC exclusions. Unknown
  GPC numeric rows remain in totals and precision. Excluded rows remain available
  to row scoring. Printed-total correctness does not prove correct row sums.
  The reported-total diagnostic compares to the key's target, which can be a
  GPC-normalized row sum rather than a printed source headline; a mismatch is
  not independent proof that the printed number was copied incorrectly.
- Notation recovery, missing/unexpected groups and distractor candidates are
  reported. Distractor matches can be coincidental and do not impose an additional
  precision penalty. Source evidence quotes are not independently verified.
- A matching integer reporting-year label does not prove the right source
  period or table column was selected. Financial-year start/end conventions and
  gross/net boundaries need explicit input guidance; they remain separate from
  source-number and row-sum checks.
- Usage is best-effort, not a final bill. Cached tokens are included in input;
  reasoning tokens are included in output. Session and turn usage are not added
  together. Missing usage is unknown.

The historical reference is the
[12 November run from PR #3424](https://github.com/Open-Earth-Foundation/CityCatalyst/blob/21797f86236243f83ee84e3545cabb0b913ccde9/docs/ingestion-accuracy-runs/2026-11-12-1722-fe14d3a05/report.md):
Mistral OCR plus `openai/gpt-5.6-luna`, three attempts per case. Round 2 has
33 attempts and held-out 15, including truncation/empty-output failures. Recorded
row-total passes were 12/33 and 5/15. This is not verified current deployed
performance. Different model/prompt mean old/new results measure complete
pipelines; OCR on/off isolates added Mistral within the agent pipeline.
The archived old report has no per-PDF hashes, so its byte identity with the
newly supplied originals cannot be verified. The new on/off conditions use the
same verified original bytes for every repetition.
Historical model names are recorded metadata. Legacy usage/cost figures are not
used for a quantitative old/new resource comparison: the archived runner wraps
its logger meter repeatedly across contexts and reads model labels/prices from
legacy environment settings. New OCR on/off usage comes from Agents API session
accounting, with unknown values and coverage shown explicitly.

Earlier exploratory results are in [INITIAL_RUNS.md](INITIAL_RUNS.md).

## Reproduce the completed reports from saved artifacts

The public table is checked in as source for review, but raw inputs and full run
evidence are deliberately ignored. A fresh checkout needs access to the saved
artifact bundle before it can recreate the historical results without paid work:

| Local path under `benchmarks/` | Required contents |
| --- | --- |
| `.local/pdfs/` and `.local/provenance.json` | Original PDFs and their installation hashes |
| `.local/answer-keys.json` | Normalized Product keys, used only after extraction |
| `.local/recorded-benchmark.json`, `.local/comparison-source.json`, `.local/upstream/` | Archived old outputs, source pointers and pinned scorer code |
| `runs/originals-v2/` | Frozen plan, saved jobs/candidates, input audit and usage reconciliation |

The archived old report is linked above; the original PDF folders and key sheets
are linked in the import section. The saved extraction-output bundle is local
experiment evidence, not something a teammate receives from Git. Packaging and
sharing that bundle remains an explicit [next step](../NEXT_STEPS.md).

From `pdf-extraction` in Command Prompt, with that bundle installed:

```cmd
.venv\Scripts\python.exe -m examples.experiment --stage report
.venv\Scripts\python.exe -m examples.analyze_repairs
.venv\Scripts\python.exe -m examples.audit_experiment
```

These commands make no provider calls. The last two reporters are now part of
the branch rather than scripts stored only in an ignored run directory. The
audit's interpretation is specific to this frozen study; use
`examples.experiment --stage report --output PATH` for another study's report.
The generated `runs/originals-v2/benchmark-table.md` is the source of the public
[BENCHMARK_TABLE.md](BENCHMARK_TABLE.md) snapshot.

## Offline tests

```cmd
.venv\Scripts\python.exe -m pytest -c pyproject.toml tests -q
```

Tests cover answer isolation, exact PDF binding, semantic checks, scope
uncertainty, three-repair limits, recovery, balanced workloads, failure accounting,
selection isolation, frozen-input drift, HTML escaping and upstream scoring.
Tests needing the private prepared data/scorer skip explicitly when absent.
