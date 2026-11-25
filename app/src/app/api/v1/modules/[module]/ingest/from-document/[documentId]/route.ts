/**
 * @swagger
 * /api/v1/modules/{module}/ingest/from-document/{documentId}:
 *   post:
 *     operationId: ingestFromDocument
 *     summary: Ingest an existing city document into a module
 *     description: Enqueues a job from pooled bytes. Does not accept a new file. Skips store and Path B; Path A is registered on commit.
 *     tags:
 *       - ingest
 *     parameters:
 *       - in: path
 *         name: module
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ghgi, ccra, cnb, test]
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventoryId:
 *                 type: string
 *                 format: uuid
 *               cityId:
 *                 type: string
 *                 format: uuid
 *               dryRun:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Job finished (or awaiting review)
 *       404:
 *         description: document_not_found
 *       409:
 *         description: document_withdrawn, document_superseded, or document_unavailable
 */

import { assertCanAccessIngestDocument } from "@/backend/ingest/access";
import { createIngestRunner } from "@/backend/ingest/http";
import { SequelizeIngestDocumentPool } from "@/backend/ingest/IngestDocumentPoolService";
import { createIngestPlugin } from "@/backend/ingest/registry";
import { INGEST_MODULES, type IngestModuleId } from "@/backend/ingest/types";
import { apiHandler } from "@/util/api";
import { ingestFromDocumentRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const moduleId = params.module as IngestModuleId;
  if (!INGEST_MODULES.includes(moduleId)) {
    throw new createHttpError.BadRequest(`Unknown ingest module ${params.module}`);
  }

  let body: ReturnType<typeof ingestFromDocumentRequest.parse> = {};
  const text = await req.text();
  if (text.trim()) {
    body = ingestFromDocumentRequest.parse(JSON.parse(text));
  }

  const pool = new SequelizeIngestDocumentPool();
  const document = await pool.get(params.documentId);
  if (!document) {
    throw new createHttpError.NotFound("Ingest document not found");
  }
  await assertCanAccessIngestDocument(session, document);

  let plugin;
  try {
    plugin = createIngestPlugin(moduleId);
  } catch {
    throw new createHttpError.BadRequest(
      `No ingest plugin registered for module ${moduleId}`,
    );
  }

  const runner = createIngestRunner();
  const job = await runner.enqueueFromDocument({
    moduleId,
    documentId: params.documentId,
    dryRun: body.dryRun,
    uploadedByUserId: session.user.id,
    scope: {
      inventoryId: body.inventoryId,
      cityId: body.cityId,
      projectId: body.projectId,
      organizationId: body.organizationId,
    },
  });
  const finished = await runner.run(job.id, plugin);
  return NextResponse.json({ data: finished });
});
