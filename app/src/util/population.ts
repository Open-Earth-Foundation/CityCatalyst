import type { Inventory } from "@/models/Inventory";
import type { Population } from "@/models/Population";
import { findClosestYear, PopulationEntry } from "./helpers";
import { Op } from "sequelize";
import { maxPopulationYearDifference } from "./constants";
import { db } from "@/models";

export async function findClosestCityPopulation(
  inventory: Inventory,
): Promise<PopulationEntry | null> {
  const populations = await db.models.Population.findAll({
    where: {
      cityId: inventory.cityId,
      year: {
        [Op.between]: [
          inventory.year! - maxPopulationYearDifference,
          inventory.year! + maxPopulationYearDifference,
        ],
      },
    },
    order: [["year", "DESC"]], // favor more recent population entries
  });
  const cityPopulations = populations.filter(
    (pop: Population) => !!pop.population,
  );
  const cityPopulation = findClosestYear(
    cityPopulations as PopulationEntry[],
    inventory.year!,
  );
  return cityPopulation;
}
