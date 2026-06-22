/**
 * @swagger
 * /api/v1/datasource/preview:
 *   get:
 *     tags:
 *       - data
 *       - sources
 *     operationId: getDatasourcePreview
 *     summary: Preview applicable third-party data sources for a city and year.
 *     description: Returns the preferred catalogue source per GPC reference after geography and year filtering. Does not fetch Global API data.
 *     parameters:
 *       - in: query
 *         name: cityId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: inventoryType
 *         required: false
 *         schema:
 *           type: string
 *           enum: [gpc_basic, gpc_basic_plus]
 *     responses:
 *       200:
 *         description: Preview of applicable sources.
 */
import DataSourceConnectService from "@/backend/DataSourceConnectService";
import { PermissionService } from "@/backend/permissions";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const previewQuerySchema = z.object({
  cityId: z.string().uuid(),
  year: z.coerce.number().int().positive(),
  inventoryType: z.enum(["gpc_basic", "gpc_basic_plus"]).optional(),
});

export const GET = apiHandler(async (_req, { session, searchParams }) => {
  const query = previewQuerySchema.parse({
    cityId: searchParams.cityId,
    year: searchParams.year,
    inventoryType: searchParams.inventoryType,
  });

  await PermissionService.canAccessCity(session, query.cityId);

  const data = await DataSourceConnectService.previewApplicableSources(
    query.cityId,
    query.year,
    query.inventoryType,
  );

  return NextResponse.json({ data });
});
