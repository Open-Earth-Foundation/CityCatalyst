import InventoryProgressService from "@/backend/InventoryProgressService";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import type { InventoryValue } from "@/models/InventoryValue";
import { apiHandler } from "@/util/api";
import { randomUUID } from "node:crypto";
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
  const inventoryValuesBySector = Object.fromEntries(
    inventoryStructure.map((sector) => {
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
      subSectorId: z.string().uuid(),
      unavailableReason: z.enum([
        "no-occurrance",
        "not-estimated",
        "confidential-information",
        "presented-elsewhere",
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
      const existingInventoryValue = await db.models.InventoryValue.findOne({
        where: {
          inventoryId,
          subSectorId: notationKey.subSectorId,
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
            inventoryId,
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
