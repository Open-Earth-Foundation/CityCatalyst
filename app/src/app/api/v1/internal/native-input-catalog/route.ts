/**
 * @swagger
 * /api/v1/internal/native-input-catalog:
 *   post:
 *     operationId: registerNativeInputCatalogEntry
 *     summary: Register a CityCatalyst-native input or artifact
 *     description: Internal service endpoint. The owning module remains the source of truth; this endpoint stores only a discoverability pointer and scope metadata.
 *     tags:
 *       - native-input-catalog-internal
 *     parameters:
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
 *         description: Existing registration returned idempotently.
 *       201:
 *         description: New registration created.
 *       400:
 *         description: Invalid registration or missing scope.
 *       401:
 *         description: Missing or invalid service authentication.
 */
import { NextResponse } from "next/server";

import {
  registerNativeInput,
  requireNativeInputCatalogServiceRequest,
} from "@/backend/NativeInputCatalogService";
import { apiHandler } from "@/util/api";
import { nativeInputCatalogRegisterRequest } from "@/util/validation";

export const POST = apiHandler(async (req) => {
  requireNativeInputCatalogServiceRequest(req);
  const body = nativeInputCatalogRegisterRequest.parse(await req.json());
  const result = await registerNativeInput({
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

  return NextResponse.json(
    { data: result.catalog, created: result.created },
    { status: result.created ? 201 : 200 },
  );
});
