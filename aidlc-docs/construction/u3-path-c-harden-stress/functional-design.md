# U3 — Path C Fail-Closed + Multi-Chunk Stress Fixture

**Status**: Complete (code + F6 extended baseline)  
**Requirements**: FR-O4, FR-O5, NFR-O3  
**Depends on**: U1/U2 preferred (measurement context); independent code path for extract

## Design

### 1. Path C fail-closed (NFR-O3)

**Problem (baseline hang class):** When `POST .../extract` fails *before* background work (e.g. PDF text extraction **400 bad XRef**), the handler threw HTTP 400 while leaving `importStatus` as `pending_ai_extraction`. Clients polling never saw a terminal state.

**Change:** On hard pre-background failures that mean this upload cannot proceed (missing buffer, S3 fetch failure, PDF→text failure, empty text), persist `importStatus: failed` + actionable `errorLog`, then return the HTTP error.

Do **not** flip status for client misuse (wrong `fileType`, wrong status) — those are retryable against a still-valid pending file.

Background LLM failures already set `failed`. Outer promise `.catch` also attempts `failed` if the background task rejects unexpectedly while still non-terminal.

### 2. Multi-chunk stress fixture (FR-O5)

| ID | File | Expected |
|----|------|----------|
| F6 | `07-path-b-stress-multi-chunk-2022.csv` | Path B; long-tidy; **3** shape chunks (250 rows) |

**Measured (extended baseline):** M2 ≈ **504 s**, M4 = **3**, status `waiting_for_approval`, progress poll `{current:3,total:3}`, rowCount **205**. Raw: `aidlc-docs/inception/plans/ghgi-upload-ai-u3-f6-stress-raw.json`.

Path C multi-chunk PDF deferred (50k-char threshold; expensive) — FR-O5 allows B and/or C.

### 3. Pure helpers / tests

Exported `splitIntoChunks` / `mergeAndDedupeRows` (+ Path C chunk constants) from `InventoryExtractionService.ts`. Jest: `inventory-extraction-chunking.jest.ts`.

## Implementation map

| Piece | Location |
|-------|----------|
| Fail-closed extract | `app/src/app/api/v1/.../extract/route.ts` |
| Stress fixture | `app/tmp-import-fixtures/07-path-b-stress-multi-chunk-2022.csv` |
| Chunk helper tests | `app/tests/backend/inventory-extraction-chunking.jest.ts` |

## Out of scope

- Parallel extract chunks  
- Path B progress UI (U4)  
- Changing F5 happy-path beyond fail-closed on hard errors  
