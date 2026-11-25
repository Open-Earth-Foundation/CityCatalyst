# CC-1201 Scope Conflict Review — Implementation Plan

> **For the implementing agent:** Follow `superpowers:executing-plans` and the repository instructions. This plan extends the existing CC-1201 branch and must be reviewed before implementation.

**Goal:** Require a human decision when an imported GPC reference and stated scope conflict, preserving the original values and allowing both fields to be corrected.

**Architecture:** Extend the existing row review and server-side approval guard to structured files. Carry original and reviewed values through the same preview and approval pipeline. Compare against the database catalogue scope and preserve existing PDF safeguards.

**Stack:** TypeScript, Next.js, Sequelize, Jest, React.

**Design:** The design was approved in the conversation: compare any known reference/scope pair, hold conflicts until a human decides, allow reference and scope edits, retain originals and decisions, and do not flag a reference with no defined catalogue scope. No separate design document exists.

## Constraints and decisions

- Do not automatically convert `III.x.3` to `.2` based on file scope. BASIC/BASIC+ exclusions continue to follow the final reference.
- Preserve the existing review for inferred `III.x.3` and the protections against stale, forged, or cross-file decisions.
- CSV/XLSX currently use catalogue scope; extracted rows can use stated scope. Ensure the final stored values actually match the reviewed decision.
- Existing `mappingOverrides` represent column mappings for structured files and row decisions for extracted rows. Give these separate, explicit namespaces; ensure old column mappings remain interpretable.
- **Conflict decision:** a known reference and a known, incompatible scope must be corrected to a compatible pair before approval. The reviewer can edit either field; keeping an incompatible pair is not a valid decision. Recheck compatibility on the server using the final values.
- **Catalogue authority:** David chose the database catalogue when its scope disagrees with the static reference table. For example, `I.4.4` has scope 1 in the database even though the static table omits its scope; an `I.4.4`/scope 3 row must be reviewed and corrected. A reference with no scope in the database is not treated as a confirmed conflict.
- An originally empty or invalid scope produces a warning and does not by itself block approval. It is not a confirmed match. For a row already flagged with a known conflict, clearing or invalidating the scope or reference is not a correction: require a known, compatible final pair. A reference with no defined catalogue scope does not generate a scope conflict. Preserve existing handling of unknown references; do not silently describe unknown or scope-less cases as matches. Confirm catalogue coverage and normalization of `3` and `Scope 3`.
- Store the original values, final values and human decision in a dedicated field on the imported-file record. The history lasts only as long as that record and describes the import, not later inventory edits. For AI-extracted rows distinguish model-extracted values from values actually verified in the source.
- Add the migration and tests specified below. No production queries or live model calls are implied by this plan.

## History protection and failed-import retry

**Storage contract:** Add nullable JSONB `review_history` on `ImportedInventoryFile`, exposed by the model as `reviewHistory`. `NULL` means no successful review history has been finalized; a non-null versioned object contains the file ID, completion time, and an entry per reviewed row with a stable row identity, original reference and scope (including original scope text), final reference and scope, decision and source provenance. Include skipped decisions where applicable and represent absent values explicitly. Populate it from server-validated decisions and the exact import result, not from an unvalidated client-provided history. Existing records remain `NULL`; do not invent historical decisions or backfill them.

**Write-once protection:** The database migration installs a named PostgreSQL `BEFORE UPDATE` trigger that rejects any change from a non-null `review_history` to a different value or to `NULL`; updates to status, errors or mapping configuration that leave it unchanged remain allowed. Finalization uses an atomic conditional update requiring `review_history IS NULL` and the expected active attempt/status. This protects against application and ordinary direct SQL updates, not a database owner disabling the trigger. Do not expose a general client update for this field. The existing access checks apply to any history read.

**Commit boundary and concurrency:** Reserve approval atomically with a conditional `waiting_for_approval` status transition; only one concurrent request can start an import. Bind the reservation, validated reviewed rows and background worker to the same attempt, and reject a stale worker. In the existing import transaction, write inventory values, the validated history and `COMPLETED` together. If the final conditional update affects zero rows, abort and roll back the entire transaction. Follow-ups after commit must not mark a completed attempt as failed or rewrite its history. Include tests for a worker replay and a late failure as well as two simultaneous approvals.

**Retry contract:** If a failure occurs before the completion transaction commits, that transaction rolls back: no successful history or partial inventory replacement is retained. Keep the failed import record and its error. To retry the failed import after approval, the user **must upload the file again and review the decisions again**. The upload creates a new import record, which runs validation and review again and does not inherit row decisions. This uses the existing upload flow rather than introducing a retry endpoint or claiming an existing failed record can be approved again. Failures earlier in upload, extraction or interpretation follow their existing recovery paths. A committed successful import is not retried or relabeled as failed because a later optional follow-up fails.

