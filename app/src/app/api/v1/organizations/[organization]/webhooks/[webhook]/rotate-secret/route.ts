/**
 * @swagger
 * /api/v1/organizations/{organization}/webhooks/{webhook}/rotate-secret:
 *   post:
 *     tags:
 *       - organizations
 *       - webhooks
 *     operationId: rotateOrganizationWebhookSecret
 *     summary: Rotate a webhook signing secret
 *     description: Generates a new signing secret and returns the plaintext exactly once. The previous secret is invalidated. Requires admin or organization admin privileges.
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: webhook
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: New secret returned once.
 *       404:
 *         description: Subscription not found.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import UserService from "@/backend/UserService";
import WebhookService from "@/backend/webhooks/WebhookService";
import { apiHandler } from "@/util/api";

export const POST = apiHandler(async (_req, { params, session }) => {
  const organizationId = z.string().uuid().parse(params.organization);
  const webhookId = z.string().uuid().parse(params.webhook);
  await UserService.validateIsAdminOrOrgAdmin(session, organizationId);
  const { subscription, secret } = await WebhookService.rotateSecret(
    organizationId,
    webhookId,
  );
  return NextResponse.json({ data: { ...subscription, secret } });
});
