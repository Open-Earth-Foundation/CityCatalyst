import UserService from "@/backend/UserService";
import { db } from "@/models";
import type { InventoryValue } from "@/models/InventoryValue";
import { apiHandler } from "@/util/api";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

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
