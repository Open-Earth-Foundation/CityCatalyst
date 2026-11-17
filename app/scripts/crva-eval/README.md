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

Options: `--max-part-mib <n>` on `run-adapter.ts` sets the largest PDF part (default 15). On `score-run.ts`, fields already in `judge.jsonl` are reused, and only v0 fields missing from it are sent to the judge (LLM calls); `--rejudge` renames the existing log to `judge.<timestamp>.jsonl` and judges every field again; `--seed 1285` changes the review sample.

`score-run.ts` refuses a failed run (`bundle` null) and a gold file whose `PDF pages` differs from the run's page count. It warns when the Header's PDF file name differs from the run's file (case and an `_escaneado` suffix are ignored). Only the 12 v0 fields with at least one value are judged; a field whose judge call fails twice is listed in `report.md` under Run and shown as `field not judged`.

## Output

`app/reports/crva-eval/<city>/<timestamp>/` (under `app/` whatever the working directory):

| File                        | Content                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `run-<n>.json`, `runs.md`   | Adapter output and run statistics, including the part page ranges and dropped values per reason               |
| `score-run-<n>/scored.csv`  | Columns to paste into the Sheet                                                                               |
| `score-run-<n>/scored.json` | The same rows with the judge's reasons, partial reason, error cause and the gold side                         |
| `score-run-<n>/judge.jsonl` | One line per judge call (request, response, judgments or error)                                               |
| `score-run-<n>/review.csv`  | Uncertain rows plus a seeded sample of confident verdicts, gold and model side by side, for a person to check |
| `score-run-<n>/report.md`   | Share correct, value-level share, verdict counts, status matrix, traps per entry, thresholds, run details     |

Verdict, partial reason and error cause definitions are provisional (from the xlsx, the ticket and the first Buenos Aires run) until the answer key doc is available; they live in `judge.ts`. A `judge.jsonl` written before partial reasons and causes existed scores with both empty, so rerun with `--rejudge` to fill them. The 80% threshold is evaluated on the v0 fields; `report.md` shows the overall share beside it.

## Paste into the Sheet

1. Open the Gold tab. If there is no `model status` column after `model evidence`, insert one. If there is no `eval notes` column at the end of the tab, add one.
2. Open `scored.csv`. Check that `gold_row` lines up with the Sheet row numbers.
3. Paste the columns `model value` to `verdict` at row 2 of the `model value` column.
4. Paste the `eval notes` column of the CSV at row 2 of the `eval notes` column, for every row. Never paste eval notes into the gold `notes` column of gold rows: that column is the annotator's.
5. For extra and duplicate rows (empty `gold_row`), also paste `field_id` and `item_key` into the `field_id` and `item_key` columns of the new rows at the end of the Sheet.

## Judge calibration

A Claude reviewer (an LLM, so this measures agreement between models, not human truth) checks a stratified sample of the judge's verdicts. From `app/`:

1. `npx tsx scripts/crva-eval/calibration.ts sample --scored <score-run-n/scored.json> --blind [--seed 1] [--size 40]` writes `calibration-sample.csv` (the key, with the judge's columns) and, with `--blind`, `calibration-reviewer.csv` (same rows and order, without the judge columns). The sample has every verdict present, at least 10 uncertain rows, GOLD GAP and duplicate rows, then random fill. N/A and not-judged rows are never included. Give the reviewer only the blind copy, so the judge's answer does not anchor it.
2. The reviewer fills `reviewer verdict`, `reviewer partial reason`, `reviewer cause` and `reviewer note`. For GOLD GAP and duplicate rows the judge's "verdict" is that label, and the reviewer may answer with the label or a verdict.
3. `npx tsx scripts/crva-eval/calibration.ts score --sample <calibration-sample.csv> --reviewer <filled calibration-reviewer.csv>` joins the reviewer columns onto the key by `row id` (unknown or missing ids are errors) and writes `calibration.md`: review mode (blind or not), overall and per-verdict agreement, confusion table, partial-reason and cause agreement, unrecognised reviewer values (counted as disagreements; casing is normalised first), disagreements. Without `--reviewer` the reviewer columns are read from the sample file and the report says the review was not blind. Target is 85% overall; below that, adjust the judge prompt.
