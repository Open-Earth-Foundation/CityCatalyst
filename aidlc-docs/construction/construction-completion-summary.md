# Construction Completion Summary — GHGI Upload AI Optimization MVP

**Project**: CityCatalyst (Brownfield)  
**Task**: GHGI “Upload Existing Inventory” — Path B / Path C AI optimization  
**Completed**: 2026-07-14T13:55:00Z  
**Document Language**: English  
**Phase Scope**: Construction units U1–U6 (application code + measurement)

---

## 1. Executive Summary

The **Construction phase** for the GHGI Upload AI Optimization MVP is **complete**.

Path B typical imports (F3/F4) meet acceptance: **~−38% wall-clock (M2)** and **~−45% tokens (M6)** vs the OpenRouter baseline, with no status/`rowCount` regressions. Path C (F5) **holds** after the `unpdf` Turbopack fix. Path B progress is pollable (U2) and rendered in ImportPage (U4). Multi-chunk stress (F6) works **sequentially**; **parallel pool (U6, concurrency=3)** reproducibly hits OpenRouter `Request timed out` — documented, fail-closed.

| Gate | Result |
|------|--------|
| FR-O1–FR-O5, FR-O7 | Met |
| FR-O6 (optional UI) | Done (U4) |
| NFR-O1 (F3/F4 + F5 hold) | **PASS** |
| NFR-O2 (F0 control) | **PASS** |
| NFR-O3 (fail-closed) | **PASS** |
| U6 parallel F6 latency gain | **Not demonstrated** (provider timeouts) |

**Authoritative gains**: measurement plan §8c + `ghgi-upload-ai-u5-gains-raw.json`.

---

## 2. Scope Recap

| In scope | Out of scope (confirmed) |
|----------|---------------------------|
| Path B call reduction, adaptive shape chunks, progress, fail-closed | Path A eCRF / near-eCRF logic changes |
| Path C hold/harden + PDF extract fix (`unpdf`) | Approve HTTP 409 empty-inventory rule |
| Stress fixture F6 + gains re-measure | Provider migration |
| Optional Path B progress UI | Full GPC prompt/taxonomy rewrite |
| Post-MVP parallel chunks (U6) after F6 baseline | Measurement-only instrumentation service |

**Requirements**: `aidlc-docs/inception/requirements/ghgi-upload-ai-optimization-mvp-requirements.md`  
**Execution plan**: `aidlc-docs/inception/plans/ghgi-upload-ai-optimization-mvp-execution-plan.md`  
**Baseline**: OpenRouter session 2026-07-14T02:00Z — gate PASSED

---

## 3. Construction Units (U1–U6)

| Unit | Focus | Requirements | Status | Design note |
|------|--------|--------------|--------|-------------|
| **U1** | Skip `interpretTabular` for FormatAdapter tidy types (shape-only) | FR-O1 | Done | `u1-path-b-call-reduction/functional-design.md` |
| **U2** | Adaptive shape chunk cap + `extractionProgress` + fail-closed / no silent truncate | FR-O2, FR-O3, NFR-O3 | Done | `u2-path-b-shape-progress/functional-design.md` |
| **U3** | Path C fail-closed on hard extract errors; F6 stress fixture + extended baseline | FR-O4, FR-O5, NFR-O3 | Done | `u3-path-c-harden-stress/functional-design.md` |
| **U4** | ImportPage Path B determinate progress (mirror Path C) | FR-O6 | Done | `u4-path-b-progress-ui/functional-design.md` |
| **U5** | Re-measure F0/F3/F4/F5/F6; fill gains table; NFR verdict | FR-O7, NFR-O1/O2 | Done | `u5-remeasure-gains/functional-design.md` |
| **U6** | Bounded parallel chunk LLM (`mapPool`, default concurrency 3) — Path B + Path C | H1 (post-MVP) | Done (code); F6 latency **inconclusive** | `u6-parallel-chunks/functional-design.md` |

### Unit outcomes (short)

