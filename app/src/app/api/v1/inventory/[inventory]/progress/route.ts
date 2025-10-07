/**
 * @swagger
 * /api/v0/inventory/{inventory}/progress:
 *   get:
 *     tags:
 *       - Inventory Progress
 *     summary: Get data entry progress for an inventory
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Progress data returned.
 *       404:
 *         description: Inventory not found.
 */
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

import InventoryProgressService from "@/backend/InventoryProgressService";
import createHttpError from "http-errors";

export const GET = apiHandler(async (_req, { session, params }) => {
  if (!session?.user.id) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  let inventoryId = params.inventory;
  if (inventoryId === "default") {
    const defaultInventoryId = await UserService.updateDefaults(
      session.user.id,
    );
    if (defaultInventoryId) {
      inventoryId = defaultInventoryId;
    }
  }
  if (!inventoryId) {
    throw new createHttpError.NotFound("Inventory not found");
  }
  const inventory = await UserService.findUserInventory(
    inventoryId,
    session,
    [
      {
        model: db.models.InventoryValue,
        as: "inventoryValues",
        include: [
          {
            model: db.models.DataSource,
            attributes: ["datasourceId", "sourceType"],
            as: "dataSource",
          },
        ],
      },
    ],
    true,
  );

  const progressData =
    await InventoryProgressService.getInventoryProgress(inventory);

  return NextResponse.json({
    data: progressData,
  });
});
