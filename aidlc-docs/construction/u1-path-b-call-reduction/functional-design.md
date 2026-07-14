# U1 — Path B LLM Call Reduction

**Status**: Implemented (code) — pending U5 gains re-measure  
**Requirements**: FR-O1, NFR-O1, NFR-O4, NFR-O6  
**Approved execution plan**: `ghgi-upload-ai-optimization-mvp-execution-plan.md`

## Design

Baseline F3/F4 (FormatAdapter `long-tidy` / `wide-year`) always:

1. `interpretTabular` (mapping) — ~2.5k tokens  
2. Fail `detectedColumnsMatchECRFStructure` (no scope / incomplete eCRF)  
3. `shapeTableToRows` — ~2.8k tokens  

**Change**: When `adapterType` is `long-tidy`, `wide-year`, or `multi-sheet` (already normalized), **skip step 1** and run shape-only. Near-eCRF / CIRIS / unknown adapter / key-value paths unchanged.

**Helper**: `shouldSkipInterpretForAdapter(adapterType)` — pure, unit-tested.

## Non-goals (U1)

- Parallel chunks  
- Raising `MAX_TABLE_SHAPE_CHUNKS` (U2)  
- Progress UX (U2/U4)
