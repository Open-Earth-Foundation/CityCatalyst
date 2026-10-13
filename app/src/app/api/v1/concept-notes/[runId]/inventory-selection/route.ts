/**
 * @swagger
 * /api/v1/concept-notes/{runId}/inventory-selection:
 *   put:
 *     operationId: selectConceptNoteInventory
 *     summary: Choose the GHG inventory a Concept Note uses
 *     description: Saves the run's inventory choice and rebuilds its context. A null inventory_id restores the newest inventory.
 *     tags:
 *       - concept-notes
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [inventory_id]
 *             properties:
 *               inventory_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *     responses:
 *       202:
 *         description: Selection saved and context rebuild queued
 *       401:
 *         description: Authentication required
 *       403:
 *         description: City or run access denied
 *       404:
 *         description: Concept Note run or inventory not found
 *       503:
 *         description: Climate Advisor context storage or city inventories are unavailable
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import { loadConceptNoteRunCity } from "@/backend/ConceptNoteUploadService";
import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });
const bodySchema = z.object({ inventory_id: z.string().uuid().nullable() });

export const PUT = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = paramsSchema.parse(params);
  const body = bodySchema.parse(await req.json());
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/inventory-selection`,
    userId,
    method: "PUT",
    body,
    requestId,
  });
  const payload = await readConceptNoteApiPayload(response);
  return NextResponse.json(payload, { status: response.status });
});
