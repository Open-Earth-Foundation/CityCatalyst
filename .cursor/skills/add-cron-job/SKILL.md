---
name: add-cron-job
description: Add a new scheduled job — both the k8s CronJob manifest and the Next.js cron route handler. Use when the user asks to add a cron, scheduled job, periodic task, or background sync.
---

# add-cron-job

A new cron in CityCatalyst spans 3 files and one workflow change.

## When to use

- The user asks to add a scheduled / periodic / cron task.
- The user asks to add a `cc-*` k8s CronJob.
- A new background sync needs to fire on a schedule.

## Workflow

### Step 1 — Cron route handler

Create `app/src/app/api/v1/cron/<job-slug>/route.ts`:

```ts
/**
 * @swagger
 * /api/v1/cron/<job-slug>:
 *   get:
 *     operationId: cron<JobSlug>
 *     summary: Triggered by k8s CronJob; do not call from clients.
 *     tags: [cron]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: ok }
 *       401: { description: unauthorized }
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { logger } from "@/services/logger";

const expectedKey = process.env.CC_CRON_JOB_API_KEY;

export const GET = apiHandler(async (req) => {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  // Reject empty / missing token explicitly.
  if (!token || !expectedKey || token !== expectedKey) {
    throw new createHttpError.Unauthorized("invalid cron token");
  }

  try {
    // ... do the work, in small chunks; respect a per-invocation budget.
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "cron <job-slug> failed");
    throw new createHttpError.InternalServerError("cron failed");
  }
});
```

### Step 2 — k8s CronJob manifest

Create `k8s/cc-<job-slug>.yml` using the skeleton in `.cursor/rules/k8s-cron-conventions.mdc`. Key points:

- `schedule: "* * * * *"` (or whatever cadence — keep generous).
- `concurrencyPolicy: Forbid`.
- `set -euo pipefail` and `[ -z "$CC_CRON_JOB_API_KEY" ]` check.
- `curl -fsS --max-time <s>` with explicit timeout.
- `Authorization: Bearer $CC_CRON_JOB_API_KEY`.
- Mirror to `k8s/test/cc-<job-slug>.yml` (test env) and `k8s/prod/cc-<job-slug>.yml` (prod env).

### Step 3 — Wire into deploy workflows

In `.github/workflows/web-develop.yml`, add the new manifest to the `kubectl apply -f k8s/cc-<job-slug>.yml` block. Same for `web-test.yml` (using `k8s/test/`) and `web-tag.yml` (using `k8s/prod/`).

### Step 4 — Smoke test the route

Add `app/tests/api/cron-<job-slug>.jest.ts`:

```ts
import { setupTests, teardownTests, mockRequest, expectStatusCode } from "../helpers";
import { GET } from "@/app/api/v1/cron/<job-slug>/route";

describe("cron/<job-slug>", () => {
  beforeAll(() => setupTests());
  afterAll(() => teardownTests());

  it("rejects missing token", async () => {
    const req = mockRequest(undefined, undefined, {});
    const res = await GET(req, { params: Promise.resolve({}) });
    expectStatusCode(res, 401);
  });

  it("rejects empty Bearer token", async () => {
    const req = mockRequest(undefined, undefined, { authorization: "Bearer " });
    const res = await GET(req, { params: Promise.resolve({}) });
    expectStatusCode(res, 401);
  });

  it("accepts valid token", async () => {
    process.env.CC_CRON_JOB_API_KEY = "test-key";
    const req = mockRequest(undefined, undefined, { authorization: "Bearer test-key" });
    const res = await GET(req, { params: Promise.resolve({}) });
    expectStatusCode(res, 200);
  });
});
```

### Step 5 — Document

- Add a one-liner to `app/README.md` under "Cron jobs" (create section if missing).
- Run the `docs-after-change` skill.

## Checklist

- [ ] Route uses `apiHandler` and rejects empty / missing tokens explicitly.
- [ ] Swagger JSDoc with `tags: [cron]` and `security: [{ bearerAuth: [] }]`.
- [ ] Manifest has probes (where applicable), `concurrencyPolicy: Forbid`, and `activeDeadlineSeconds`.
- [ ] Shell script uses `set -euo pipefail` and `[ -z … ]` for missing-var check.
- [ ] `curl --max-time` set explicitly.
- [ ] Manifest mirrored across dev / test / prod, with intentional differences flagged in comments.
- [ ] Workflow files updated to apply the new manifest.
- [ ] Jest test for missing / empty / valid token paths.
