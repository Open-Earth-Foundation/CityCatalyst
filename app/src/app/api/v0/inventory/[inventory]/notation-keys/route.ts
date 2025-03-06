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
  const result: InventoryValue[] = [];

  for (const notationKey of body.notationKeys) {
    const existingInventoryValue = await db.models.InventoryValue.findOne({
      where: {
        inventoryId,
        subSectorId: notationKey.subSectorId,
      },
    });

    if (existingInventoryValue) {
      const inventoryValue = await existingInventoryValue.update({
        unavailableReason: notationKey.unavailableReason,
        unavailableExplanation: notationKey.unavailableExplanation,
        co2eq: undefined,
        co2eqYears: undefined,
      });
      result.push(inventoryValue);
    } else {
      const inventoryValue = await db.models.InventoryValue.create({
        ...notationKey,
        id: randomUUID(),
        inventoryId,
      });
      result.push(inventoryValue);
    }
  }

  return NextResponse.json({
    success: true,
    result,
  });
});
