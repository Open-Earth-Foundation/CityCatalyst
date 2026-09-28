/**
 * @swagger
 * /api/v1/user/data-download:
 *   get:
 *     tags:
 *       - gdpr
 *     operationId: getUserDataDownload
 *     summary: Download the signed-in user's personal data
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *     responses:
 *       200:
 *         description: Machine-readable export of inventoried personal data.
 *       401:
 *         description: Authentication required.
 */
import createHttpError from "http-errors";
import { apiHandler } from "@/util/api";
import { parseDsarFormat } from "@/backend/gdpr/dsar-format";
import { exportPersonalData } from "@/backend/gdpr/DsarExportService";
import { dsarAttachment } from "@/backend/gdpr/dsar-http";

export const GET = apiHandler(async (_req, { session, searchParams }) => {
  if (!session?.user.id) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const format = parseDsarFormat(searchParams.format);
  const result = await exportPersonalData(session.user.id);
  return dsarAttachment(session.user.id, format, result);
});
