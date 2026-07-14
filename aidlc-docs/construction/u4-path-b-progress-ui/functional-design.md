# U4 — Path B Progress UI (ImportPage)

**Status**: Complete (code + tests)  
**Requirements**: FR-O6  
**Depends on**: U2 (`mappingConfiguration.extractionProgress`)

## Context

U2 persists Path B shape progress as `mappingConfiguration.extractionProgress: { current, total }` (same key as Path C). Status GET already returns `mappingConfiguration`. Path C ImportPage already polls and shows a determinate bar when `total > 1`. Path B previously showed only an indeterminate bar and did not read progress on interpret poll ticks.

## Design (shipped)

1. **Reuse RTK**: `useLazyGetImportStatusQuery` + existing `usePollUntil` for interpret (no new endpoints).
2. **Shared reader**: Pure helper `readImportChunkProgress(mappingConfiguration)` — returns `{ current, total }` only when `total > 1`; else `null`.
3. **Interpret poll `onTick`**: Same as extract — set chunk progress from status payload; clear on success/failure.
4. **UI**: When tabular interpret is in progress:
   - `total > 1` → determinate bar + `interpreting-chunk-progress`
   - else → indeterminate bar + `interpreting-file-description`
5. **Types**: `ImportStatusResponse.mappingConfiguration` includes optional `extractionProgress`.

## Implementation

| Piece | Location |
|-------|----------|
| Helper | `app/src/util/import-chunk-progress.ts` |
| UI + poll | `app/src/app/[lng]/cities/[cityId]/GHGI/onboarding/import/page.tsx` |
| i18n (EN) | `interpreting-chunk-progress` in `onboarding.json` |
| Tests | `app/tests/backend/import-chunk-progress.jest.ts` (3 passed) |
