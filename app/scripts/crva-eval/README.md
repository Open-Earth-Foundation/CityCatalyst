# CRVA accuracy eval (CC-1285)

Engineering scripts. They run the CRVA ingest adapter on a city PDF, then score the result against the gold `.xlsx` (the Gold tab of the Sheet, downloaded locally). Do not commit PDFs, gold files or `reports/`. Nothing here calls Google or writes to the Sheet.

## Prerequisites

- Work from `app/`.
- `OPENAI_API_KEY` and `MISTRAL_API_KEY` in `.env` (extraction and OCR).
- `LLM_BASE_URL`, if set, must match the provider of `OPENAI_API_KEY`.
- `JUDGE_MODEL` in `.env`: the model that grades the extraction. `score-run.ts` exits with `JUDGE_MODEL is not set` without it.
- The extraction model is not an env var. It is the `crva_extraction` role in `llm_config.yaml`. The judge reuses that role with `JUDGE_MODEL` swapped in.

## Commands

From `app/` (forward slashes work in Command Prompt and PowerShell too):

```
npx tsx scripts/crva-eval/run-adapter.ts --pdf <path-to-pdf> --city buenos-aires --runs 1
```

`--runs` must be a positive integer. Check `runs.md` in the new folder: status ok, part pages and drop reasons listed. Then:

```
npx tsx scripts/crva-eval/score-run.ts --gold <path-to-gold.xlsx> --run reports/crva-eval/buenos-aires/<timestamp>/run-1.json --city buenos-aires
```

Options: `--max-part-mib <n>` on `run-adapter.ts` sets the largest PDF part (default 15). On `score-run.ts`, fields already in `judge.jsonl` are reused, and only v0 fields missing from it are sent to the judge (LLM calls); `--rejudge` renames the existing log to `judge.<timestamp>.jsonl` and judges every field again; `--seed 1285` changes the review sample. `--pdf <path> [--max-part-mib 15]` is for run files recorded before part pages existed: it splits the PDF again (deterministic) and, if the page count matches the gold and the part count matches the run, `report.md` shows the part pages labelled "recomputed from the PDF"; otherwise it warns and keeps "part pages not recorded". It is ignored when the run file already has part pages, and the run file is never rewritten.

`score-run.ts` refuses a failed run (`bundle` null) and a gold file whose `PDF pages` differs from the run's page count. It warns when the Header's PDF file name differs from the run's file (case and an `_escaneado` suffix are ignored). Only the 12 v0 fields with at least one value are judged; a field whose judge call fails twice is listed in `report.md` under Run and shown as `field not judged`.

## OCR once, compare extractors

`ocr-pdf.ts` runs Mistral OCR on a PDF once (paid) and saves it, so the agentic extractor ([`../crva-agent/README.md`](../crva-agent/README.md)) and the quote check for Mirco's pipeline ([`../crva-mirco/README.md`](../crva-mirco/README.md)) can reuse it:

```
npx tsx scripts/crva-eval/ocr-pdf.ts --pdf <path-to-pdf> --city buenos-aires [--max-part-mib 15] [--out <dir>]
```

It writes `reports/crva-eval/<city>/ocr/` (or `--out`): the page texts and figures. Agent runs are saved in the run-file shape, so `score-run.ts` scores them like adapter runs.

`compare.ts` puts run directories side by side (v0, agent A, agent B) in one markdown table:

```
npx tsx scripts/crva-eval/compare.ts --label v0 --dir <run dir> --label A --dir <run dir> --label B --dir <run dir> [--out <file>]
```

It reads `run-<n>.json` and `score-run-<n>/scored.json` of each directory. Only runs that are ok and scored are used, for every number. The `Runs` column shows how many, plus failed runs and ok runs without a score (`2 (1 failed, 1 unscored)`). One row per label: runs; share correct in the v0 fields under the accepted rule (min-max over runs); v0 coverage and precision under the accepted rule (the mean of the per-run rates; same functions and v0-field filter as `report.md`, so a single run matches it); values kept, dropped share, minutes, prompt and completion tokens, and model turns (means; model turns for agent runs only, `—` for v0).

## Output

`app/reports/crva-eval/<city>/<timestamp>/` (under `app/` whatever the working directory):

| File                        | Content                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `run-<n>.json`, `runs.md`   | Adapter output and run statistics, including the part page ranges and dropped values per reason               |
| `score-run-<n>/scored.csv`  | Columns to paste into the Sheet                                                                               |
| `score-run-<n>/scored.json` | The same rows with the judge's reasons, partial reason, error cause and the gold side                         |
| `score-run-<n>/judge.jsonl` | One line per judge call (request, response, judgments or error)                                               |
| `score-run-<n>/review.csv`  | Uncertain rows plus a seeded sample of confident verdicts, gold and model side by side, for a person to check |
| `score-run-<n>/report.md`   | Share correct, coverage, precision, verdict counts, status matrix, examples, traps, thresholds, run details   |

