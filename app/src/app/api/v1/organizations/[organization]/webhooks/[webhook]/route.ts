/**
 * @swagger
 * /api/v1/organizations/{organization}/webhooks/{webhook}:
 *   get:
 *     tags:
 *       - organizations
 *       - webhooks
 *     operationId: getOrganizationWebhook
 *     summary: Get a webhook subscription
 *     description: Returns one subscription without the signing secret. Requires admin or organization admin privileges.
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
 *         description: Subscription returned.
 *       404:
 *         description: Subscription not found.
 *   patch:
 *     tags:
 *       - organizations
 *       - webhooks
 *     operationId: patchOrganizationWebhook
 *     summary: Update a webhook subscription
 *     description: Updates name, URL, events, or enabled flag. Requires admin or organization admin privileges.
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
 *         description: Subscription updated.
 *   delete:
 *     tags:
 *       - organizations
 *       - webhooks
 *     operationId: deleteOrganizationWebhook
 *     summary: Delete a webhook subscription
 *     description: Deletes the subscription and cascades pending deliveries. Requires admin or organization admin privileges.
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
 *         description: Subscription deleted.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import UserService from "@/backend/UserService";
import WebhookService from "@/backend/webhooks/WebhookService";
import { apiHandler } from "@/util/api";
import { updateWebhookSubscriptionRequest } from "@/util/validation";

export const GET = apiHandler(async (_req, { params, session }) => {
  const organizationId = z.string().uuid().parse(params.organization);
  const webhookId = z.string().uuid().parse(params.webhook);
  await UserService.validateIsAdminOrOrgAdmin(session, organizationId);
  const sub = await WebhookService.get(organizationId, webhookId);
  return NextResponse.json({ data: WebhookService.toPublic(sub) });
});

export const PATCH = apiHandler(async (req, { params, session }) => {
  const organizationId = z.string().uuid().parse(params.organization);
  const webhookId = z.string().uuid().parse(params.webhook);
  await UserService.validateIsAdminOrOrgAdmin(session, organizationId);
  const body = updateWebhookSubscriptionRequest.parse(await req.json());
  const data = await WebhookService.update(organizationId, webhookId, body);
  return NextResponse.json({ data });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const organizationId = z.string().uuid().parse(params.organization);
  const webhookId = z.string().uuid().parse(params.webhook);
  await UserService.validateIsAdminOrOrgAdmin(session, organizationId);
  await WebhookService.remove(organizationId, webhookId);
  return NextResponse.json({ success: true });
});
