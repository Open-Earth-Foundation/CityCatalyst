# U2 — Adaptive Shape Chunks + Progress + Fail-Closed

**Status**: Complete (code)  
**Requirements**: FR-O2, FR-O3, NFR-O3  
**Depends on**: U1 (same interpret route)

## Design

1. **Adaptive cap**: Replace hard `MAX_TABLE_SHAPE_CHUNKS = 15` with `computeMaxTableShapeChunks(totalRows, chunkSize)` — at least 15, up to **40**, enough to cover `ceil(rows/chunkSize)` when possible.
2. **No silent truncation**: If rows remain beyond the absolute cap, set `shapeTruncated` / warning on `validationResults` + log; still process covered chunks. Persist `shapeCoveredRows` / `shapeTotalRows` on `mappingConfiguration`.
3. **Progress**: Before each shape chunk, persist `mappingConfiguration.extractionProgress: { current, total }` (same key as Path C so status poll / future U4 work). Clear on completion (`undefined`).
4. **Fail-closed**: LLM/shape errors call `setFailed`; also fail when the sheet has rows but zero shape chunks were built.

## Implementation

| Piece | Location |
|-------|----------|
| Pure helpers | `app/src/backend/tableShapeChunking.ts` |
| Wiring | `app/src/app/api/v1/.../interpret/route.ts` (`getTableShapeChunks` + shape loop) |
| Tests | `app/tests/backend/table-shape-chunking.jest.ts` |

**Out of scope**: parallel shape chunks; Path B progress UI (U4).
