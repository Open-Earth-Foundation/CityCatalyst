import { db } from "@/models";
import { QueryTypes } from "sequelize";
import { PermissionService } from "./permissions/PermissionService";
import type { AppSession } from "@/lib/auth";
import type { Inventory } from "@/models/Inventory";
import type { ActivityValue } from "@/models/ActivityValue";
import type { InventoryValue } from "@/models/InventoryValue";
import {
  findMethodology,
  MANUAL_INPUT_HIERARCHY,
  type DirectMeasure,
  type Methodology,
} from "@/util/form-schema";

type ResolvedMethodology = Methodology | DirectMeasure;

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

  static resolveMethodology(
    inventoryValue: InventoryValue,
  ): ResolvedMethodology | undefined {
    const gpcRefNo = inventoryValue.gpcReferenceNumber;
    const methodologyId = inventoryValue.inputMethodology;
    if (!gpcRefNo || !methodologyId) return undefined;

    if (methodologyId === "direct-measure") {
      return MANUAL_INPUT_HIERARCHY[gpcRefNo]?.directMeasure;
    }
    return findMethodology(methodologyId, gpcRefNo);
  }

  static getActivityTitleKey(
    activity: ActivityValue,
    methodology?: ResolvedMethodology,
  ): string {
    const fromMetadata = activity.metadata?.activityTitle?.toString();
    if (fromMetadata) return fromMetadata;

    if (methodology && "activities" in methodology) {
      const fromSchema = methodology.activities?.[0]?.["activity-title"];
      if (fromSchema) return fromSchema;
    }

    if (methodology?.activityUnitsField) {
      return `activity-${methodology.activityUnitsField}`;
    }

    return "activity-value";
  }

  static extractActivityFields(
    activity: ActivityValue,
    inventoryValue: InventoryValue,
  ) {
    const methodology = this.resolveMethodology(inventoryValue);
    const data = activity.activityData ?? {};
    const titleKey = this.getActivityTitleKey(activity, methodology);
    const notationKey =
      inventoryValue.unavailableReason &&
      inventoryValue.unavailableReason.length > 0
        ? inventoryValue.unavailableReason
        : undefined;
    let activityUnit = (
      data[`${titleKey}-unit`] ?? data["activity-unit"]
    )?.toString();
    if (activityUnit?.startsWith("units-")) {
      activityUnit = activityUnit.slice("units-".length);
    }

    return {
      activityType:
        methodology?.activityTypeField && data[methodology.activityTypeField]
          ? data[methodology.activityTypeField]
          : undefined,
      totalEmissions: activity.co2eq,
      totalEmissionsUnit: "kg",
      activityValue: data[titleKey] ?? data["activity-value"],
      activityUnit,
      dataSource: activity.dataSource?.datasourceName ?? data["data-source"],
      notationKey,
    };
  }
}
