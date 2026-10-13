/**
 * @swagger
 * /api/v1/admin/users/{userId}/consent:
 *   get:
 *     tags:
 *       - consent
 *     operationId: getAdminUserConsent
 *     summary: List consent history for a user
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: History and the latest status per consent type.
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Administrator role required.
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/util/api";
import { Roles } from "@/util/types";
import { listConsentForUser } from "@/backend/gdpr/ConsentService";

export const GET = apiHandler(async (_req, { session, params }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  if (session.user.role !== Roles.Admin) {
    throw new createHttpError.Forbidden("Admin only");
  }
  const userId = z.string().uuid().parse(params.userId);
  const data = await listConsentForUser(userId);
  return NextResponse.json({ data });
});
