/**
 * @swagger
 * /api/v1/cron/enforce-retention:
 *   post:
 *     tags:
 *       - cron
 *     operationId: enforceRetention
 *     summary: Apply configured personal-data retention policies
 *     description: Authenticated scheduler endpoint. Does nothing unless GDPR_RETENTION_ENABLED=true. Anonymizes long-inactive accounts, deletes stale pending invites, revokes unused personal access tokens, and drops bytes of ingest documents withdrawn longer than INGEST_WITHDRAWN_DOCUMENT_DAYS (default 365). Catalog rows stay. Every action is written to RetentionActionLog. Ingress blocks /api/v1/cron/ from outside the cluster (k8s/cc-ingress.yml).
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer token containing the configured CC cron-job API key.
 *     responses:
 *       200:
 *         description: Retention policies were applied or recorded as a dry run.
 *       401:
 *         description: Missing or invalid cron-job API key.
 */
import createHttpError from "http-errors";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { enforceRetentionPolicies } from "@/backend/gdpr/RetentionService";
import { purgeWithdrawnDocumentBytes } from "@/backend/ingest/document-retention";
import { apiHandler } from "@/util/api";

export const maxDuration = 600;

function authenticateRetentionCronRequest(req: NextRequest): null {
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
    const result = await enforceRetentionPolicies();
    const withdrawnDocumentBytes = await purgeWithdrawnDocumentBytes();
    return NextResponse.json({ ...result, withdrawnDocumentBytes });
  },
  { authenticateRequest: authenticateRetentionCronRequest },
);
