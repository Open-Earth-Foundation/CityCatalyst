/**
 * @swagger
 * /api/v1/consent:
 *   post:
 *     tags:
 *       - consent
 *     operationId: postConsent
 *     summary: Record a consent grant or withdrawal
 *     description: Append-only. Works for a signed-in user or an anonymous browser subject key. The server stamps the current privacy-policy version.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [consentType, granted]
 *             properties:
 *               consentType:
 *                 type: string
 *                 enum: [analytics, marketing]
 *               granted:
 *                 type: boolean
 *               subjectKey:
 *                 type: string
 *                 format: uuid
 *               source:
 *                 type: string
 *                 enum: [cookie_banner, account_settings, api]
 *     responses:
 *       201:
 *         description: Consent event stored.
 *       400:
 *         description: Invalid body, or neither a session nor a subject key was provided.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiHandler } from "@/util/api";
import { recordConsentRequest } from "@/util/validation";
import { recordConsent } from "@/backend/gdpr/ConsentService";
import type { ConsentSource } from "@/util/gdpr/constants";

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  if (!ip) return null;
  return ip.slice(0, 64);
}

export const POST = apiHandler(async (req, { session }) => {
  const body = recordConsentRequest.parse(await req.json());
  const userAgent = req.headers.get("user-agent")?.slice(0, 512) ?? null;
  const record = await recordConsent({
    userId: session?.user.id ?? null,
    subjectKey: body.subjectKey ?? null,
    consentType: body.consentType,
    granted: body.granted,
    source: (body.source ?? "api") as ConsentSource,
    userAgent,
    ipAddress: clientIp(req),
  });
  return NextResponse.json({ data: record }, { status: 201 });
});
