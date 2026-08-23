import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import { z } from "zod";
import { languages } from "@/i18n/settings";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { hiapApiWrapper } from "@/backend/hiap/HiapApiService";
import { HIAction, LANGUAGES } from "@/util/types";
import { logger } from "@/services/logger";

const generateRankingRequest = z.object({
  action: z.any(), // HIAction object - using z.any() for flexibility
  inventoryId: z.string().uuid("Inventory ID is required"),
  cityLocode: z.string().min(1, "City is required"),
  lng: z.enum([languages[0], ...languages.slice(1)]).optional(), // workaround for required first element in Zod type
});

/** Quick response so ingress does not 504; HIAP poll/save/email runs in background. */
export const maxDuration = 30;

/**
 * @swagger
 * /api/v1/city/{city}/hiap/action-plan/generate:
 *   post:
 *     tags:
 *       - city
 *       - hiap
 *     operationId: postCityHiapActionPlanGenerate
 *     summary: Start action plan generation for a specific action
 *     description: |
 *       Accepts generation and returns 202 immediately. HIAP polling, DB save, and
 *       the ready email run in the background. Clients should rely on email (not this
 *       response) for completion notification.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - inventoryId
 *               - cityLocode
 *             properties:
 *               action:
 *                 type: object
 *                 description: HIAction object
 *               inventoryId:
 *                 type: string
 *                 format: uuid
 *               cityLocode:
 *                 type: string
 *               lng:
 *                 type: string
 *                 description: Language code
 *     responses:
 *       202:
 *         description: Action plan generation accepted; completion notified by email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     accepted:
 *                       type: boolean
 *                     message:
 *                       type: string
 */
export const POST = apiHandler(
  async (req: NextRequest, { params, session }) => {
    const body = generateRankingRequest.parse(await req.json());
    await PermissionService.canAccessInventory(session, body.inventoryId);

    const lng = body.lng || languages[0];
    const cityId = params.city;
    const createdBy = session?.user?.id;

    hiapApiWrapper
      .startActionPlanJob({
        action: body.action as HIAction,
        cityId,
        cityLocode: body.cityLocode,
        lng: lng as LANGUAGES,
        inventoryId: body.inventoryId,
        createdBy,
      })
      .catch((err) =>
        logger.error(
          {
            err,
            cityId,
            inventoryId: body.inventoryId,
            actionId: (body.action as HIAction)?.actionId,
          },
          "Action plan generation background failed",
        ),
      );

    return NextResponse.json(
      {
        data: {
          accepted: true,
          message:
            "Action plan generation started; you will receive an email when it is ready.",
        },
      },
      { status: 202 },
    );
  },
);