**U1** — `shouldSkipInterpretForAdapter`: `long-tidy` / `wide-year` / `multi-sheet` → one shape LLM call instead of interpret+shape.  
**U2** — `tableShapeChunking.ts`: adaptive cap (15–40); progress `{current,total}` on `mappingConfiguration`; truncation surfaced; hard errors → `failed`.  
**U3** — Extract route sets `failed` on hard pre-background PDF/storage failures; fixture `07-path-b-stress-multi-chunk-2022.csv` (250 rows, 3 chunks). Later: Path C PDF via `unpdf` (Turbopack-safe).  
**U4** — `readImportChunkProgress` + interpret poll `onTick`; determinate bar when `total > 1`.  
**U5** — Full OpenRouter re-measure; gains §8c.  
**U6** — `asyncPool.ts` / `LLM_CHUNK_CONCURRENCY` (1–8, default 3); fail-fast; ordered merge; DB write mutex; progress by completed count.

---

## 4. Key Results — Gains Table (authoritative §8c)

**Env**: OpenRouter `openai/gpt-4o-mini`; `LLM_TIMEOUT_MS=120000`; `LLM_MAX_RETRIES=2`; `LLM_CHUNK_CONCURRENCY=3` (default).  
**Session**: 2026-07-14T13:49Z (`u5-remeasure-u4-u6`).

| Metric | Fixture | Baseline | After U1–U6 | Δ % / notes |
|--------|---------|----------|-------------|-------------|
| M1 | F0 / D | 4.06 s | **0.45 s** | NFR-O2 OK; 74 rows |
| M2 | F3 / B | 12.2 s | **7.6 s** | **−38%** |
| M2 | F4 / B | 12.3 s | **7.6 s** | **−38%** |
| M2 | F5 / C | 7.5 s | **7.8 s** | Hold (~0%) |
| M2 | F6 / B | 376.7 s (seq. success) | **364.4 s → failed** | Parallel timeout |
| M6 | F3 / B | 5937 | **3280** | **−45%** |
| M6 | F4 / B | 5810 | **3218** | **−45%** |
| M6 | F5 / C | 3966 | **3977** | Hold |
| M7 | F3/F4/F5 | waiting_for_approval | waiting_for_approval | rowCount 4 unchanged |
| M8 | Path B | none | **U4 UI** + pollable progress | Determinate when `total > 1` |

**Earlier sequential F6 (U5 before U6):** M2 **376.7 s**, 3 chunks, `waiting_for_approval`, rowCount **239** (−25% vs U3 extended 504 s). Retained in §8b as parallel Δ reference.

Full tables: `aidlc-docs/inception/plans/ghgi-upload-ai-baseline-measurement-plan.md` (§8, §8b, §8c).

---

## 5. Requirements Traceability

| ID | Verdict |
|----|---------|
| FR-O1 | PASS — F3/F4 one LLM call |
| FR-O2 | PASS — backend `extractionProgress` |
| FR-O3 | PASS — adaptive cap; no silent drop |
| FR-O4 | PASS — F5 hold (status, rows, tokens) |
| FR-O5 | PASS — F6 fixture + measurements |
| FR-O6 | PASS — U4 ImportPage |
| FR-O7 | PASS — gains §8c filled |
| FR-O8 | PASS — 409 / Path A / OpenRouter unchanged |
| NFR-O1 | PASS (F3/F4/F5); F6 parallel latency inconclusive |
| NFR-O2 | PASS |
| NFR-O3 | PASS |
| NFR-O4–O6 | Met in unit work (logging, env timeouts, Jest helpers) |

---

## 6. Known Limitations

1. **F6 + parallel pool (U6)** — With concurrency=3, large shape chunks often exceed `LLM_TIMEOUT_MS` (120s) under OpenRouter load. Logs show 3 concurrent requests; 1 completes; 2× `LLM_TIMEOUT` on retries → terminal `failed` / `Request timed out` (~364–368 s). Reproduced in U6 spot-check and U5 §8c. **Not** silent truncation; fail-closed works. Wall-clock win from parallelism **not proven**.
2. **F6 sequential rowCount** — 239/250 (LLM shape dropouts); track unexplained drops in future quality work.
3. **N=1** — Gains are single-run; no statistical repeats.
4. **Path C multi-chunk PDF** — Not stressed (char threshold / cost); F5 remains single-chunk.
5. **U6 default concurrency=3** — May be aggressive for this provider/model on large prompts; operators can set `LLM_CHUNK_CONCURRENCY=1` for sequential reliability.
6. **Fixtures** under `app/tmp-import-fixtures/` are measurement assets — not product seed data; do not ship as required runtime files unless productized.

