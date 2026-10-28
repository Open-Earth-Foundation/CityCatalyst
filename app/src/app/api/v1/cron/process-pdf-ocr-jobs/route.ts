/**
 * @swagger
 * /api/v1/cron/process-pdf-ocr-jobs:
 *   post:
 *     tags:
 *       - cron
 *     operationId: processPdfOcrJobs
 *     summary: Process due PDF OCR and delivery jobs
 *     description: Authenticated scheduler endpoint for the durable PDF OCR queue.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer token containing the configured CC cron-job API key.
 *     responses:
 *       200:
 *         description: Due OCR and delivery jobs were processed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 claimed:
 *                   type: integer
 *                 resumed:
 *                   type: integer
 *                 exhausted:
 *                   type: integer
 *                 deliveries:
 *                   type: integer
 *       401:
 *         description: Missing or invalid cron-job API key.
 *       500:
 *         description: PDF OCR processing failed.
 */

import createHttpError from "http-errors";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  processPdfOcrDeliveries,
  resolvePdfOcrDeliverySource,
} from "@/backend/PdfOcrDeliveryService";
import { processPdfOcrJobs } from "@/backend/PdfOcrService";
import { apiHandler } from "@/util/api";

export const maxDuration = 600;

function authenticatePdfOcrCronRequest(req: NextRequest): null {
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
    const ocr = await processPdfOcrJobs();
    const deliveries = await processPdfOcrDeliveries(
      resolvePdfOcrDeliverySource,
    );
    return NextResponse.json({ ...ocr, deliveries });
  },
  { authenticateRequest: authenticatePdfOcrCronRequest },
);
