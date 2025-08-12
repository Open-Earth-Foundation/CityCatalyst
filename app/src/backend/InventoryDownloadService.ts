import { PermissionService } from "@/backend/permissions/PermissionService";
import type { AppSession } from "@/lib/auth";
import { db } from "@/models";
import { findClosestYearToInventory, PopulationEntry } from "@/util/helpers";
import type {
  InventoryDownloadResponse,
  InventoryResponse,
} from "@/util/types";
import createHttpError from "http-errors";
import { Op } from "sequelize";

// Maximum years to look forward/backward for population data
const MAX_POPULATION_YEAR_DIFFERENCE = 10;

export default class InventoryDownloadService {
  public static async queryInventoryData(
    inventoryId: string,
    session: AppSession | null,
  ): Promise<{
    inventory: InventoryDownloadResponse;
    output: InventoryResponse;
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

    return {
      output: inventory.toJSON() as InventoryResponse,
      inventory: {
        ...inventory.toJSON(),
        city: {
          ...inventory.city.toJSON(),
          populationYear: population.year,
          population: population.population || 0,
        },
      },
    };
  }
}
