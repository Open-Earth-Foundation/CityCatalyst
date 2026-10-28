/**
 * @swagger
 * /api/v1/organizations/{organization}/webhooks:
 *   get:
 *     tags:
 *       - organizations
 *       - webhooks
 *     operationId: getOrganizationWebhooks
 *     summary: List webhook subscriptions
 *     description: Lists organization-scoped webhook subscriptions. Signing secrets are never returned. Requires admin or organization admin privileges.
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Subscriptions returned.
 *       403:
 *         description: Caller is not an org admin.
 *   post:
 *     tags:
 *       - organizations
 *       - webhooks
 *     operationId: postOrganizationWebhooks
 *     summary: Create a webhook subscription
 *     description: Creates a subscription and returns the signing secret exactly once. Requires admin or organization admin privileges.
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, url, events]
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Subscription created. Includes secret once.
 *       400:
 *         description: Invalid URL or event types.
 *       403:
 *         description: Caller is not an org admin.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import UserService from "@/backend/UserService";
import WebhookService from "@/backend/webhooks/WebhookService";
import { apiHandler } from "@/util/api";
import { createWebhookSubscriptionRequest } from "@/util/validation";

export const GET = apiHandler(async (_req, { params, session }) => {
  const organizationId = z.string().uuid().parse(params.organization);
  await UserService.validateIsAdminOrOrgAdmin(session, organizationId);
  const data = await WebhookService.list(organizationId);
  return NextResponse.json({ data });
});

export const POST = apiHandler(async (req, { params, session }) => {
  const organizationId = z.string().uuid().parse(params.organization);
  await UserService.validateIsAdminOrOrgAdmin(session, organizationId);
  const body = createWebhookSubscriptionRequest.parse(await req.json());
  const { subscription, secret } = await WebhookService.create({
    organizationId,
    name: body.name,
    url: body.url,
    events: body.events,
    createdBy: session?.user?.id,
  });
  return NextResponse.json({ data: { ...subscription, secret } });
});
