/**
 * @swagger
 * /api/v1/modules/{module}/ingest:
 *   post:
 *     operationId: ingestModuleFile
 *     summary: Upload a file onto the shared ingest runner
 *     description: Multipart new-bytes enqueue. Zip inner files become items. Dry-run skips commit and Path B.
 *     tags:
 *       - ingest
 *     parameters:
 *       - in: path
 *         name: module
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ghgi, ccra, cnb, test]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               cityId:
 *                 type: string
 *                 format: uuid
 *               inventoryId:
 *                 type: string
 *                 format: uuid
 *               projectId:
 *                 type: string
 *                 format: uuid
 *               organizationId:
 *                 type: string
 *                 format: uuid
 *               dryRun:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Job finished or awaiting review
 *       400:
 *         description: Unknown module, missing scope, or no file
 *       401:
 *         description: Unauthorized
 */

import { assertCanEnqueueIngest } from "@/backend/ingest/access";
import { createIngestRuntime } from "@/backend/ingest/http";
import {
  filesFromIngestForm,
  parseIngestDryRun,
  parseIngestScope,
  publicIngestItem,
  publicIngestJob,
  startModuleIngest,
} from "@/backend/ingest/start";
import { createIngestPlugin } from "@/backend/ingest/registry";
import { INGEST_MODULES, type IngestModuleId } from "@/backend/ingest/types";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const moduleId = params.module as IngestModuleId;
  if (!INGEST_MODULES.includes(moduleId)) {
    throw new createHttpError.BadRequest(
      `Unknown ingest module ${params.module}`,
    );
  }

  let plugin;
  try {
    plugin = createIngestPlugin(moduleId);
  } catch {
    throw new createHttpError.BadRequest(
      `No ingest plugin registered for module ${moduleId}`,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new createHttpError.BadRequest("Invalid multipart upload");
  }

  const scope = parseIngestScope(form);
  await assertCanEnqueueIngest(session, scope);
  const files = await filesFromIngestForm(form);
  const { store, runner } = createIngestRuntime();
  const { job, items } = await startModuleIngest({
    moduleId,
    files,
    scope,
    userId: session.user.id,
    dryRun: parseIngestDryRun(form.get("dryRun")),
    runner,
    store,
    plugin,
  });
  return NextResponse.json({
    data: {
      job: publicIngestJob(job),
      items: items.map(publicIngestItem),
    },
  });
});
