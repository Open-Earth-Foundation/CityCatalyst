# GHGI Path A backtest (CC-950)

Engineering script. Product drops files and reads the report. Do not commit golden `.xlsx` files.

It runs each Path A file (exact eCRF and near-eCRF / Data Portal CRF) through `GhgiIngestPlugin`, then compares **stored inventory values** to the answer key or to the source file. It does **not** use the Excel/CSV export.

CIRIS is skipped until [CC-1217](https://linear.app/openearth/issue/CC-1217).

## Who does what

| Role | Action |
| --- | --- |
| Product | Add `.xlsx` files (and answer-key rows when you have control totals). Read `report.md`. |
| Engineering | Run the command after a Path A fix. Attach `report.md` to CC-950. |

## Prerequisites

- Work from `app/`
- Local Postgres with migrations applied
- `DEFAULT_ADMIN_EMAIL` in `.env` (an admin user in that database)
- `DEFAULT_PROJECT_ID` exists in the DB (default seed project)

Throwaway cities are named `XX P950 …`. They are reused on the next run, not deleted.

## Command

From `app/` in Command Prompt:

```
npx tsx scripts/ghgi-path-a-backtest.ts --files "C:\Users\frank\Desktop\ingestion-script-files"
```

`--files` is the folder of inventories. If omitted, the script looks for `./ingestion-script-files` relative to `app/`.

Output:

```
app\reports\ghgi-path-a\<timestamp>\report.md
app\reports\ghgi-path-a\<timestamp>\report.json
```

Attach `report.md` to the ticket. Reports are local and gitignored.

## Folder layout

Keep the answer-key workbook in the same folder as the city files:

```
ingestion-script-files\
  Answer_Keys_and_Results_eCRF_DP4C.xlsx
  DPC_eCRF_Melbourne_2022 (1).xlsx
  DPC_eCRF_Sydney_2022.xlsx
  Banana_CRFFormat_2022_20261106.xlsx
```

The script ignores the answer-key workbook as an inventory. Every other `.xlsx` is a candidate.

### Names it understands

| Kind | Example | How it is scored |
| --- | --- | --- |
| Data Portal / DPC | `DPC_eCRF_Sao_Paulo_2024_INPUT.xlsx` | Matched to the **Answer key** sheet by city name (`Sao_Paulo`, `Buenos_Aires`, …). `(1)` and `_INPUT` in the filename are fine. |
| CRFFormat (no key row) | `Banana_CRFFormat_2022_20261106.xlsx` | City = text before `_CRFFormat_`. Year = the four digits after that. Scored against the **source file**. Flag: `no workbook key row; scored against the source file`. |
| CityCatalyst export | `eCRF-inventory-MX MEX-2016.xlsx` | Treated as exact eCRF. Today only Mexico City is wired to a workbook row. |

CIRIS workbooks (many sheets, `eCRF_3`) are not a Path A target for this script.

## Add a file

**With a workbook total (DPC set)**

1. Put `DPC_eCRF_<City>_<year>.xlsx` in the folder.
2. Add a row on the **Answer key** sheet: city, file name, year, rows with values, notation mix, sector totals, file total, total excluding energy generation.
3. Ask engineering to rerun.

Sydney only started appearing once the file was in the folder; the row was already on the sheet.

**Without a workbook row (extra CRFFormat files)**

1. Name it `City_CRFFormat_<inventoryYear>_<yyyymmdd>.xlsx`.
2. Drop it in the folder.
3. Rerun. Totals are the sum of imported GPC values, excluding I.4.4 / III.x.3 / VI.1, same as the dashboard.

## What the columns mean

| Column | Meaning | Pass bar |
| --- | --- | --- |
| Path | Format the plugin used (`near-ecrf` or `ecrf`) | Must complete |
| Recall | Expected GPC refs that were stored | ≥ 99% |
| Precision | Stored GPC refs that were expected | ≥ 99% |
| Value acc | Among GPC refs present on both sides, share of totals within 0.1% | 100% |
| Class | Stored rows that have a GPC ref | ≥ 98% |
| Stored t | Dashboard total (kg stored ÷ 1000) | — |
| Excl. energy t | Answer-key “total excluding energy generation”, or source sum without omitted refs | within 0.1% of stored t |
| Pass | All bars above | yes / no |

Several eCRF_3 lines that share one GPC ref (for example I.1.1) count as **one** stored value. That matches how CityCatalyst saves data. Do not compare spreadsheet line count to GPC box count.

## Example: first DPC run

Command:

```
cd /d C:\Users\frank\Desktop\Workspace\oef\CityCatalyst-restored\app
npx tsx scripts/ghgi-path-a-backtest.ts --files "C:\Users\frank\Desktop\ingestion-script-files"
```

What you should see in the log at the end:

```
Ran 8 file(s).
Melbourne   near-ecrf  completed  100%  100%  100%  pass
Sydney      near-ecrf  completed  100%  100%  100%  pass
Sao Paulo   near-ecrf  completed  100%  100%  100%  pass
Buenos Aires … value acc 93.3%  pass no
```

Sydney **266,441 t** vs key **266,442 t** still passes (inside 0.1%). Buenos Aires fails because one GPC ref is outside 0.1% and the city total is 1 t high.

## Example: add CRFFormat cities

Drop files such as:

```
Abbey_CRFFormat_2015_20261106.xlsx
Banana_CRFFormat_2022_20261106.xlsx
Egedal Kommune_CRFFormat_2015_20261106.xlsx
```

Rerun the same command. They show up at the bottom of `report.md` with the source-file flag. 6 Nov 2026 run: 17 files (8 DPC + 9 CRFFormat). Abbey, Banana, Egedal passed. **Abadia de Goiás** failed value accuracy (91.7%) with no workbook key.

## After a Path A code fix

1. Run the command.
2. Attach the new `report.md` on [CC-950](https://linear.app/openearth/issue/CC-950/upload-inventory-flow-automated-backtest-on-the-cc-951-golden-set).
3. If a row is marked `key?` or “no workbook key row”, product checks the key or the file. If Pass is `no` with no key flag, treat it as an import bug.
