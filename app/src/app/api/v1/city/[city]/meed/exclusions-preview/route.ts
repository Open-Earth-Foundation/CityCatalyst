import MeedApiService from "@/backend/MeedApiService";
import { PermissionService } from "@/backend/permissions";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import z from "zod";

/**
 * @swagger
 * /api/v1/city/{city}/meed/exclusions-preview:
 *   post:
 *     tags:
 *       - meed
 *       - city
 *     operationId: getMeedExclusionsPreview
 *     summary: Fetches preview of exclusions from prioritization
 *     description: Fetches preview of actions excluded before the prioritization process runs
 *     parameters:
 *       - in: path
 *         name: city
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
 *             properties:
 *               cityDataList:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     locode:
 *                       type: string
 *                     excludedSectorTags:
 *                       type: array
 *                       items:
 *                         type: string
 *                     excludedCoBenefitKeys:
 *                       type: array
 *                       items:
 *                         type: string
 *                     excludedActionsFreeText:
 *                       type: string
 *     responses:
 *       200:
 *         description: Prioritization exclusions retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       locode:
 *                         type: string
 *                       proposedExcludedActions:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             actionId:
 *                               type: string
 *                             actionName:
 *                               type: string
 *                             reasons:
 *                               type: array
 *                               items:
 *                                 type: string
 *                             matchedBy:
 *                               type: array
 *                               items:
 *                                 type: string
 *                       exclusionSummary:
 *                         type: object
 *                         properties:
 *                           totalProposed:
 *                             type: number
 *                           byReasonType:
 *                             type: object
 *                             additionalProperties:
 *                               type: object
 *                               properties:
 *                                 count:
 *                                   type: number
 *                                 actionIds:
 *                                   type: array
 *                                   items:
 *                                     type: string
 *                       warnings:
 *                         type: array
 *                         items:
 *                           type: string
 */
const getExclusionsPreviewParams = z.object({
  city: z.string().uuid(),
});
const getExclusionsPreviewRequest = z.object({
  cityDataList: z.array(
    z.object({
      locode: z.string().min(1),
      excludedSectorTags: z.array(z.string()),
      excludedCoBenefitKeys: z.array(z.string()),
      excludedActionsFreeText: z.string(),
    }),
  ),
});

export const POST = apiHandler(async (req, { session, params }) => {
  const { city: cityId } = getExclusionsPreviewParams.parse(params);
  const body = getExclusionsPreviewRequest.parse(await req.json());
  await PermissionService.canAccessCity(session, cityId);
  const result = await MeedApiService.getExclusionsPreview(body);
  return NextResponse.json({ data: result });
});
