import { Op } from "sequelize";
import UserService from "@/backend/UserService";
import { AppSession } from "@/lib/auth";
import { db } from "@/models";
import createHttpError from "http-errors";
import { findClosestYearToInventory, PopulationEntry } from "@/util/helpers";
import { InventoryResponse } from "@/util/types";

export default class InventoryDownloadService {
  public static async queryInventoryData(
    inventoryId: string,
    session: AppSession | null,
  ) {
    const inventory = await UserService.findUserInventory(
      inventoryId,
      session,
      [
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
    );

    if (!inventory.year) {
      throw new createHttpError.BadRequest(
        `Inventory ${inventory.inventoryId} is missing a year number`,
      );
    }
    const MAX_YEARS_DIFFERENCE = 10;
    const populationEntries = await db.models.Population.findAll({
      attributes: ["year", "population"],
      where: {
        cityId: inventory.cityId,
        year: {
          [Op.gte]: inventory.year - MAX_YEARS_DIFFERENCE,
          [Op.lte]: inventory.year + MAX_YEARS_DIFFERENCE,
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
      MAX_YEARS_DIFFERENCE,
    );
    if (!population) {
      throw new createHttpError.NotFound(
        `Population data not found for city ${inventory.cityId} for year ${inventory.year}`,
      );
    }

    const output: InventoryResponse = inventory.toJSON();
    output.city.populationYear = population.year;
    output.city.population = population.population || 0;

    return { output, inventory };
  }
}
