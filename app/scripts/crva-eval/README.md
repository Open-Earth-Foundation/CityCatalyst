# CRVA accuracy eval (CC-1285)

Engineering scripts. They run the CRVA ingest adapter on a city PDF, then score the result against the gold `.xlsx` (the Gold tab of the Sheet, downloaded locally). Do not commit PDFs, gold files or `reports/`. Nothing here calls Google or writes to the Sheet.

## Prerequisites

- Work from `app/`.
- `OPENAI_API_KEY` and `MISTRAL_API_KEY` in `.env` (extraction and OCR).
- `JUDGE_MODEL` in `.env`: the model that grades the extraction. `score-run.ts` exits with `JUDGE_MODEL is not set` without it.
- The extraction model is not an env var. It is the `crva_extraction` role in `llm_config.yaml`. The judge reuses that role with `JUDGE_MODEL` swapped in.

## Commands

From `app/` in Command Prompt:

```
npx tsx scripts/crva-eval/run-adapter.ts --pdf "C:\Users\david\Downloads\Analisis_Riesgos_Climaticos_CABA_2020_escaneado.pdf" --city buenos-aires --runs 1
```

Check `runs.md` in the new folder: status ok, parts and boundaries listed. Then:

```
npx tsx scripts/crva-eval/score-run.ts --gold "C:\Users\david\Downloads\Buenos_Aires_CRVA_2020.xlsx" --run reports\crva-eval\buenos-aires\<timestamp>\run-1.json --city buenos-aires
```

Options: `--rejudge` calls the judge again (otherwise an existing `judge.jsonl` is reused and no LLM calls are made), `--seed 1285` changes the review sample.

A failed run (`bundle` null) is refused. Only the 12 v0 fields with at least one value are judged; a field whose judge call fails twice is listed in `report.md` under Run and shown as `field not judged`.

## Output

`reports/crva-eval/<city>/<timestamp>/`:

| File                        | Content                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| `run-<n>.json`, `runs.md`   | Adapter output and run statistics                                                |
| `score-run-<n>/scored.csv`  | Columns to paste into the Sheet                                                  |
| `score-run-<n>/scored.json` | The same rows with the judge's reasons                                           |
| `score-run-<n>/judge.jsonl` | One line per judge call (request, response, judgments or error)                  |
| `score-run-<n>/review.csv`  | Uncertain rows plus a seeded sample of confident verdicts, for a person to check |
| `score-run-<n>/report.md`   | Share correct, verdict counts, status matrix, traps, thresholds, run details     |

Verdict definitions are provisional (from the xlsx and the ticket) until the answer key doc is available.

## Paste into the Sheet

1. Open the Gold tab. If there is no `model status` column after `model evidence`, insert one.
2. Open `scored.csv`. Check that `gold_row` lines up with the Sheet row numbers.
3. Paste the columns `model value` to `verdict` at row 2 of column H.
4. For extra and duplicate rows (empty `gold_row`), also paste `field_id` and `item_key` into the `field_id` and `item_key` columns of the new rows at the end of the Sheet, and put `eval notes` into `notes`. Never overwrite the annotator's notes on gold rows.
