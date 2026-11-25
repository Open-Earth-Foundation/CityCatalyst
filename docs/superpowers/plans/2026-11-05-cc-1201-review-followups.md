# CC-1201 Review Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four open review threads from Milan on PR #3373 (`Open-Earth-Foundation/CityCatalyst`, branch `david/cc-1201-gpc-basic-total-exclusions`) with evidence, and leave #3379 in sync.

**Execution order:** Task 0, then the test and verification steps of Tasks 2, 3 and 4, then Task 5 Step 1 (push), then the reply edits and resolves in Tasks 1 to 4, then Task 5 Steps 2 to 4. Task 3 can run in the background while Task 2 runs.

**Architecture:** Mostly review work, not feature work. Two threads get a code-free answer (edit an existing reply, resolve). Two threads get a test run whose result goes into the reply. One thread is closed by deleting a test file. Every GitHub reply cites a commit, so the commits are pushed first.

**Tech Stack:** Next.js app in `app/`, Jest (ESM, `NODE_OPTIONS=--experimental-vm-modules`), Playwright (scratch only), Postgres 16 in Docker, `gh` CLI.

**Spec:** No design doc. Source of requirements is David's message of 2026-11-05 (items 1 to 4) and the open threads on PR #3373.

## Global Constraints

- Do not modify code or push until David picks the execution mode (workspace rule).
- Replies and PR text are written in English, as normal prose, for the team.
- Do not resolve a thread unless its evidence is good. Item 1 and item 4 resolve by decision, items 2 and 3 only if the result is clean.
- Do not create a Linear ticket. Item 1 lists the options in the comment only.
- Scratch files (Playwright spec, `.env.local`, `test-results`) are never committed and are removed at the end.
- Commit message trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Thread and comment ids: ReportResults thread root `4471387545` (my reply `4472891564`); resolver thread root `4471418423` (reply `4472891972`); manual forms thread root `4471433945` (replies `4474514506`, `4475159761`); backfill test thread root `4471450853` (reply `4472892594`). Resolve with the GraphQL `resolveReviewThread` mutation, looking up each thread node id by its root comment id.

## Review Focus

- Another session already changed this worktree. HEAD `35921c876` (unpushed) adds `tests/backend/gpc-direction-real-files.jest.ts`, deletes `tests/backend/gpc-total-exclusions-backfill.jest.ts` and widens the waste-direction regex. The working tree then reverts the regex (uncommitted) and holds a stray `app/e2e/cc1201-forms.tmp.spec.ts`. Executing blind would overwrite or duplicate that work. Task 0 owns this.
- The widened regex accepts CIRIS wording ("generated within but treated outside of the city"). A real III.x.3 row must still stay `.3`. Task 2 adds a case for the official III.x.3 name.
- Replies cite commits that are not pushed yet, so a reviewer would see a dead SHA. Task 5 pushes before any reply is edited.
- Methane commitment stored `co2eq = 0` locally for III.1.1 and III.1.3. If develop gives a non-zero value, that is a regression, not an environment gap. Task 3 compares.
- Deleting the backfill test leaves the migration's idempotence unproven. The SQL guards with `AND omit_from_total = false`, which the reply states.

---

### Task 0: Reconcile the worktree

**Files:**
- Inspect: `app/src/util/GHGI/gpc-ref-resolver.ts`, `app/tests/backend/gpc-direction-real-files.jest.ts`
- Remove: `app/e2e/cc1201-forms.tmp.spec.ts` (untracked scratch)

**Interfaces:**
- Produces: a clean worktree on branch `cc-1201-formtest` with a decided resolver regex, for Tasks 2 to 5.

- [ ] **Step 1: Record state.** Run `git status -sb`, `git log --oneline -5` and `git diff app/src/util/GHGI/gpc-ref-resolver.ts`. Expected: HEAD `35921c876`, one modified file, one untracked spec.
- [ ] **Step 2: Ask David which regex stays.** Options: (a) HEAD version, accepts CIRIS "generated within but treated outside of the city" with no city noun; (b) the uncommitted version, original strict regex. Default recommendation: (a), because CIRIS is a real input file. Do not edit the file before the answer.
- [ ] **Step 3: Apply the answer.** For (a) run `git checkout -- app/src/util/GHGI/gpc-ref-resolver.ts`. For (b) commit the revert and fix the test that expects CIRIS wording.
- [ ] **Step 4: Delete the stray spec** with `rm app/e2e/cc1201-forms.tmp.spec.ts`. Expected: `git status --short` prints nothing.

