/**
 * @swagger
 * /api/v1/inventory/{inventory}/notation-keys:
 *   get:
 *     tags:
 *       - inventory
 *       - notation-keys
 *     operationId: getInventoryNotationKeys
 *     summary: List notation key candidates grouped by sector reference number.
 *     description: Returns unfilled or notation-key-filled subcategory entries grouped by sector ref number to help populate notation keys. Requires a signed‑in user with read access to the inventory. Response is { success, result }.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Candidates grouped by sector reference number.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 result:
 *                   type: object
 *                   properties:
 *                     notationKeys:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:
 *                             type: string
 *                           description:
 *                             type: string
 *                           used:
 *                             type: boolean
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         used:
 *                           type: number
 *                         unused:
 *                           type: number
 */
import UserService from "@/backend/UserService";
import {
  listNotationKeyCandidateGroups,
  saveInventoryNotationKeys,
} from "@/backend/agentic/ghgi/stationary-energy/notation-keys";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

// returns { success: true, result: { [sectorReferenceNumber]: { subSector, subCategory, inventoryValue }[] } }
// used to decide which subsectors + scopes to show on the notation key manager for each sector
export const GET = apiHandler(async (_req, { session, params }) => {
  const inventoryId = z.string().uuid().parse(params.inventory);

  // perform access control, read only
  const inventory = await UserService.findUserInventory(
    inventoryId,
    session,
    [],
    true,
  );

  const inventoryValuesBySector = await listNotationKeyCandidateGroups({
    inventory,
  });
  return NextResponse.json({
    success: true,
    result: inventoryValuesBySector,
  });
});

const saveNotationKeysRequest = z.object({
  notationKeys: z.array(
    z.object({
      subCategoryId: z.string().uuid(),
      unavailableReason: z.enum([
        "no-occurrance",
        "not-estimated",
        "confidential-information",
        "included-elsewhere",
      ]),
      unavailableExplanation: z.string().min(1),
    }),
  ),
});

/**
 * @swagger
 * /api/v1/inventory/{inventory}/notation-keys:
 *   post:
 *     tags:
 *       - inventory
 *       - notation-keys
 *     operationId: postInventoryNotationKeys
 *     summary: Set or update notation keys for subcategories in an inventory.
 *     description: Saves or updates notation keys for the inventory's subcategories, creating or updating inventory values as needed. Existing inventory values will be updated with the notation key data and emissions values will be cleared. Requires a signed‑in user with access to the inventory. Returns { success, result } listing affected values.
 *     parameters:
 *       - in: path
 *         name: inventory
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
 *               notationKeys:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [subCategoryId, unavailableReason, unavailableExplanation]
 *                   properties:
 *                     subCategoryId:
 *                       type: string
 *                       format: uuid
 *                     unavailableReason:
 *                       type: string
 *                       enum: [no-occurrance, not-estimated, confidential-information, included-elsewhere]
 *                     unavailableExplanation:
 *                       type: string
 *     responses:
 *       200:
 *         description: Save result.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 result:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       inventoryValueId:
 *                         type: string
 *                         format: uuid
 *                       subCategoryId:
 *                         type: string
 *                         format: uuid
 *                       notationKey:
 *                         type: string
 *                       value:
 *                         type: number
 *                         nullable: true
 */
export const POST = apiHandler(async (req, { session, params }) => {
  const body = saveNotationKeysRequest.parse(await req.json());
  const inventoryId = z.string().uuid().parse(params.inventory);

  // perform access control
  await UserService.findUserInventory(inventoryId, session);

  const result = await saveInventoryNotationKeys({
    inventoryId,
    notationKeys: body.notationKeys,
    userId: session?.user.id,
  });

  return NextResponse.json({
    success: true,
    result,
  });
});
