/**
 * @swagger
 * /api/v1/internal/native-input-catalog/{id}/supersede:
 *   post:
 *     operationId: supersedeNativeInputCatalogEntry
 *     summary: Supersede a CityCatalyst-native input or artifact
 *     tags:
 *       - native-input-catalog-internal
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: header
 *         name: X-Service-Name
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: X-Service-Key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Existing entry superseded by a new immutable entry.
 *       400:
 *         description: Invalid replacement or source identity.
 *       401:
 *         description: Missing or invalid service authentication.
 *       404:
 *         description: Catalog entry not found.
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  requireNativeInputCatalogServiceRequest,
  supersedeNativeInput,
} from "@/backend/NativeInputCatalogService";
import { apiHandler } from "@/util/api";
import { nativeInputCatalogRegisterRequest } from "@/util/validation";

const paramsSchema = z.object({ id: z.string().uuid() });

export const POST = apiHandler(async (req, { params }) => {
  requireNativeInputCatalogServiceRequest(req);
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    throw new createHttpError.BadRequest("Invalid NativeInputCatalog id");
  }
  const body = nativeInputCatalogRegisterRequest.parse(await req.json());

  const result = await supersedeNativeInput(parsedParams.data.id, {
    kind: body.kind,
    owningModule: body.owningModule,
    sourceType: body.sourceType,
    sourceId: body.sourceId,
    userId: body.userId,
    inventoryId: body.inventoryId,
    cityId: body.cityId,
    projectId: body.projectId,
    organizationId: body.organizationId,
    contentDigest: body.contentDigest,
    markdownReady: body.markdownReady,
    labels: body.labels,
  });

  return NextResponse.json({ data: result });
});
