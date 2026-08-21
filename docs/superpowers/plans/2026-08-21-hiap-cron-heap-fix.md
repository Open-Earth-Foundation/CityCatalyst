# HIAP Cron Heap Exhaustion Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Keep the five-minute HIAP polling endpoint lightweight and move NativeInputCatalog backfill work into an isolated, bounded, restartable Kubernetes Job.

**Architecture:** The Web cron route will no longer call catalog backfills. A dedicated TypeScript command will process rankings and action plans page-by-page with `(created, id)` keyset cursors, bounded memory, exact source identities, per-record failure isolation, and a Postgres advisory lock. A manual Kubernetes Job will run the command outside the Web deployment.

**Tech Stack:** Next.js route handlers, TypeScript, Sequelize/Postgres, Jest, `tsx`, Kubernetes batch Jobs.

**Spec:** Linear CC-752 and `vault/01 - Work/OpenEarth/CityCatalyst/tasks/CC-752/plan.md`.

## Global Constraints

- The five-minute Web cron endpoint may only perform lightweight HIAP status polling and batch progression.
- Existing HIAP source tables remain authoritative; the backfill writes only through the NativeInputCatalog lifecycle.
- Backfill execution must be bounded, idempotent, restartable, and safe when individual records fail.
- Production backfill is a separately approved operational action.
- Increasing Node.js heap size is not the primary fix.

---

### Task 1: Establish the failing regression tests

**Files:**
- Create: `app/tests/api/check-hiap-jobs-route.jest.ts` — assert the polling route does not invoke catalog backfills.
- Modify: `app/tests/hiap-native-input-catalog-service.jest.ts` — cover bounded page queries, keyset cursors, and per-record failure isolation.

**Interfaces:**
- Consumes: existing route and service test fixtures.
- Produces: failing tests that define the lightweight route contract and paginated backfill API.

- [x] **Step 1: Write the route isolation test**

  Add a standalone authenticated-route test with mocked backfill exports, invoke the cron route with no pending jobs, and assert no backfill mock is called. Assert the response does not expose backfill counters.

- [x] **Step 2: Write the page-boundedness test**

  Add a service test that calls the new page API with `limit: 2`, returns three successful ranking fixtures from successive calls, and asserts each `findAll` call receives `limit: 2` and a `(created, id)` cursor rather than loading all records.

- [x] **Step 3: Write the partial-failure test**

  Add a test with two page records where the first catalog sync returns `null` and the second succeeds. Assert the page reports one failure and one repair, and that both records were attempted.

- [x] **Step 4: Run the focused tests to verify they fail**

  Run: `npx jest --runInBand tests/api/bulk-hiap-prioritization.jest.ts tests/hiap-native-input-catalog-service.jest.ts --coverage=false`

  Expected: FAIL because the route still calls the backfills and the bounded page API does not yet exist.

---

### Task 2: Remove heavy work from the Web cron route

**Files:**
- Modify: `app/src/app/api/v1/cron/check-hiap-jobs/route.ts` — remove backfill imports, calls, response fields, and logs.
- Modify: `app/src/app/api/v1/cron/check-hiap-jobs/README.md` — document polling-only behavior and link the separate backfill Job.
- Test: `app/tests/api/bulk-hiap-prioritization.jest.ts` — route isolation regression test from Task 1.

**Interfaces:**
- Consumes: existing HIAP status checks and batch progression.
- Produces: a response containing only `checkedJobs`, `completedJobs`, `startedBatches`, and `durationMs`.

- [x] **Step 1: Remove the backfill imports and invocation**

  Delete the `HiapNativeInputCatalogService` backfill import and the two calls after pending-job processing. Keep the route's status polling, failure handling, and next-batch logic unchanged.

- [x] **Step 2: Update response and documentation**

  Remove `catalogBackfilled` and `actionPlansBackfilled` from the response and logs. Replace the README's backfill section with the statement that catalog reconciliation runs separately through the dedicated Job.

