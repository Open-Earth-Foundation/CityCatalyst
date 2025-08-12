import { PermissionService } from "@/backend/permissions/PermissionService";
import type { AppSession } from "@/lib/auth";
import { db } from "@/models";
import type { CityAttributes } from "@/models/City";
import type { DataSourceI18nAttributes as DataSourceAttributes } from "@/models/DataSourceI18n";
import { EmissionsFactorAttributes } from "@/models/EmissionsFactor";
import type { GasValueAttributes } from "@/models/GasValue";
import type { InventoryAttributes } from "@/models/Inventory";
import type { InventoryValueAttributes } from "@/models/InventoryValue";
import { findClosestYearToInventory, PopulationEntry } from "@/util/helpers";
import type { InventoryResponse } from "@/util/types";
import createHttpError from "http-errors";
import { Op } from "sequelize";

// Maximum years to look forward/backward for population data
const MAX_POPULATION_YEAR_DIFFERENCE = 10;

export type InventoryDownloadResponse = InventoryAttributes & {
  inventoryValues: (InventoryValueAttributes & {
    dataSource?: DataSourceAttributes;
    gasValues: (GasValueAttributes & {
      emissionsFactor: EmissionsFactorAttributes;
    })[];
  })[];
  city: CityAttributes;
};

export default class InventoryDownloadService {
  public static async queryInventoryData(
    inventoryId: string,
    session: AppSession | null,
  ): Promise<{
    inventory: InventoryDownloadResponse;
    output: InventoryResponse;
    cityPopulation: { populationYear: number; population: number };
  }> {
    // Check read access permission
    await PermissionService.canAccessInventory(session, inventoryId);

    // Load inventory with all necessary includes
    const inventory = await db.models.Inventory.findByPk(inventoryId, {
      include: [
        { model: db.models.City, as: "city" },
        {
          model: db.models.InventoryValue,
          as: "inventoryValues",
          include: [
            {
              model: db.models.ActivityValue,
              as: "activityValues",
              include: [
                {
                  model: db.models.GasValue,
                  as: "gasValues",
                  separate: true,
                  include: [
                    {
                      model: db.models.EmissionsFactor,
                      as: "emissionsFactor",
                    },
                  ],
                },
              ],
            },
            {
              model: db.models.DataSource,
              attributes: [
                "datasourceId",
                "sourceType",
                "datasetName",
                "datasourceName",
                "dataQuality",
              ],
              as: "dataSource",
            },
            {
              model: db.models.SubSector,
              as: "subSector",
              attributes: ["subsectorId", "subsectorName"],
            },
          ],
        },
      ],
    });

    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    if (!inventory.year) {
      throw new createHttpError.BadRequest(
        `Inventory ${inventory.inventoryId} is missing a year number`,
      );
    }
    const populationEntries = await db.models.Population.findAll({
      attributes: ["year", "population"],
      where: {
        cityId: inventory.cityId,
        year: {
          [Op.gte]: inventory.year - MAX_POPULATION_YEAR_DIFFERENCE,
          [Op.lte]: inventory.year + MAX_POPULATION_YEAR_DIFFERENCE,
        },
        population: {
          [Op.ne]: null,
        },
      },
      order: [["year", "DESC"]],
    });

    const population = findClosestYearToInventory(
      populationEntries as PopulationEntry[],
      inventory.year,
      MAX_POPULATION_YEAR_DIFFERENCE,
    );
    if (!population) {
      throw new createHttpError.NotFound(
        `Population data not found for city ${inventory.cityId} for year ${inventory.year}`,
      );
    }

    if (!inventory.city) {
      throw new createHttpError.NotFound(
        `City not found for inventory ${inventory.inventoryId}`,
      );
    }

    const output: InventoryResponse = inventory.toJSON();
    return {
      output,
      inventory,
      cityPopulation: {
        populationYear: population.year,
        population: population.population || 0,
      },
    };
  }
}
