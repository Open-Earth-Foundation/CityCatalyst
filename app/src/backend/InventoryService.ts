import { db } from "@/models";
import { QueryTypes } from "sequelize";
import { PermissionService } from "./permissions/PermissionService";
import { type AppSession } from "@/lib/auth";
import { Inventory } from "@/models/Inventory";

export class InventoryService {
  static async getInventoryIdByCityId(cityId: string): Promise<string> {
    const inventory = await db.models.Inventory.findOne({
      where: { cityId },
      order: [["year", "DESC"]], // get the most recent one
    });
    if (!inventory) {
      throw new Error("Inventory not found");
    }
    return inventory.inventoryId;
  }

  static async getLocode(inventoryId: string): Promise<string> {
    const inventory = await db.models.Inventory.findByPk(inventoryId, {
      include: [{ model: db.models.City, as: "city" }],
    });
    if (!inventory || !inventory.city || !inventory.city.locode) {
      throw new Error("Inventory or city or locode not found");
    }
    return inventory.city.locode;
  }

  static async getInventoryWithTotalEmissions(
    inventoryId: string,
    session: AppSession | null,
  ): Promise<Inventory> {
    // Check read-only access permission
    await PermissionService.canAccessInventory(session, inventoryId);

    // Load inventory with includes
    const inventory = await db.models.Inventory.findByPk(inventoryId, {
      include: [
        {
          model: db.models.City,
          as: "city",
          include: [
            {
              model: db.models.Project,
              as: "project",
              include: [
                {
                  model: db.models.Organization,
                  as: "organization",
                },
              ],
            },
          ],
        },
      ],
    });

    if (!inventory) {
      throw new Error("Inventory not found");
    }

    // TODO [ON-2429]: Save total emissions for inventory every time activity data is modified
    // NULL when no activity data has been recorded yet (no inventory values, or all
    // co2eq are null, e.g. notation-key-only prefill) so the UI can show "No data"
    // instead of a misleading 0kg.
    const rawQuery = `
    SELECT SUM(co2eq) AS sum
    FROM "InventoryValue"
    WHERE inventory_id = :inventoryId
  `;

    const [{ sum }] = (await db.sequelize!.query(rawQuery, {
      replacements: { inventoryId },
      type: QueryTypes.SELECT,
      raw: true,
    })) as unknown as { sum: number | null }[];

    inventory.totalEmissions = sum != null ? Number(sum) : null;
    return inventory;
  }
}
