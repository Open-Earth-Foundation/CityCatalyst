import "@/util/big_int_json";
import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
import type { InventoryAttributes } from "@/models/init-models";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { ModuleDashboardService } from "@/backend/ModuleDashboardService";
import PopulationService from "@/backend/PopulationService";
import { logger } from "@/services/logger";
import type {
  CityDashboardResponse,
  GHGInventorySummary,
  HIAPSummary,
  CCRASummary,
} from "@/util/types";

export type PublicDashboardShell =
  | { status: "not-found" }
  | {
      status: "ok";
      city: CityDashboardResponse["city"];
      inventories: InventoryAttributes[];
      population: CityDashboardResponse["population"];
      latestInventory: InventoryAttributes | null;
    };

async function ensureDbInitialized() {
  if (!db.initialized) {
    await db.initialize();
  }
}

// React Flight (the Server->Client prop boundary) doesn't call an object's
// own toJSON() the way JSON.stringify does, and has no bigint support -
// round-tripping through JSON.stringify/parse here reuses the same
// Sequelize-instance + bigint handling already proven safe for the HTTP
// API response, so widget/shell data is plain and Flight-serializable
// before it's ever handed to a client component.
function toPlainJSON<T>(value: T): T {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Server-side data loading for the public city dashboard, shared between
 * the public dashboard Server Component pages and the public dashboard API
 * route so neither has to duplicate the Sequelize/permission logic.
 */
export class PublicDashboardService {
  static async getDashboardShell(
    cityId: string,
    year?: number,
  ): Promise<PublicDashboardShell> {
    await ensureDbInitialized();

    const publicInventoriesCount = await db.models.Inventory.count({
      where: { cityId, isPublic: true },
    });

    if (publicInventoriesCount === 0) {
      return { status: "not-found" };
    }

    const city = await db.models.City.findByPk(cityId, {
      include: [
        {
          model: db.models.Project,
          as: "project",
          attributes: ["projectId", "name", "organizationId"],
          include: [
            {
              model: db.models.Organization,
              as: "organization",
              attributes: ["organizationId", "name", "logoUrl", "active"],
              include: [
                {
                  model: db.models.Theme,
                  as: "theme",
                  attributes: ["themeKey"],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!city) {
      return { status: "not-found" };
    }

    const [publicInventories, populationData] = await Promise.all([
      db.models.Inventory.findAll({
        where: { cityId, isPublic: true },
        order: [["year", "DESC"]],
      }),
      PopulationService.getMostRecentPopulationDataForCity(cityId),
    ]);

    const inventories = publicInventories.map((inv) => inv.toJSON());

    const latestInventory = year
      ? (inventories.find((inv) => inv.year === year) ?? null)
      : (inventories[0] ?? null);

    if (year && !latestInventory) {
      return { status: "not-found" };
    }

    const population =
      populationData &&
      populationData.year !== null &&
      populationData.year !== undefined &&
      populationData.population !== null &&
      populationData.population !== undefined
        ? {
            cityId,
            year: populationData.year,
            population: populationData.population,
          }
        : null;

    return {
      status: "ok",
      city: toPlainJSON(city) as CityDashboardResponse["city"],
      inventories: toPlainJSON(inventories),
      population,
      latestInventory: toPlainJSON(latestInventory),
    };
  }

  /**
   * Kicks off the 3 widget data fetches in parallel (none wait on another)
   * and returns their promises for the caller to await together.
   */
  static getStreamableWidgetData(
    cityId: string,
    latestInventory: InventoryAttributes | null,
    lng: string,
  ): {
    ghgi: Promise<GHGInventorySummary | null>;
    hiap: Promise<HIAPSummary | null>;
    ccra: Promise<CCRASummary | null>;
  } {
    if (!latestInventory) {
      return {
        ghgi: Promise.resolve(null),
        hiap: Promise.resolve(null),
        ccra: Promise.resolve(null),
      };
    }

    const inventoryId = latestInventory.inventoryId;

    // Shared access check (handles public inventories automatically) - each
    // widget promise branches off this once it resolves, so the 3 widgets
    // still resolve independently of each other after that.
    const accessibleInventory = ensureDbInitialized()
      .then(() =>
        PermissionService.canAccessInventory(null, inventoryId, {
          includeResource: true,
        }),
      )
      .then(({ resource }) => {
        const inventory = resource as Inventory;
        return inventory && inventory.cityId === cityId ? inventory : null;
      })
      .catch((err) => {
        logger.error(
          { error: err, cityId, inventoryId },
          "Error checking inventory access for public dashboard",
        );
        return null;
      });

    const ghgi: Promise<GHGInventorySummary | null> = accessibleInventory.then(
      (inventory) =>
        !inventory
          ? null
          : ModuleDashboardService.getGHGIDashboardData(cityId, inventory)
              .then(
                (data) => toPlainJSON(data) as unknown as GHGInventorySummary,
              )
              .catch((err) => {
                logger.error({ error: err }, "Error fetching GHGI dashboard");
                return null;
              }),
    );

    const hiap: Promise<HIAPSummary | null> = accessibleInventory.then(
      (inventory) =>
        !inventory
          ? null
          : ModuleDashboardService.getHIAPDashboardData(cityId, inventory, lng)
              .then((data) => toPlainJSON(data) as unknown as HIAPSummary)
              .catch((err) => {
                logger.error({ error: err }, "Error fetching HIAP dashboard");
                return null;
              }),
    );

    const ccra: Promise<CCRASummary | null> = accessibleInventory.then(
      (inventory) =>
        !inventory
          ? null
          : ModuleDashboardService.getCCRADashboardData(cityId, inventory)
              .then((data) => toPlainJSON(data) as CCRASummary)
              .catch((err) => {
                logger.error({ error: err }, "Error fetching CCRA dashboard");
                return null;
              }),
    );

    return { ghgi, hiap, ccra };
  }
}