**Migration and rollback:** Create a timestamped `.cjs` migration in `app/migrations/` adding the nullable JSONB field and the dedicated function/trigger; update `ImportedInventoryFile` model types. `down` removes the trigger, function and column in the correct order, and therefore **deletes stored review history**. Before executing rollback in any environment containing history that must be retained, assess how to preserve it and verify the preservation method before proceeding. Test rollback only in an isolated database, and document this data-loss consequence and preservation requirement for release review. Test `up`, `down`, and `up` on an isolated database, including pre-existing records. Do not run the migration against production as part of this plan.

## Task 1: Establish the catalogue and persisted-data contract

**Inspect:** `app/src/util/GHGI/gpc-ref-resolver.ts`, `app/src/util/GHGI/data/gpc-reference-table.json`, `app/src/backend/ECRFImportService.ts`, `app/src/backend/InventoryImportService.ts`, and relevant inventory models.

- [x] Trace reference, scope and omission flag from CSV/XLSX and PDF into the persisted inventory, including how reports consume scope. _Trace recorded under "Task 1 trace" below._
- [x] Trace the lifecycle of the dedicated `reviewHistory` field when a later import replaces inventory values; the earlier import record retains its own history for as long as that record exists. Confirm deletion behavior and access checks. _Trace recorded under "Task 1 trace" below._
- [x] Record how each supported scope label is normalized and which catalogue references have no scope. Confirm how unknown references and invalid scope labels are presented. _Trace recorded under "Task 1 trace" below._

## Task 1b: Add write-once review history

**Modify:** `app/src/models/ImportedInventoryFile.ts`; add a timestamped migration in `app/migrations/` and focused database tests in `app/tests/backend/`.

- [x] Add `review_history` and its write-once trigger as specified above. Existing rows remain null; model types accept the versioned history object and null.
- [x] Verify with real PostgreSQL that null can be finalized once, an unchanged value permits unrelated updates, and attempts to change or clear a non-null history fail, including direct SQL. A failed transaction must not leave history behind.
- [x] Verify migration `up`, `down`, `up` in an isolated database and state explicitly that `down` deletes history. Check that old records remain readable without fabricated history.

## Task 2: Preserve inputs and represent decisions

**Modify:** `app/src/backend/ECRFImportService.ts`, `app/src/backend/ImportResultBuilder.ts`, `app/src/util/types.ts`, and the existing import decision types as needed.

- [x] Add separate column mapping and per-row decision inputs while preserving existing mappings. Bind each decision to the file and the original row identity, reference, scope and value; reject stale or forged decisions.
- [x] Preserve the original file reference and scope before normalization or inference for structured files and extracted rows. Do not silently rederive explicit non-waste references before conflict review.
- [x] Normalize supported scope labels and compare them with the catalogue only when both values are known; preserve the original text for review.
- [x] Add regression coverage for CSV and XLSX, a non-waste conflict, `III.x.3`/scope 3, matching values, scope-less reference, missing/invalid scope, and extracted PDF rows.

## Task 3: Enforce review through preview and approval

**Modify:** `app/src/backend/ImportRowPreviewService.ts`, `app/src/backend/ImportResultBuilder.ts`, the `row-preview` and `approve` import routes.

- [x] Use the same conflict and pending-row calculation for preview and approval across structured and extracted paths. Detect conflicts before resolving or discarding either original field.
- [x] Require a valid row-bound decision before approval, including direct API requests. Reject an incompatible final reference/scope pair; warn but do not block solely on a missing or invalid scope. Verify partial decisions return 409 and a complete valid decision allows the existing import flow to proceed.
- [x] Test that a known conflict cannot be dismissed by clearing or invalidating either field; a row whose scope was already absent or invalid remains warning-only.
- [x] Persist the reviewed values through the import path according to the contract established in Task 1. Confirm BASIC/BASIC+ inclusion follows the final reference.
- [x] Cover changed files, repeated values on different rows, stale decisions after re-extraction, missing decisions, invalid edits, and attempted forged decisions.
- [x] Atomically reserve one approval and bind its validated result to the worker. Finalize the history, inventory changes and completed status in one transaction; reject stale or repeated workers without replacing history. Test concurrent approvals, stale workers and rollback on failure.
- [x] Test a failed import followed by a fresh upload: the failed record remains, the new record has a distinct ID, decisions are reviewed again, and only the successful record receives its final history. Test an optional follow-up failure after commit leaves successful status and history intact.

## Task 4: Review interface and copy

**Modify:** `app/src/components/steps/GHGI/import/import-review-rows.tsx`, `import-row-decisions.ts`, `ghgi-import-wizard.tsx`, related mapping components, and `app/src/i18n/locales/en/onboarding.json`.

- [x] Show original reference and scope, catalogue expectation, value, and final selection; permit editing both reference and scope. Explain that a known conflict must be corrected; show a non-blocking warning for a missing or invalid scope.
- [x] Clear decisions when the file changes; preserve them when navigating within the same file. Keep column mapping distinct from row decisions in requests.
- [x] Show pending count and prevent the completion action while unresolved; maintain server enforcement as the authority. On import failure, provide a clear path to upload the file again as a new import; explain that review decisions must be made again. Follow the repository's translation workflow. _Evidence: wizard behavior checked in the browser; the disabled-action and failure-copy paths have no component test._
- [x] Add focused component and flow coverage for editing both fields, changing a file, and displaying original versus final values.

