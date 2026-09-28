/**
 * @swagger
 * /api/v1/cron/process-bulk-inventory-import:
 *   post:
 *     tags:
 *       - cron
 *     operationId: processBulkInventoryImport
 *     summary: Process pending bulk inventory-file import items
 *     description: Authenticated scheduler endpoint. Imports a small batch of pending eCRF / near-eCRF items in-process. Does not call OpenAI.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Batch processed
 *       401:
 *         description: Unauthorized
 */
import createHttpError from "http-errors";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import { BulkInventoryImportWorkerService } from "@/backend/BulkInventoryImportWorkerService";

export const maxDuration = 600;

function authenticateCronRequest(req: NextRequest): null {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const expectedToken = process.env.CC_CRON_JOB_API_KEY;
  if (!expectedToken || !token || token !== expectedToken) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  return null;
}

export const POST = apiHandler(
  async () => {
    const result = await BulkInventoryImportWorkerService.processDueJobs();
    return NextResponse.json({ data: result });
  },
  { authenticateRequest: authenticateCronRequest },
);
