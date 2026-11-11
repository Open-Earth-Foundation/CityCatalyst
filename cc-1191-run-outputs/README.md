# CC-1191 run outputs

Outputs of the ingestion accuracy harness (PR #3317) for the model comparison in PR #3364. This branch only shares these files; it is not meant to be merged.

Each run folder has `report.md` (per-case numbers), `results.json` (raw data) and, where the harness wrote them, `gate.md` and `cases/<case>/` with the answer key and the extracted rows. Each `report.md` names the commit, the extraction model and the number of runs per file.

## 2026-10-29

- Code: `18953fec8` (`openai-direct/`: `bdd25e7ef`). One run per case. Answer keys v2.
- `luna6/`: gpt-6-luna through OpenRouter, 18 folders. The C-024 folder is missing: the C-025 run overwrote it.
- `luna56/`: gpt-5.6-luna through OpenRouter, 6 folders.
- `terra/`: gpt-6.1-terra through OpenRouter, 6 folders.
- `openai-direct/`: one case (C-023) on the OpenAI API directly at `bdd25e7ef`, for gpt-5.6-luna and gpt-6-luna with reasoning effort low.
- `code-under-test.patch`: local changes on top of the commit during these runs.

## 2026-11-11

- Code: `dccf79867`. OpenAI API directly. Two runs per file. Answer keys v3.
- Cases: C-015 (Rosario) and C-018 (Santiago).
- `luna6/`: gpt-6-luna. `luna56/`: gpt-5.6-luna (control).
- Rosario run 1 on gpt-6-luna has no score: the approve route answered 409 `import-rows-pending` (rows waiting for a review decision), which the harness does not answer. The report averages the runs that finished.

## Limits

- The extraction code changed between the two dates (CC-1161, CC-1162, strict JSON schema, CC-1201), and the answer keys changed from v2 to v3. Numbers from the two dates do not compare directly.
- Both models used the same prompt, tuned for gpt-5.6-luna.
- Two runs per model show an indication, not a rate.
