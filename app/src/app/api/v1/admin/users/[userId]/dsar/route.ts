/**
 * @swagger
 * /api/v1/admin/users/{userId}/dsar:
 *   get:
 *     tags:
 *       - gdpr
 *     operationId: getAdminUserDsar
 *     summary: Export personal data for a user
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *       403:
 *         description: Administrator role required.
 */
import createHttpError from "http-errors";
import { z } from "zod";
import { apiHandler } from "@/util/api";
import { Roles } from "@/util/types";
import { parseDsarFormat } from "@/backend/gdpr/dsar-format";
import { exportPersonalData } from "@/backend/gdpr/DsarExportService";
import { dsarAttachment } from "@/backend/gdpr/dsar-http";

export const GET = apiHandler(
  async (_req, { session, params, searchParams }) => {
    if (!session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }
    if (session.user.role !== Roles.Admin) {
      throw new createHttpError.Forbidden("Admin only");
    }
    const userId = z.string().uuid().parse(params.userId);
    const format = parseDsarFormat(searchParams.format);
    const result = await exportPersonalData(userId);
    return dsarAttachment(userId, format, result);
  },
);
