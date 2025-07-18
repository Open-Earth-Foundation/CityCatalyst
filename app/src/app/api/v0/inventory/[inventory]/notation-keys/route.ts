import InventoryProgressService from "@/backend/InventoryProgressService";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import type { InventoryValue } from "@/models/InventoryValue";
import { apiHandler } from "@/util/api";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryTypeEnum } from "@/util/constants";

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
      unavailableReason: z
        .enum([
          "no-occurrance",
          "not-estimated",
          "confidential-information",
          "included-elsewhere",
        ])
        .optional(),
      unavailableExplanation: z.string().min(1).optional(),
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