## Task 5: Verify and prepare review

- [x] Run the relevant focused Jest suites, including catalogue import, row review, provenance, and approve-route coverage, using the repository's isolated test setup.
- [x] Run TypeScript and lint checks appropriate to changed files; record commands and results.
- [x] Exercise structured and PDF review flows in a browser against an isolated test database, including a conflict, corrected scope, corrected reference, and completion.
- [ ] Document residual limits and update the existing PR description only when the changes and verification are ready for review. Do not imply production or live-model verification occurred. _Not done: PR #3373 has not been updated; residual limits are listed under Execution evidence._

## Review focus

1. A source scope written as `Scope 3` is normalized without losing the original.
2. A file replacement or changed row cannot reuse a previous decision.
3. A reference with no known catalogue scope does not create a false conflict.
4. Preview, server approval, saved scope and BASIC/BASIC+ total agree after correction.
5. Original and final values and decisions remain inspectable and unchanged for the life of the import record; a failed attempt can be retried by a fresh upload without inheriting decisions.

## Execution evidence — 2026-11-03

- In an isolated seeded PostgreSQL database, migration `up`, `down`, `up` and the write-once trigger were exercised. A real XLSX reference correction, CSV scope correction, stale and cross-file decisions, simultaneous approvals, and rollback on a failed row were tested. A later targeted run covering bulk and catalogue imports passed 104 tests in 10 suites.
- Browser tests used a local database and test user. A CSV conflict was corrected by scope and by reference; the stored history and total flag were checked. A simulated failure showed the retry instruction, and a fresh upload required review again. The PDF review was exercised with an injected extraction result; no live model or production data was used.
- The broader focused regression passed 354 tests in 26 suites before the final bulk-lock change. The full suite was then run in 16 groups before that last change: 2,190 passed, 3 failed, 26 skipped and 1 todo. Two failures in `agentic-inventory-capabilities` passed when rerun (12 tests) in a freshly migrated and seeded database. `openapi` still reports metadata version `0.1.0` instead of `1.28.0-dev.0`; the same failure is recorded on `develop` in the historical review. Invitation suites passed with a fictitious local verification secret.
- **Pre-existing OpenAPI failure:** David ran `tests/api/openapi.jest.ts` on `develop` at `4ee68a326`: 8 tests passed and 1 failed on the same `0.1.0` versus `1.28.0-dev.0` version discrepancy. This is separate from CC-1201 and will be handled separately. This baseline result was reported by David; it was not rerun in this session.
- A first single-process full-suite attempt hit the Node heap limit; the grouped run completed. The final bulk-lock change was verified by the 104-test targeted run above, not by repeating every group.
- Production, live OCR/model extraction and the S3 upload-cleanup branch were not exercised. A server process interrupted while a file remains `importing` can require operational recovery before another import for that inventory can start.
- Changes and this plan remain local and uncommitted; PR #3373 has not been updated with them.

## Task 1 trace — 2026-11-03

- Structured imports: `ECRFImportService.processECRFFile` maps the reference to the database catalogue and carries its scope ID and source scope. Extracted rows go through `fromExtractedRows`; decisions are applied by `ImportResultBuilder` before preview and import. `InventoryImportService.importECRFData` stores the chosen reference and category, and the `InventoryValue` save hook sets `omitFromTotal` for excluded references. Results aggregate through `reported-totals.ts` and `ResultsService`; omitted rows are preserved separately.
- `scopeFromLabel` recognizes trimmed, case-insensitive `1`/`Scope 1` and text containing `direct`, `2`/`Scope 2` and text containing `indirect`, and `3`/`Scope 3` (`indirect` is checked before `direct`). Unknown or empty text yields no recognized scope and a non-blocking warning; unknown references use the existing rejected-row presentation.
- In an isolated, migrated and seeded catalogue, scopes `1`, `2`, `3` exist. Effective scope was absent for no seeded subcategory references and for these 17 subsector references: `I.1`-`I.8`, `II.1`-`II.5`, `III.1`-`III.4`. `I.4.4` resolves to database scope 1 (the static reference table has no scope for it and does not decide). This is an isolated catalogue observation, not a production query.
- `InventoryReplaceService.replaceInventoryValues` deletes inventory values (and cascaded activity and gas rows) but not the old `ImportedInventoryFile`, so earlier review history stays with that record. The original migration declares cascaded deletion of imported-file records when their user, city or inventory is deleted. GET import status filters the file by ID, city, inventory and current user (via `UserService.findUserInventory`) before exposing `reviewHistory`.
- I.4.4 authority (David, database catalogue): covered by `gpc-real-catalogue-import.jest.ts` for a CSV row (held, expected scope 1), a `keep` decision (still held), a `correct-scope` decision (accepted), and an extracted PDF row (held).