Verdict, partial reason and error cause definitions are provisional (from the xlsx, the ticket and the first Buenos Aires run) until the answer key doc is available; they live in `judge.ts`. Besides its own field, the judge sees the other fields' gold rows (at most 40 per field, values cut to 120 characters), so it can name the row a misattributed value belongs in. A `judge.jsonl` written before partial reasons and causes existed scores with both empty, so rerun with `--rejudge` to fill them. The 80% threshold is evaluated on the v0 fields; `report.md` shows the overall share beside it.

A Partial carries one partial reason: `trimmed_wording` (same item and meaning in shorter wording, every number, percentage, year and unit of the gold present), `missing_figure` (one of those is missing or vaguer, for example "most of the city" for "62%"), `incomplete_list` or `merged_items`. `report.md` shows share correct, coverage and precision in two views, the accepted rule first: the **accepted rule** (Magdalena, 2026-11-17) also counts Partial with `trimmed_wording` as right, and **full detail** does not (share and coverage count Correct and Correct (NOT_FOUND); precision counts Correct and Normalisation). Precision covers every model value, duplicates included: a duplicate (a second value on a gold row that already has one) has no verdict in the Sheet, but precision grades it by the judge's own verdict and partial reason, and `report.md` states how many values are duplicates. Share correct in full detail is the ticket formula. The accepted rule is the official one: the 80% v0 threshold passes or fails on it, with the full-detail result beside it, and the per-field v0 table shows both forms. A `judge.jsonl` written with the old `less_detail` reason is not supported (its Partial rows count under neither view nor any reason row); rerun with `--rejudge`. The section "Examples where model and gold differ" lists up to 5 rows per partial reason and for Wrong content (sorted by field, then item key; text cut at 300 characters), gold and model side by side, to share with the gold owner.

## Paste into the Sheet

1. Open the Gold tab. If there is no `model status` column after `model evidence`, insert one. If there is no `eval notes` column at the end of the tab, add one.
2. Open `scored.csv`. Check that `gold_row` lines up with the Sheet row numbers.
3. Paste the columns `model value` to `verdict` at row 2 of the `model value` column.
4. Paste the `eval notes` column of the CSV at row 2 of the `eval notes` column, for every row. Never paste eval notes into the gold `notes` column of gold rows: that column is the annotator's.
5. For extra and duplicate rows (empty `gold_row`), also paste `field_id` and `item_key` into the `field_id` and `item_key` columns of the new rows at the end of the Sheet.

## Judge stability

`gpt-5.6-sol` rejects `temperature: 0` and the shared LLM client sends no seed, so two judgings of one run can differ. To measure it, judge the same run again into another directory and compare. From `app/`:

1. `npx tsx scripts/crva-eval/score-run.ts --gold <xlsx> --run <run-1.json> --city <slug> --out score-run-1-b` (`--out` is a plain directory name next to the run file; default `score-run-<n>`; paths are rejected).
2. `npx tsx scripts/crva-eval/judge-stability.ts --a <run dir>/score-run-1 --b <run dir>/score-run-1-b` writes `judge-stability.md` into the run directory: both sides' headline numbers (share correct, coverage and precision, each under the accepted rule first and in full detail beside it), gold rows keyed by sheet row with the same verdict and model status, model values keyed by field, value and evidence with the same verdict (values present on one side only are listed), a per-field table for v0 fields, up to 50 changed rows, and the judge models read from each `judge.jsonl`.

## Judge calibration

A Claude reviewer (an LLM, so this measures agreement between models, not human truth) checks a stratified sample of the judge's verdicts. From `app/`:

1. `npx tsx scripts/crva-eval/calibration.ts sample --scored <score-run-n/scored.json> --blind [--seed 1] [--size 40]` writes `calibration-sample.csv` (the key, with the judge's columns) and, with `--blind`, `calibration-reviewer.csv` (same rows and order, with opaque ids `r1..rN` in a `blind id` column; no judge columns, `row id` or `gold_row`, which would reveal the row kind). The sample has every verdict present, at least 10 uncertain rows, GOLD GAP and duplicate rows, then random fill. N/A and not-judged rows are never included. Give the reviewer only the blind copy, so the judge's answer does not anchor it.
2. The reviewer fills `reviewer verdict`, `reviewer partial reason`, `reviewer cause` and `reviewer note`. For GOLD GAP rows the judge's "verdict" is that label, and the reviewer may answer with the label or a verdict. A duplicate row shows the verdict the judge gave its value (`judgeVerdict` in `scored.json`), although the Sheet and the report still give duplicates no verdict; only a `scored.json` written before `judgeVerdict` existed shows the label `duplicate`.
3. `npx tsx scripts/crva-eval/calibration.ts score --sample <calibration-sample.csv> --reviewer <filled calibration-reviewer.csv>` joins the reviewer columns onto the key by `blind id` (unknown, missing or duplicate ids are errors) and writes `calibration.md`: review mode (verdict-blind or not blind; the gold alignment stays visible by design), overall and per-verdict agreement, confusion table, partial-reason and cause agreement, unrecognised reviewer values (counted as disagreements; casing is normalised first), disagreements. Without `--reviewer` the reviewer columns are read from the sample file and the report says the review was not blind. Target is 85% overall; below that, adjust the judge prompt.