---

## 7. Key Code Map

| Area | Paths |
|------|--------|
| Path B interpret | `app/src/app/api/v1/.../interpret/route.ts`, `AIInterpretationService.ts` |
| Path C extract | `app/src/app/api/v1/.../extract/route.ts`, `InventoryExtractionService.ts`, `PdfToTextService.ts` (`unpdf`) |
| Chunking / pool | `tableShapeChunking.ts`, `asyncPool.ts` |
| Progress UI | `import/page.tsx`, `util/import-chunk-progress.ts` |
| Tests | `*-chunking.jest.ts`, `async-pool.jest.ts`, `ai-interpretation-path-b.jest.ts`, `import-chunk-progress.jest.ts`, `pdf-to-text.jest.ts` |
| Fixtures | `app/tmp-import-fixtures/01…07-*` |
| Env | `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES`, `LLM_CHUNK_CONCURRENCY` |

---

## 8. Handoff Checklist (future work)

### Immediate / ops
- [ ] Decide production default for `LLM_CHUNK_CONCURRENCY` (recommend **1** until F6 parallel succeeds, or raise `LLM_TIMEOUT_MS` and re-measure)
- [ ] Confirm OpenRouter / model SLAs for multi-minute large completions
- [ ] PR review: security (no secrets/PII in logs), auth unchanged on import routes
- [ ] Ensure `tmp-import-fixtures/` is gitignored or explicitly accepted as measurement-only

### Re-measure when ready
- [ ] F6 with `LLM_CHUNK_CONCURRENCY=3` + healthy provider (or higher timeout) — fill M2 Δ vs sequential 376.7 s
- [ ] Optional N=3 repeats on F3/F4 for confidence bands
- [ ] Optional Path C multi-chunk PDF stress if product needs it

### Product / UX
- [ ] Manual QA: ImportPage Path B multi-chunk bar (F6 or synthetic `total > 1`)
- [ ] i18n: `interpreting-chunk-progress` EN shipped; confirm CI translate for de/es/fr/pt
- [ ] Consider user-visible timeout messaging for long multi-chunk jobs

### Tech debt / follow-ups
- [ ] Investigate F6 shape row dropouts (250 → 239 sequential)
- [ ] Prompt/token budget for large shape chunks (H4)
- [ ] Process-wide / org-level LLM rate limiting if parallel becomes default
- [ ] Archive or regenerate measurement raw JSON if overwritten mid-cycle (preserve §8b sequential F6 numbers)

### Do not regress
- [ ] Empty-inventory approve **409** rule
- [ ] Path A / near-eCRF deterministic upload paths
- [ ] Fail-closed: hard extract/interpret errors → `failed` + `errorLog` (no hang on `pending_ai_*`)

---

## 9. Artifact Index

| Artifact | Path |
|----------|------|
| This summary | `aidlc-docs/construction/construction-completion-summary.md` |
| Unit designs | `aidlc-docs/construction/u{1–6}-*/functional-design.md` |
| Requirements | `aidlc-docs/inception/requirements/ghgi-upload-ai-optimization-mvp-requirements.md` |
| Execution plan | `aidlc-docs/inception/plans/ghgi-upload-ai-optimization-mvp-execution-plan.md` |
| Measurement + gains | `aidlc-docs/inception/plans/ghgi-upload-ai-baseline-measurement-plan.md` |
| U5 raw | `aidlc-docs/inception/plans/ghgi-upload-ai-u5-gains-raw.json` |
| Other raws | `ghgi-upload-ai-*-raw.json` (baseline, U1, U3 F6, F5 unpdf, U6 F6) |
| AI-DLC state | `aidlc-docs/aidlc-state.md` |
| Audit log | `aidlc-docs/audit.md` |

---

## 10. Cycle Status

**AI-DLC Construction for this Optimization MVP: COMPLETE** (2026-07-14).

Next AI-DLC cycle (if any) should start from Requirements / Workflow for a **new** task (e.g. parallel latency hardening, prompt quality, or Path C multi-chunk), using this summary and the handoff checklist as inputs.
