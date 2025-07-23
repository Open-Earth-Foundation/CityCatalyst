import { db } from "@/models";

export const InventoryService = {
  async getLocode(inventoryId: string): Promise<string> {
    const inventory = await db.models.Inventory.findByPk(inventoryId, {
      include: [{ model: db.models.City, as: "city" }],
    });
    if (!inventory || !inventory.city || !inventory.city.locode) {
      throw new Error("Inventory or city or locode not found");
    }
    return inventory.city.locode;
  },
}; 