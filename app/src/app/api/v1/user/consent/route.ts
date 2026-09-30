/**
 * @swagger
 * /api/v1/user/consent:
 *   get:
 *     tags:
 *       - consent
 *     operationId: getUserConsent
 *     summary: List the signed-in user's consent history
 *     responses:
 *       200:
 *         description: History and the latest status per consent type.
 *       401:
 *         description: Authentication required.
 */
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import { listConsentForUser } from "@/backend/gdpr/ConsentService";

export const GET = apiHandler(async (_req, { session }) => {
  if (!session?.user.id) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const data = await listConsentForUser(session.user.id);
  return NextResponse.json({ data });
});
