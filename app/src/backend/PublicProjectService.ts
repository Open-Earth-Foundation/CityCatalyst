import "@/util/big_int_json";
import { db } from "@/models";
import { QueryTypes } from "sequelize";
import CityBoundaryService from "@/backend/CityBoundaryService";
import type { Inventory } from "@/models/Inventory";
import PopulationService from "@/backend/PopulationService";
import { logger } from "@/services/logger";
import { sqlOmitFromTotal } from "@/util/GHGI/reported-totals";
import type { ProjectBoundary } from "@/util/types";

export type PublicProjectCity = {
  cityId: string;
  name?: string;
  locode?: string;
  country?: string;
  region?: string;
  area?: number;
};

export type PublicProjectShell =
  | { status: "not-found" }
  | {
      status: "ok";
      project: { projectId: string; name: string };
      organization: {
        organizationId: string;
        name?: string;
        logoUrl?: string | null;
        theme: { themeKey: string } | null;
      } | null;
      cities: PublicProjectCity[];
    };

export type PublicProjectSummary = {
  totalCities: number;
  totalEmissions: number;
  totalPopulation: number;
  totalDataSources: number;
};

export type PublicProjectBoundaries = {
  result: ProjectBoundary[];
  errors: { locode?: string; error: string }[];
};

async function ensureDbInitialized() {
  if (!db.initialized) {
    await db.initialize();
  }
}

// React Flight (the Server->Client prop boundary) doesn't call an object's
// own toJSON() the way JSON.stringify does, and has no bigint support -
// round-tripping through JSON.stringify/parse flattens any Sequelize
// instances/bigints before they're ever handed to a client component.
function toPlainJSON<T>(value: T): T {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Server-side data loading for the public project landing pages, shared
 * between the Server Component pages and the project HTTP API routes so
 * neither has to duplicate the Sequelize logic.
 */
export class PublicProjectService {
  static async getProjectShell(projectId: string): Promise<PublicProjectShell> {
    await ensureDbInitialized();

    const project = await db.models.Project.findByPk(projectId, {
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
    });

    if (!project) {
      return { status: "not-found" };
    }

    // Unlike the public cities HTTP route, a project with branding but no
    // public cities yet is still a valid "ok" shell - this feeds a page
    // render, not a strict REST contract.
    const cities = await db.models.City.findAll({
      where: { projectId },
      include: [
        {
          model: db.models.Inventory,
          as: "inventories",
          where: { isPublic: true },
          required: true,
          attributes: [],
        },
      ],
      attributes: ["cityId", "name", "locode", "country", "region", "area"],
    });

    return {
      status: "ok",
      project: toPlainJSON({
        projectId: project.projectId,
        name: project.name,
      }),
      organization: toPlainJSON(project.organization ?? null),
      cities: toPlainJSON(cities.map((city) => city.toJSON())),
    };
  }

  static async getSummary(
    projectId: string,
  ): Promise<PublicProjectSummary | null> {
    await ensureDbInitialized();

    const project = await db.models.Project.findByPk(projectId, {
      include: [
        {
          model: db.models.City,
          as: "cities",
          attributes: ["locode", "cityId"],
          include: [
            {
              model: db.models.Inventory,
              as: "inventories",
              include: [
                {
                  model: db.models.InventoryValue,
                  as: "inventoryValues",
                  include: [{ model: db.models.DataSource, as: "dataSource" }],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!project) {
      return null;
    }

    const inventories = project.cities.flatMap((city) => city.inventories);

    // TODO [ON-2429]: Save total emissions for inventory every time activity data is modified
    const rawQuery = `
      SELECT SUM(co2eq)
      FROM "InventoryValue"
      WHERE inventory_id IN (:inventoryIds)
        AND ${sqlOmitFromTotal()}
    `;

    const inventoryIds = inventories.map((inventory) => inventory.inventoryId);
    const [{ sum: totalEmissions }] = (await db.sequelize!.query(rawQuery, {
      replacements: { inventoryIds },
      type: QueryTypes.SELECT,
      raw: true,
    })) as unknown as { sum: number }[];

    const latestUsedCityPopulations = await Promise.all(
      project.cities.map(async (city) => {
        if (city.inventories.length === 0) {
          return 0;
        }

        const lastInventoryYear = city.inventories.sort(
          (a, b) => (b.year ?? 0) - (a.year ?? 0),
        )[0]?.year;
        if (!lastInventoryYear) {
          return 0;
        }
        const population = await PopulationService.getPopulationDataForCityYear(
          city.cityId,
          lastInventoryYear,
        );
        return Number(population.population) ?? 0;
      }),
    );
    const totalPopulation = latestUsedCityPopulations.reduce(
      (acc, population) => acc + population,
      0,
    );

    const totalDataSources = inventories
      .map((inventory) =>
        inventory.inventoryValues.map(
          (inventoryValue) => inventoryValue.dataSource,
        ),
      )
      .filter((dataSource) => !!dataSource).length;

    return toPlainJSON({
      totalCities: project.cities.length,
      totalEmissions,
      totalPopulation,
      totalDataSources,
    });
  }

  /**
   * Unauthenticated by design, same trust level as the public cities
   * endpoint (city names/locodes/boundary shapes, nothing access
   * controlled) - unlike the admin-gated /projects/{project}/boundaries
   * HTTP route, this never requires a session.
   */
  static async getBoundaries(
    projectId: string,
  ): Promise<PublicProjectBoundaries> {
    await ensureDbInitialized();

    const project = await db.models.Project.findByPk(projectId, {
      include: [
        {
          model: db.models.City,
          as: "cities",
          attributes: ["locode", "cityId", "name"],
          include: [
            {
              model: db.models.Inventory,
              as: "inventories",
              attributes: ["inventoryId", "year"],
            },
          ],
        },
      ],
    });

    if (!project) {
      return { result: [], errors: [] };
    }

    const errors: { locode?: string; error: string }[] = [];
    const cityResults = await Promise.all(
      project.cities
        .filter((city) => !!city.locode)
        .map(async (city) => {
          let boundary;
          try {
            boundary = await CityBoundaryService.getCityBoundary(city.locode!);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "unknown-error";
            logger.error(
              `Failed to fetch boundary for city ${city.name} (${city.locode}, ${city.cityId}): ${message}`,
            );
            errors.push({ locode: city.locode, error: message });
            return null;
          }

          if (!boundary) {
            return null;
          }

          let latestInventory: Inventory | null = null;
          if (city.inventories && city.inventories.length > 0) {
            latestInventory = city.inventories.reduce((latest, inventory) => {
              if (!latest) return inventory;
              return (inventory.year ?? 0) > (latest.year ?? 0)
                ? inventory
                : latest;
            });
          }

          return {
            ...boundary,
            city: {
              id: city.cityId,
              name: city.name,
              locode: city.locode,
              latestInventoryId: latestInventory?.inventoryId,
            },
          };
        }),
    );
    const result = cityResults.filter(
      (cityResult): cityResult is NonNullable<typeof cityResult> =>
        cityResult != null,
    );

    return toPlainJSON({
      result,
      errors,
    }) as unknown as PublicProjectBoundaries;
  }
}
