/**
 * @swagger
 * /api/v1/cron/process-webhook-deliveries:
 *   post:
 *     tags:
 *       - cron
 *     operationId: processWebhookDeliveries
 *     summary: Process due webhook outbox deliveries
 *     description: Authenticated scheduler endpoint that claims pending webhook deliveries, HMAC-signs envelopes, and POSTs them to subscriber URLs.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer token containing the configured CC cron-job API key.
 *     responses:
 *       200:
 *         description: Due deliveries were processed.
 *       401:
 *         description: Missing or invalid cron-job API key.
 */

import createHttpError from "http-errors";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { processWebhookDeliveries } from "@/backend/webhooks/WebhookDeliveryService";
import { apiHandler } from "@/util/api";

export const maxDuration = 600;

function authenticateWebhookCronRequest(req: NextRequest): null {
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
    const result = await processWebhookDeliveries();
    return NextResponse.json(result);
  },
  { authenticateRequest: authenticateWebhookCronRequest },
);
