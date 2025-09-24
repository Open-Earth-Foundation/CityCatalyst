/**
 * @swagger
 * /api/v0/inventory/{inventory}/notation-keys:
 *   get:
 *     tags:
 *       - Inventory Notation Keys
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
 *                 success: { type: boolean }
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
 *   post:
 *     tags:
 *       - Inventory Notation Keys
 *     summary: Set notation keys for subcategories in an inventory.
 *     description: Saves notation keys for the inventory’s subcategories, creating inventory values where necessary. Requires a signed‑in user with access to the inventory. Returns { success, result } listing affected values.
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
 *                 success: { type: boolean }
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
import InventoryProgressService from "@/backend/InventoryProgressService";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import type { InventoryValue } from "@/models/InventoryValue";
import { apiHandler } from "@/util/api";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryTypeEnum } from "@/util/constants";
import createHttpError from "http-errors";

const validSectorRefNos = {
  [InventoryTypeEnum.GPC_BASIC]: ["I", "II", "III"],
  [InventoryTypeEnum.GPC_BASIC_PLUS]: ["I", "II", "III", "IV", "V"],
};

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

  const existingInventoryValues = await db.models.InventoryValue.findAll({
    where: {
      inventoryId: inventory.inventoryId,
    },
  });
  const inventoryValuesMap = new Map(
    existingInventoryValues.map((value) => [value.subCategoryId, value]),
  );

  const inventoryStructure =
    await InventoryProgressService.getSortedInventoryStructure();
  const applicableSectors = inventoryStructure.filter((sector) => {
    if (!sector.referenceNumber) {
      return false;
    }

    const inventoryType =
      inventory.inventoryType ?? InventoryTypeEnum.GPC_BASIC;
    return validSectorRefNos[inventoryType].includes(sector.referenceNumber);
  });

  const inventoryValuesBySector = Object.fromEntries(
    applicableSectors.map((sector) => {
      const inventoryValues = sector.subSectors.flatMap((subSector) => {
        return subSector.subCategories
          .map((subCategory) => {
            const inventoryValue = inventoryValuesMap.get(
              subCategory.subcategoryId,
            );
            return {
              inventoryValue,
              subSector,
              subCategory,
            };
          })
          .filter(({ inventoryValue }) => {
            const isFilled = inventoryValue != null;
            const hasNotationKey =
              inventoryValue && inventoryValue.unavailableReason != null;
            return !isFilled || hasNotationKey;
          });
      });

      return [sector.referenceNumber, inventoryValues];
    }),
  );
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

export const POST = apiHandler(async (req, { session, params }) => {
  const body = saveNotationKeysRequest.parse(await req.json());
  const inventoryId = z.string().uuid().parse(params.inventory);

  // perform access control
  await UserService.findUserInventory(inventoryId, session);

  const result = await db.sequelize!.transaction(async (transaction) => {
    const result: InventoryValue[] = [];
    for (const notationKey of body.notationKeys) {
      const subCategory = await db.models.SubCategory.findOne({
        where: { subcategoryId: notationKey.subCategoryId },
        include: [
          {
            model: db.models.SubSector,
            as: "subsector",
            attributes: ["sectorId"],
          },
        ],
      });
      const gpcReferenceNumber = subCategory?.referenceNumber;
      // Lookup by inventoryId + gpcReferenceNumber (matches unique constraint)
      const existingInventoryValue = await db.models.InventoryValue.findOne({
        where: {
          inventoryId,
          gpcReferenceNumber,
        },
        transaction,
        lock: true,
      });
      if (existingInventoryValue) {
        throw new createHttpError.BadRequest(
          "Existing notation key found for this subcategory, remove it before setting notation key",
        );
        /* TODO decide if this behavior is desirable - UI warning/ confirmation would need to be implemented
        // reset emissions values of inventory value as notation key was used for it
        const inventoryValue = await existingInventoryValue.update(
          {
            unavailableReason: notationKey.unavailableReason,
            unavailableExplanation: notationKey.unavailableExplanation,
            subSectorId: subCategory?.subsectorId,
            sectorId: subCategory?.subsector?.sectorId,
            co2eq: undefined,
            co2eqYears: undefined,
          },
          { transaction },
        );
        result.push(inventoryValue);

        // destroy existing activity values in this subsector, making sure no data is left behind
        await db.models.ActivityValue.destroy({
          where: { inventoryValueId: existingInventoryValue.id },
          transaction,
        });
        */
      } else {
        const inventoryValue = await db.models.InventoryValue.create(
          {
            ...notationKey,
            id: randomUUID(),
            subSectorId: subCategory?.subsectorId,
            sectorId: subCategory?.subsector?.sectorId,
            inventoryId,
            gpcReferenceNumber,
          },
          { transaction },
        );
        result.push(inventoryValue);
      }
    }

    return result;
  });

  return NextResponse.json({
    success: true,
    result,
  });
});