- [x] **Step 3: Run the route regression test**

  Run: `npx jest --runInBand tests/api/bulk-hiap-prioritization.jest.ts --coverage=false`

  Expected: PASS for the new isolation assertion and all existing bulk HIAP route tests.

---

### Task 3: Add bounded HIAP catalog page processing

**Files:**
- Modify: `app/src/backend/hiap/HiapNativeInputCatalogService.ts` — add typed page options, keyset queries, minimal projections, dry-run support, and per-record outcome reporting.
- Modify: `app/tests/hiap-native-input-catalog-service.jest.ts` — service tests from Task 1 plus dry-run and action-plan coverage.

**Interfaces:**
- Consumes: `buildHIAPRankingInput`, `buildHIAPActionPlanInput`, `syncHIAPRanking`, `syncHIAPActionPlan`, and existing Sequelize models.
- Produces:

  ```ts
  export type HIAPCatalogBackfillCursor = { created: string; id: string };

  export type HIAPCatalogBackfillPageOptions = {
    limit: number;
    cursor?: HIAPCatalogBackfillCursor;
    dryRun?: boolean;
  };

  export type HIAPCatalogBackfillPage = {
    scanned: number;
    repaired: number;
    failed: number;
    nextCursor: HIAPCatalogBackfillCursor | null;
    hasMore: boolean;
  };

  export async function backfillMissingHIAPRankingsPage(
    options: HIAPCatalogBackfillPageOptions,
  ): Promise<HIAPCatalogBackfillPage>;

  export async function backfillMissingHIAPActionPlansPage(
    options: HIAPCatalogBackfillPageOptions,
  ): Promise<HIAPCatalogBackfillPage>;
  ```

- [x] **Step 1: Add cursor and page result types**

  Define the exported types above. Serialize cursor dates as ISO strings so the command can persist/restart from logs or environment input without passing Sequelize `Date` instances across the boundary.

- [x] **Step 2: Add the ranking page query**

  Query only successful rankings with required ranked rows, selecting `id`, `inventoryId`, `userId`, `locode`, `type`, `langs`, and `created`. Order by `created ASC, id ASC`, apply the cursor predicate, and set `limit` from the caller. Do not include the full Inventory or ranked-action payload in the page query; the existing builders fetch only the fields needed for registration.

- [x] **Step 3: Add the action-plan page query**

  Query only action plans with non-null `inventoryId` and `highImpactActionRankedId`, selecting the persisted fields used by `planContent`, plus `created` and `id`. Order and cursor identically to rankings. Do not load the complete table before processing.

- [x] **Step 4: Process each record independently**

  In non-dry-run mode, call `syncHIAPRanking` or `syncHIAPActionPlan` for one record at a time. Count a non-null registration as successful and a `null` result as failed. Continue to the next record after failures. In dry-run mode, build the registration input without calling `registerNativeInput` and count the record as a candidate.

- [x] **Step 5: Return the next cursor**

  Use the final record's `created` and `id` as `nextCursor` only when the page is full. Return `hasMore` accordingly, preserving deterministic traversal across reruns.

- [x] **Step 6: Run the focused service tests**

  Run: `npx jest --runInBand tests/hiap-native-input-catalog-service.jest.ts --coverage=false`

  Expected: PASS for bounded queries, cursor traversal, partial failures, dry-run behavior, and existing registration/backfill tests.

---

### Task 4: Add the isolated backfill command and Kubernetes Job

**Files:**
- Create: `app/scripts/hiap-catalog-backfill.ts` and `app/src/backend/hiap/HiapCatalogBackfillRunner.ts` — initialize the database, acquire a Postgres advisory lock, drain ranking/action-plan pages, log aggregate outcomes, and close the database.
- Modify: `app/package.json` — add `hiap-catalog-backfill` script.
- Create: `k8s/prod/cc-hiap-catalog-backfill-manual.yml` — run the command as a standalone batch Job with bounded resources and no Web routing.
- Test: `app/tests/hiap-catalog-backfill-runner.jest.ts` — test configuration parsing, page draining, and lock/no-op behavior without connecting to production.

