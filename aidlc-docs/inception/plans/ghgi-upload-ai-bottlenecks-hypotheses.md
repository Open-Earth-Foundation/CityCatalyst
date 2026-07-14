# GHGI Upload AI — Bottlenecks & Hypotheses

**Project**: CityCatalyst (Brownfield)
**Created**: 2026-07-14T01:10:00Z
**Status**: Hypotheses only — **NOT measured claims**
**Document Language**: English
**Measurement plan**: `aidlc-docs/inception/plans/ghgi-upload-ai-baseline-measurement-plan.md`

> **Labeling rule**: Every item below is a **code-backed hypothesis**. Do not treat as proven latency/cost facts until the baseline results table supports it. Do not implement “fixes” from this list until the baseline gate passes.

---

## 1. Context Map (Code + Notion)

| Layer | Source of truth |
|-------|-----------------|
| UI wizard, status machine, polling, RTK | Notion: GHGI Upload Inventory — Import Flow Architecture |
| Path B AI | `POST .../import/{id}/interpret` → `interpret/route.ts` + `AIInterpretationService.ts` (+ `FormatAdapterService`) |
| Path C AI | `POST .../import/{id}/extract` → `extract/route.ts` + `InventoryExtractionService.ts` |
| LLM client defaults | `app/src/backend/llm/config.ts`, `client.ts`, `openai-adapter.ts` |
| Controls | Path A / near-eCRF via `import/route.ts` (no LLM) |

---

## 2. Hypotheses

### H1 — Sequential LLM chunk loops dominate wall-clock

**Claim (unvalidated):** For multi-chunk jobs, wall-clock ≈ sum of sequential LLM call latencies (plus poll jitter), not parallel overlap.

**Code pointers:**

- Path B: sequential `for` over shape chunks in `interpret/route.ts` (`shapeTableToRows` / `shapeTableToRowsForCIRIS` per chunk).
- Path C: chunked extraction in `InventoryExtractionService.ts` with `onChunkProgress`; extract route persists `extractionProgress` per chunk.

**Baseline metrics:** M2, M4, M5.

---

### H2 — Path B always pays interpret + up to 15 shape calls; cap may truncate

**Claim (unvalidated):** Non-eCRF Path B typically calls `interpretTabular` once, then shapes up to `MAX_TABLE_SHAPE_CHUNKS = 15` chunks (`chunkSize` 100 rows, or 200 if CIRIS). Files needing more than 15 chunks may silently omit remaining rows.

**Code pointers:**

- `MAX_TABLE_SHAPE_CHUNKS = 15` and `getTableShapeChunks` in `interpret/route.ts`
- `chunkSize = isCIRIS ? 200 : 100`
- `interpretTabular` then chunk loop (~lines using `getTableShapeChunks` / `shapedRows.push`)

**Baseline metrics:** M4 vs spreadsheet row count; M7 `rowCount`; notes if shaped rows << source rows.

---

### H3 — Path C has extraction progress UX; Path B does not

**Claim (unvalidated):** User-perceived quality gap: PDF path can show determinate progress when `extractionProgress.total > 1`; interpret path has no equivalent per-chunk progress in `ImportPage`.

**Code / docs pointers:**

- Notion §5 Extraction progress; `import/page.tsx` `extractionProgress` state
- Extract route writes `mappingConfiguration.extractionProgress`
- Interpret route logs `chunkCount` but does not mirror progress into mappingConfiguration for UI

**Baseline metrics:** M8 observation (qualitative). Optimization candidate after gate (Q4 = A).

---

### H4 — Large maxTokens / retries / 90s timeout amplify cost and failure modes

**Claim (unvalidated):** High completion budgets and retries increase cost and can stretch wall-clock on failures; 90s default timeout may fail long chunks or encourage large chunk sizes.

**Code pointers:**

| Setting | Value | Location |
|---------|-------|----------|
| Default timeout | `90_000` ms | `llm/config.ts` (`DEFAULT_TIMEOUT_MS`) |
| Default max retries | `3` | `llm/config.ts` (`DEFAULT_MAX_RETRIES`) |
| Path B mapping `maxTokens` | `4096` | `AIInterpretationService.ts` |
| Path B shape `maxTokens` | `16384` | `AIInterpretationService.ts` |
| Path C extract `maxTokens` | `16000` | `InventoryExtractionService.ts` |
| Path C chunking | threshold 50k chars; chunk 40k; overlap 4k; max doc 80k | `InventoryExtractionService.ts` |

Note: `llm/index.ts` comment mentions different defaults than `config.ts` — treat **config.ts** as runtime source of truth for baseline env recording.

**Baseline metrics:** M2, M6, failure/`errorLog` notes, retry log lines.

---

### H5 — Thin automated coverage for AI paths; approve enforces empty inventory

**Claim (unvalidated):** Regressions in extract/interpret/adapters are easy to miss; approve 409 is a protocol constraint for baseline, not a performance bug.

**Code / test pointers:**

- Approve conflict: `approve/route.ts` (~Conflict when inventory already has data)
- Tests: `app/tests/api/import-routes.jest.ts` covers import/approve heavily; little/no dedicated LLM extract/interpret adapter suite found under `app/tests/` by name search

**Baseline metrics:** Process risk (not latency). Track as quality debt for optimization MVP test plan.

---

## 3. Explicit Non-Hypotheses / Controls

| Item | Role |
|------|------|
| Path A eCRF / Adapter D near-eCRF | Latency **controls**; do not “optimize” as part of AI MVP unless baseline shows unexpected AI-path regression vs controls |
| Frontend 3s polling | Adds bounded jitter to M1/M2; not primary LLM bottleneck hypothesis |
| Mapping step UX | Out of measurement-critical path except year-mismatch / mandatory keys blocking continue |

---

## 4. Validation Matrix (Fill After Baseline)

| ID | Supported by baseline? (Y/N/Partial) | Evidence (run IDs / notes) |
|----|--------------------------------------|----------------------------|
| H1 | Partial | F3/F4/F5 succeed with **chunkCount=1** — sequential multi-chunk wall-clock **not stressed** by these fixtures. Still code-true that loops are sequential. |
| H2 | **Y** (structure) | F3/F4 each paid **interpretTabular + 1 shape** (2 LLM calls); `MAX_TABLE_SHAPE_CHUNKS=15` not hit (chunkCount=1). Truncation hypothesis untested. |
| H3 | Partial | Path B: no progress UX (confirmed). Path C: no determinate progress observed (single chunk / progress cleared). |
| H4 | Partial | OpenRouter success; no timeout. Prior session showed **429** failure cost ~10–20s. Large maxTokens still unmeasured vs smaller budgets. |
| H5 | Partial | Approve 409 not re-tested; AI path tests still thin; extract 400 without status flip seen on old PDF. |

---

## 5. Forbidden Use of This Document

- Do **not** open Construction for parallel chunks, prompt edits, raising caps, or Path B progress UX citing this file alone.
- Do **not** rewrite Notion architecture here; link and defer to Notion for UI/orchestrator detail.