### Task 1: ReportResults.tsx thread (item 1)

**Files:**
- Read: `app/src/components/GHGI/ReportResults.tsx:270-285`, `app/src/components/GHGI/inventory-result/OtherScope3Section.tsx`, `app/src/app/api/v1/inventory/[inventory]/results/[sectorName]/route.ts`

**Interfaces:**
- Consumes: reply `4472891564`.
- Produces: edited reply, thread `4471387545` resolved.

- [ ] **Step 1: Verify current behavior from code.** Confirm: `OtherScope3Section` is rendered once at the end of the results view for every inventory (also public ones), calls `api.useGetSectorBreakdownQuery({ inventoryId, sector: "other-scope-3" })`, and returns `null` when `data?.omittedFromTotal` is empty. Note whether the call runs for inventories of every `inventoryType`.
- [ ] **Step 2: Write the comment body** (English). Sections: how it works today (one extra GET per results page load, section hidden when empty, nothing counted in totals); the cost (one request for inventories that have no VI.1 rows); options for a follow-up ticket, each with its trade-off: (A) keep as is; (B) add a `hasOmittedRows` flag to the existing `/results` payload and skip the request when false; (C) gate by inventory type or sector applicability; (D) defer the request until the sector tabs have rendered. State that the follow-up is optional and was not opened.
- [ ] **Step 3: Edit the reply** with `gh api -X PATCH repos/Open-Earth-Foundation/CityCatalyst/pulls/comments/4472891564 -f body="$(cat <body file>)"`. Expected: JSON with the new body.
- [ ] **Step 4: Resolve thread `4471387545`.** Expected: `isResolved: true`.

### Task 2: Resolver robustness evidence (item 2)

**Files:**
- Test: `app/tests/backend/gpc-direction-real-files.jest.ts`, `app/tests/backend/gpc-ref-resolver.jest.ts`, `app/tests/backend/gpc-waste-direction.jest.ts`
- Modify: `app/tests/backend/gpc-direction-real-files.jest.ts` (one new case)

**Interfaces:**
- Consumes: `correctWasteDirection(gpcRefNo: string, labels: (string | null | undefined)[], scopeLabel?: string | null): string` from `@/util/GHGI/gpc-ref-resolver`; Task 0 regex decision.
- Produces: pass counts for the comment.

- [ ] **Step 1: Write the failing test** `keeps a III.x.3 row under its official CIRIS III.x.3 name`: for each of III.1.3 to III.4.3, `correctWasteDirection(ref, [officialCirisNameFor(ref)], "1")` equals `ref`. Take the names from the CIRIS rows the existing test already reads.
- [ ] **Step 2: Run it** with `NODE_OPTIONS=--experimental-vm-modules NODE_ENV=test npx jest tests/backend/gpc-direction-real-files --coverage=false` from `app/`. Expected: PASS if the regex is right, FAIL means the widened regex moves a real `.3`. A FAIL blocks the resolve and goes to David.
- [ ] **Step 3: Run the three resolver suites together.** Expected: all green. Record suites, tests, and the six case names from the real-files file.
- [ ] **Step 4: Commit** the new case.
- [ ] **Step 5: Edit reply `4472891972`** with the pass counts, which inputs are covered (official eCRF template, Nairobi 2023, CIRIS names, Auckland OCR excerpt) and the stated limit from the test header: no model-extracted PDF, so the extraction path is not covered. Resolve thread `4471418423` only if Step 3 is green and the limit is stated.

### Task 3: Complete manual-form test (item 3)

**Files:**
- Scratch (never committed): `app/.env.local`, `app/e2e/cc1201-forms.tmp.spec.ts`
- Read: `app/src/util/form-schema/manual-input-hierarchy.json`, `app/seeders/20241011011356-formula-inputs.cjs`

**Interfaces:**
- Consumes: edited-reply target `4475159761` on thread `4471433945`.
- Produces: per-methodology result table and a verdict on `co2eq = 0`.