**Interfaces:**
- Consumes: page APIs from Task 3; environment variables `HIAP_CATALOG_BACKFILL_BATCH_SIZE`, `HIAP_CATALOG_BACKFILL_MAX_BATCHES`, and `HIAP_CATALOG_BACKFILL_DRY_RUN`.
- Produces: a standalone command invoked by `npm run hiap-catalog-backfill` and a manual Kubernetes Job manifest.

- [x] **Step 1: Write command tests**

  Test that defaults are `batchSize=25`, unlimited batches, and apply mode; environment values override defaults; a lock miss exits without processing; and the command always releases the advisory lock after success or failure.

- [x] **Step 2: Run command tests to verify they fail**

  Run: `npx jest --runInBand tests/hiap-catalog-backfill-runner.jest.ts --coverage=false`

  Expected: FAIL because the command and configuration helper do not exist.

- [x] **Step 3: Implement the command loop**

  Load environment configuration, initialize `db`, call `pg_try_advisory_lock(hashtext('citycatalyst:hiap-catalog-backfill'))`, and exit with a non-zero status when another run owns the lock. Drain ranking pages first, then action-plan pages, passing the final cursor into the next request. Stop at `HIAP_CATALOG_BACKFILL_MAX_BATCHES` when set. Log aggregate scanned/repaired/failed counts and always call `pg_advisory_unlock` in `finally`.

- [x] **Step 4: Add the package script and Job manifest**

  Add `"hiap-catalog-backfill": "tsx scripts/hiap-catalog-backfill.ts"`. The Job should use the application image, `cc-db-configmap`, `restartPolicy: Never`, `backoffLimit: 0`, `ttlSecondsAfterFinished: 86400`, and explicit `1024Mi` memory / `1000m` CPU limits. It must run the command directly and must not curl `cc-web`.

- [x] **Step 5: Run command tests and manifest validation**

  Run: `npx jest --runInBand tests/hiap-catalog-backfill-runner.jest.ts --coverage=false` and `kubectl apply --dry-run=client -f k8s/prod/cc-hiap-catalog-backfill-manual.yml` when `kubectl` is available.

  Expected: PASS and a valid Kubernetes manifest.

---

### Task 5: Full verification and operational handoff

**Files:**
- Modify: `app/src/app/api/v1/cron/check-hiap-jobs/README.md` — add rollout, monitoring, rollback, and manual backfill instructions.
- Modify: `vault/01 - Work/OpenEarth/CityCatalyst/tasks/CC-752/status.md` and `history.md` — record verification evidence and remaining production approval.

- [ ] **Step 1: Run all focused tests**

  Run: `npx jest --runInBand tests/api/check-hiap-jobs-route.jest.ts tests/hiap-native-input-catalog-service.jest.ts tests/hiap-catalog-backfill-runner.jest.ts --coverage=false`

  Expected: 0 failures.

- [ ] **Step 2: Run lint and type validation for changed files**

  Run targeted ESLint for the changed route, service, runner, command, and tests.

  Expected: 0 errors. Run the repository typecheck/build command separately and record any pre-existing blockers rather than masking them.

- [ ] **Step 3: Verify the diff and operational contract**

  Confirm the Web route contains no NativeInputCatalog backfill calls, the Job does not route through `cc-web`, cursor/batch limits are enforced, lock release is in `finally`, and no source-table mutation or content copy was introduced.

- [ ] **Step 4: Update the Vault and Linear handoff**

  Record exact test output, branch, commit/PR links, unresolved production approval, and the next safe operational action in CC-752. Do not mark the ticket done until the production hotfix and separately approved backfill run have evidence.
