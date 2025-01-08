import { db } from "@/models";
import { Op } from "sequelize";
import { findClosestYearToInventory, PopulationEntry } from "@/util/helpers";
import { PopulationAttributes } from "@/models/Population";

const maxPopulationYearDifference = 5;

export default class PopulationService {
  public static async getPopulationDataForCityYear(
    cityId: string,
    year: number,
  ): Promise<{
    cityId: string;
    population?: number | null;
    year?: number | null;
    countryPopulation?: number | null;
    countryPopulationYear: number | null;
    regionPopulation?: number | null;
    regionPopulationYear: number | null;
  }> {
    const populations = await db.models.Population.findAll({
      where: {
        cityId: cityId,
        year: {
          [Op.between]: [
            year! - maxPopulationYearDifference,
            year! + maxPopulationYearDifference,
          ],
        },
      },
      order: [["year", "DESC"]], // favor more recent population entries
    });
    const cityPopulations = populations.filter((pop) => !!pop.population);
    const cityPopulation = findClosestYearToInventory(
      cityPopulations as PopulationEntry[],
      year!,
    );
    const countryPopulations = populations.filter(
      (pop) => !!pop.countryPopulation,
    );
    const countryPopulation = findClosestYearToInventory(
      countryPopulations as PopulationEntry[],
      year!,
    ) as PopulationAttributes;
    const regionPopulations = populations.filter(
      (pop) => !!pop.regionPopulation,
    );
    const regionPopulation = findClosestYearToInventory(
      regionPopulations as PopulationEntry[],
      year!,
    ) as PopulationAttributes;

    return {
      cityId: cityId,
      population: cityPopulation?.population,
      year: cityPopulation?.year,
      countryPopulation: countryPopulation?.population,
      countryPopulationYear: countryPopulation?.year,
      regionPopulation: regionPopulation?.population,
      regionPopulationYear: regionPopulation?.year,
    };
  }
}