- [ ] **Step 1: Stand up the stack.** `docker run -d --name cc1201-formtest -e POSTGRES_USER=citycatalyst -e POSTGRES_PASSWORD=development -e POSTGRES_DB=citycatalyst -p 5432:5432 postgres:16-alpine`. Write `app/.env.local` with the DB, `NEXTAUTH_*`, `HOST` and dummy secret values. Export it into the shell, then `npm run db:migrate`, `npm run db:seed`, `npm run create-admin`, and start `npm run dev`. `sequelize-cli` reads `.env`, not `.env.local`, so export the variables instead.
- [ ] **Step 2: Write the scratch spec.** Per run: create city and inventory through `createCityAndInventoryViaApi`, then `PATCH /api/v1/user` with `{ defaultInventoryId, defaultCityId }` (without it the sub-sector page never leaves its spinner). For each methodology listed under `III.2.3`, `III.3.3` and `III.4.3` in the hierarchy (Direct Measure plus the calculation methodology of each), open `/en/cities/{city}/GHGI/{inv}/data/3/{subsectorId}/?refNo=III.x` and add one activity inside `[data-testid="imported-waste-section"]`. Generic fill sets every required field; Methane-style forms need the own-composition radio and twelve percentages summing to 100.
- [ ] **Step 3: Run it** with `npx playwright test e2e/cc1201-forms.tmp.spec.ts --project=chromium --reporter=list --timeout=1800000`. Expected: every methodology reports `saved`.
- [ ] **Step 4: Check the database.** For each saved ref, `omit_from_total = t`; the inventory results total excludes it; `/api/v1/inventory/{id}/results/waste` lists it under `omittedFromTotal`.
- [ ] **Step 5: Investigate `co2eq = 0`.** Count `FormulaInput` rows with `parameter_code ilike '%cc_%'`. If zero, find which seeder file should create them. Then repeat the Methane commitment case for III.1.1 on a clean checkout of `origin/develop` in a second worktree. Same result there means pre-existing; a non-zero result means a regression to report to David before anything else.
- [ ] **Step 4b: Clean up.** Stop the dev server, `docker rm -f cc1201-formtest`, delete the scratch files and `app/test-results`. Expected: `git status --short` clean.
- [ ] **Step 5: Edit reply `4475159761`** with the full methodology table and the `co2eq` verdict. Resolve thread `4471433945` only if every methodology saved and the `co2eq` gap is explained as environment.

### Task 4: Backfill test thread (item 4)

**Files:**
- Delete: `app/tests/backend/gpc-total-exclusions-backfill.jest.ts` (already deleted in `35921c876`)

**Interfaces:**
- Consumes: reply `4472892594`.

- [ ] **Step 1: Confirm the deletion.** `git ls-files app/tests/backend | grep backfill` prints nothing and `git grep -n "gpc-total-exclusions-backfill"` prints nothing.
- [ ] **Step 2: Confirm the migration stays.** `app/migrations/20261030120000-inventory-value-omit-gpc-excluded-refs.cjs` is untouched (Cephas asked to keep it).
- [ ] **Step 3: Edit reply `4472892594`.** Say the test file is removed, the migration is kept, and its safety rests on the SQL guard `AND omit_from_total = false` and an empty `down`. Resolve thread `4471450853`.

### Task 5: Push, sync #3379, update descriptions

**Files:**
- Modify: PR #3373 and #3379 descriptions (via `gh pr edit`)

**Interfaces:**
- Consumes: commits from Tasks 0, 2 and the existing `35921c876`.

- [ ] **Step 1: Push first.** Run the focused suites from Tasks 2 and 4 and `npx tsc --noEmit -p .`. Expected: zero errors. Then `git push origin HEAD:david/cc-1201-gpc-basic-total-exclusions`. Do this before Tasks 1 to 4 edit any reply, so the cited SHAs exist.
- [ ] **Step 2: Merge into #3379.** Check out `origin/david/cc-1201-scope-conflict-review`, `git merge --no-edit origin/david/cc-1201-gpc-basic-total-exclusions`, resolve conflicts keeping both sides, re-run the focused suites, push.
- [ ] **Step 3: Update the #3373 description** test list: real-files resolver test added, backfill test removed.
- [ ] **Step 4: Report to David** the thread table (resolved or open, with the reason) and any regression found in Task 3.
