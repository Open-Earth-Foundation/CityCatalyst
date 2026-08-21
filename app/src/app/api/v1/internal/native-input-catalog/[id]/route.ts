/**
 * @swagger
 * /api/v1/internal/native-input-catalog/{id}:
 *   delete:
 *     operationId: withdrawNativeInputCatalogEntry
 *     summary: Withdraw a CityCatalyst-native input or artifact
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
 *         description: Catalog entry withdrawn.
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
  withdrawNativeInput,
} from "@/backend/NativeInputCatalogService";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ id: z.string().uuid() });

export const DELETE = apiHandler(async (req, { params }) => {
  requireNativeInputCatalogServiceRequest(req);
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    throw new createHttpError.BadRequest("Invalid NativeInputCatalog id");
  }

  const catalog = await withdrawNativeInput(parsedParams.data.id);
  return NextResponse.json({ data: catalog });
});
