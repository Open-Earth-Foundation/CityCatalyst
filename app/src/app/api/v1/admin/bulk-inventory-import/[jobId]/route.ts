/**
 * @swagger
 * /api/v1/admin/bulk-inventory-import/{jobId}:
 *   get:
 *     tags:
 *       - admin
 *     operationId: getBulkInventoryImportJob
 *     summary: Get a bulk inventory-file import job and its items
 *     description: Returns one job, item counts, and items. Optional status query filters items. Requires an admin session.
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, matched, unmatched, importing, completed, failed, skipped]
 *     responses:
 *       200:
 *         description: Job, counts, and items
 *       400:
 *         description: Invalid jobId or status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import {
  BulkInventoryImportJobService,
  serializeItem,
  serializeJob,
} from "@/backend/BulkInventoryImportJobService";
import { BulkInventoryImportItemStatus } from "@/util/enums";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import { z } from "zod";

const paramsSchema = z.object({
  jobId: z.string().uuid(),
});

const querySchema = z.object({
  status: z.nativeEnum(BulkInventoryImportItemStatus).optional(),
});

export const GET = apiHandler(
  async (_req, { session, params, searchParams }) => {
    UserService.ensureIsAdmin(session);

    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new createHttpError.BadRequest("jobId must be a UUID");
    }
    const parsedQuery = querySchema.safeParse(searchParams);
    if (!parsedQuery.success) {
      throw new createHttpError.BadRequest("Invalid status filter");
    }

    const { jobId } = parsedParams.data;
    const { status } = parsedQuery.data;

    const result = await BulkInventoryImportJobService.getJobWithRollup(jobId);
    if (!result) {
      throw new createHttpError.NotFound("Job not found");
    }

    const items = status
      ? result.items.filter((item) => item.status === status)
      : result.items;

    return NextResponse.json({
      data: {
        ...serializeJob(result.job, result.counts),
        items: items.map(serializeItem),
      },
    });
  },
);
