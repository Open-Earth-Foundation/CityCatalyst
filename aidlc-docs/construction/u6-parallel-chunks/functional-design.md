# U6 — Parallel Chunk Processing (Path B + Path C)

**Status**: Complete (code)  
**Requirements**: H1 (sequential chunk wall-clock); post-MVP Construction  
**Depends on**: U1–U3 (shape progress + fail-closed); F6 multi-chunk baseline measured

## Context

MVP deferred parallel chunks until a multi-chunk baseline existed. F6 Path B showed **3** sequential shape chunks ≈ **377s** M2. Path C already chunks large PDFs with overlap + dedupe.

## Concurrency safety assessment

| Concern | Path B shape | Path C extract |
|---------|--------------|----------------|
| Chunk independence | Yes — each chunk is independent CSV (header + rows) | Mostly — overlapping text segments; duplicates handled by `mergeAndDedupeRows` |
| Result merge | Concatenate **by chunk index** (not completion order) | `perChunkRows[i]` then `mergeAndDedupeRows` |
| Progress | `extractionProgress: { current: completedCount, total }` (monotonic) | Same via `onChunkProgress(completed, total)` |
| Errors | Fail-fast — any chunk rejection → `failed`; no partial success | Propagate first failure |
| DB progress writes | Serialize `importedFile.update` with a promise-chain mutex | Same mutex in `extract/route.ts` |
| Rate limits | Bounded concurrency via `LLM_CHUNK_CONCURRENCY` (default 3, clamp 1–8) | Same |

## Decisions

1. **Scope**: Path B + Path C share `mapPool`.
2. **Env**: `LLM_CHUNK_CONCURRENCY` optional; default **3**.
3. **Fail-fast**: abort remaining work logically; reject pool promise.
4. **Progress**: completed count, not “in-flight” index.
5. **Out of scope**: prompt/cap changes, process-wide semaphore. **UI**: U4 later connected ImportPage to the same progress signals.

## Implementation map

| Piece | Location |
|-------|----------|
| Pool helper | `app/src/backend/asyncPool.ts` |
| Path B wire | `interpret/route.ts` shape loop |
| Path C wire | `InventoryExtractionService.ts` + progress mutex in `extract/route.ts` |
| Tests | `app/tests/backend/async-pool.jest.ts` |

## Spot-check (F6)

2026-07-14: parallel confirmed in logs (two `LLM_TIMEOUT` at same timestamp). Job ended `failed` / `Request timed out` after retries (~368s). Sequential U5 success was ~377s — re-run F6 for M2 gains when OpenRouter is healthy. Raw: `ghgi-upload-ai-u6-f6-parallel-raw.json`.
