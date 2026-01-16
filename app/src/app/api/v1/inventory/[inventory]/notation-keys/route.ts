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

  // Map by subCategoryId for sectors I-III (which have subcategories)
  const inventoryValuesBySubCategoryId = new Map(
    existingInventoryValues
      .filter((value) => value.subCategoryId != null)
      .map((value) => [value.subCategoryId, value]),
  );

  // Map by gpcReferenceNumber for sectors IV-V (which don't have subcategories, only subsectors)
  const inventoryValuesByGpcRef = new Map(
    existingInventoryValues
      .filter((value) => value.gpcReferenceNumber != null)
      .map((value) => [value.gpcReferenceNumber, value]),
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
      const isSectorIVOrV =
        sector.referenceNumber === "IV" || sector.referenceNumber === "V";

      if (isSectorIVOrV) {
        // For sectors IV and V: return subsectors (they don't have subcategories)
        // Create a subcategory-like structure from subsector data for compatibility
        const inventoryValues = sector.subSectors
          .filter((subSector) => subSector.referenceNumber != null) // Filter out subsectors without referenceNumber
          .map((subSector) => {
            const inventoryValue = inventoryValuesByGpcRef.get(
              subSector.referenceNumber!,
            );
            // Create a subcategory-like object from subsector for IV and V
            // since the frontend expects subcategory structure
            const subCategoryLike = {
              subcategoryId: subSector.subsectorId, // Use subsectorId as identifier
              subcategoryName: subSector.subsectorName,
              referenceNumber: subSector.referenceNumber!,
              subsectorId: subSector.subsectorId,
              scopeId: subSector.scopeId,
              reportinglevelId: null,
            };
            // Ensure subSector includes sector info for frontend compatibility
            // The frontend's groupScopesBySector expects sector info on subSector
            const subSectorWithSector = {
              ...subSector,
              sectorId: sector.sectorId,
              sectorName: sector.sectorName,
              referenceNumber: sector.referenceNumber,
            };
            return {
              inventoryValue,
              subSector: subSectorWithSector,
              subCategory: subCategoryLike,
            };
          })
          .filter(({ inventoryValue }) => {
            const isFilled = inventoryValue != null;
            const hasNotationKey =
              inventoryValue && inventoryValue.unavailableReason != null;
            return !isFilled || hasNotationKey;
          });
        return [sector.referenceNumber, inventoryValues];
      } else {
        // For sectors I-III: return subcategories (current behavior)
        const inventoryValues = sector.subSectors.flatMap((subSector) => {
          return subSector.subCategories
            .map((subCategory) => {
              const inventoryValue = inventoryValuesBySubCategoryId.get(
                subCategory.subcategoryId,
              );
              // Ensure subSector includes sector info for frontend compatibility
              // The frontend's groupScopesBySector expects sector info on subSector
              const subSectorWithSector = {
                ...subSector,
                sectorId: sector.sectorId,
                sectorName: sector.sectorName,
                referenceNumber: sector.referenceNumber,
              };
              return {
                inventoryValue,
                subSector: subSectorWithSector,
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
      }
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

  const result = await db.sequelize!.transaction(async (transaction) => {
    const result: InventoryValue[] = [];
    for (const notationKey of body.notationKeys) {
      // Try to find SubCategory first (for sectors I-III)
      let subCategory = await db.models.SubCategory.findOne({
        where: { subcategoryId: notationKey.subCategoryId },
        attributes: [
          "subcategoryId",
          "subcategoryName",
          "referenceNumber",
          "subsectorId",
        ],
        include: [
          {
            model: db.models.SubSector,
            as: "subsector",
            attributes: ["sectorId"],
          },
        ],
      });

      let subSector;
      let gpcReferenceNumber: string | undefined;
      let sectorId: string | undefined;
      let subSectorId: string | undefined;

      if (subCategory) {
        // For sectors I-III: use subcategory reference number
        gpcReferenceNumber = subCategory.referenceNumber;
        sectorId = subCategory.subsector?.sectorId;
        subSectorId = subCategory.subsectorId;
      } else {
        // For sectors IV-V: the subCategoryId is actually a subsectorId
        subSector = await db.models.SubSector.findOne({
          where: { subsectorId: notationKey.subCategoryId },
          attributes: [
            "subsectorId",
            "subsectorName",
            "sectorId",
            "referenceNumber",
          ],
        });

        if (!subSector) {
          throw new createHttpError.NotFound(
            `SubCategory or SubSector not found: ${notationKey.subCategoryId}`,
          );
        }

        // For sectors IV-V: use subsector reference number
        gpcReferenceNumber = subSector.referenceNumber;
        sectorId = subSector.sectorId;
        subSectorId = subSector.subsectorId;
      }

      if (!gpcReferenceNumber) {
        throw new createHttpError.BadRequest(
          `Missing reference number for ${notationKey.subCategoryId}`,
        );
      }

      // Lookup by inventoryId + gpcReferenceNumber (matches unique constraint)
      const existingInventoryValue = await db.models.InventoryValue.findOne({
        where: {
          inventoryId,
          gpcReferenceNumber,
        },
        transaction,
        lock: true,
      });

      let inventoryValue: InventoryValue;
      if (existingInventoryValue) {
        // Check if existing inventory value has emissions data
        // If it has emissions data, we should not update with notation key
        const hasEmissionsData =
          existingInventoryValue.co2eq != null ||
          existingInventoryValue.co2eqYears != null;

        if (hasEmissionsData) {
          // Get a user-friendly name for the error message
          const itemName = subCategory
            ? subCategory.subcategoryName
            : subSector?.subsectorName || gpcReferenceNumber;

          const error = new createHttpError.BadRequest(
            `Cannot set notation key for "${itemName}" because it already has emissions data. Please remove the emissions data first.`,
          );
          // Include translation key and itemName for frontend
          (error as any).data = {
            translationKey: "error-cannot-set-notation-key-emissions-data",
            itemName,
          };
          throw error;
        }

        // Update existing inventory value with notation key
        // Reset emissions values as notation key takes precedence
        inventoryValue = await existingInventoryValue.update(
          {
            unavailableReason: notationKey.unavailableReason,
            unavailableExplanation: notationKey.unavailableExplanation,
            subSectorId,
            sectorId,
            co2eq: undefined,
            co2eqYears: undefined,
            datasourceId: null, // Clear datasource when setting notation key
            // For sectors IV-V, subCategoryId should be undefined (not null)
            subCategoryId: subCategory ? notationKey.subCategoryId : undefined,
          },
          { transaction },
        );

        // Destroy existing activity values, making sure no data is left behind
        await db.models.ActivityValue.destroy({
          where: { inventoryValueId: existingInventoryValue.id },
          transaction,
        });

        result.push(inventoryValue);
      } else {
        // Create new inventory value with notation key
        inventoryValue = await db.models.InventoryValue.create(
          {
            ...notationKey,
            id: randomUUID(),
            subSectorId,
            sectorId,
            inventoryId,
            gpcReferenceNumber,
            // For sectors IV-V, subCategoryId should be undefined (not null)
            subCategoryId: subCategory ? notationKey.subCategoryId : undefined,
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
