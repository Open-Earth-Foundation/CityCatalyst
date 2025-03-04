import { AppSession } from "@/lib/auth";
import { db } from "@/models";
import { logger } from "@/services/logger";
import { Roles } from "@/util/types";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import DataSourceService from "./DataSourceService";
import { City } from "@/models/City";
import { groupBy } from "@/util/helpers";
import OpenClimateService from "./OpenClimateService";

export interface BulkInventoryProps {
  cityLocodes: string[]; // List of city locodes
  emails: string[]; // Comma separated list of emails to invite to the all of the created inventories
  years: number[]; // List of years to create inventories for
  scope: "gpc_basic" | "gpc_basic_plus"; // Scope selection (gpc_basic or gpc_basic_plus)
  gwp: "AR5" | "AR6"; // GWP selection (AR5 or AR6)
}

export interface CreateBulkInventoriesResponse {
  errors: { locode: string; error: any }[];
  results: { locode: string; result: any }[];
}

const DEFAULT_PRIORITY = 0; // 10 is the highest priority

export default class AdminService {
  public static async createBulkInventories(
    props: BulkInventoryProps,
    session: AppSession | null,
  ): Promise<CreateBulkInventoriesResponse> {
    // Ensure user has admin role
    const isAdmin = session?.user?.role === Roles.Admin;
    if (!isAdmin) {
      throw new createHttpError.Unauthorized("Not signed in as an admin");
    }

    const errors: { locode: string; error: any }[] = [];
    const results: { locode: string; result: any }[] = [];

    // Bulk create inventories
    logger.info(
      "Creating bulk inventories for cities",
      props.cityLocodes,
      "and years",
      props.years,
    );
    for (const cityLocode of props.cityLocodes) {
      const cityName = "Test"; // TODO query from OpenClimate
      const city = await db.models.City.create({
        cityId: randomUUID(),
        locode: cityLocode,
        name: cityName,
      });
      logger.info("Creating inventories for city " + cityLocode);
      const inventories = props.years.map((year) => ({
        inventoryId: randomUUID(),
        cityLocode,
        year,
        scope: props.scope,
        gwp: props.gwp,
        cityId: city.cityId,
      }));
      try {
        const createdInventories =
          await db.models.Inventory.bulkCreate(inventories);
        results.push({
          locode: cityLocode,
          result: createdInventories.map((inventory) => inventory.inventoryId),
        });
      } catch (err) {
        errors.push({ locode: cityLocode, error: err });
      }

      for (const inventory of inventories) {
        // query population data from OpenClimate and save in Population table
        const populationData = await OpenClimateService.getPopulationData(
          cityLocode,
          inventory.year,
        );
        if (populationData.error) {
          errors.push({ locode: cityLocode, error: populationData.error });
        }
        if (
          !populationData.cityPopulation ||
          !populationData.cityPopulationYear ||
          !populationData.countryPopulation ||
          !populationData.countryPopulationYear ||
          !populationData.regionPopulation ||
          !populationData.regionPopulationYear
        ) {
          errors.push({
            locode: cityLocode,
            error: `Population data incomplete for city ${cityLocode} and inventory year ${inventory.year}`,
          });
          continue;
        }

        // they might be for the same year, but that is not guaranteed (because of data availability)
        await db.models.Population.create({
          population: populationData.cityPopulation,
          cityId: city.cityId,
          year: populationData.cityPopulationYear,
        });
        await db.models.Population.upsert({
          countryPopulation: populationData.countryPopulation,
          cityId: city.cityId,
          year: populationData.countryPopulationYear,
        });
        await db.models.Population.upsert({
          regionPopulation: populationData.regionPopulation,
          cityId: city.cityId,
          year: populationData.regionPopulationYear,
        });

        // Connect all data sources, rank them by priority, check if they connect
        const sourceErrors = await this.connectAllDataSources(
          inventory.inventoryId,
          cityLocode,
        );
        errors.push(...sourceErrors);

        // TODO invite users to the inventory
      }
    }

    return { errors, results };
  }

  private static async connectAllDataSources(
    inventoryId: string,
    cityLocode: string,
  ): Promise<{ locode: string; error: string }[]> {
    const errors: any[] = [];
    const inventory = await db.models.Inventory.findOne({
      where: { inventoryId },
      include: [{ model: City, as: "city" }],
    });
    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }
    // Find all data sources for the inventory
    const sources = await DataSourceService.findAllSources(inventoryId);
    // Filter by locally available criteria (e.g. geographical location, year of inventory etc.)
    const { applicableSources } = DataSourceService.filterSources(
      inventory,
      sources,
    );

    // group sources by subsector so we can prioritize for each choice individually
    const sourcesBySubsector = groupBy(
      applicableSources,
      (source) => source.subsectorId ?? source.subcategoryId ?? "unknown",
    );
    delete sourcesBySubsector["unknown"];

    const populationScaleFactors =
      await DataSourceService.findPopulationScaleFactors(
        inventory,
        applicableSources,
      );

    await Promise.all(
      Object.entries(sourcesBySubsector).map(async ([subSector, sources]) => {
        // Sort each group by priority field
        const prioritizedSources = sources.sort(
          (a, b) =>
            (b.priority ?? DEFAULT_PRIORITY) - (a.priority ?? DEFAULT_PRIORITY),
        );

        // Try one after another until one connects successfully
        let isSuccessful = false;
        for (const source of prioritizedSources) {
          const data = await DataSourceService.retrieveGlobalAPISource(
            source,
            inventory,
          );
          if (data instanceof String || typeof data === "string") {
            errors.push({
              locode: cityLocode,
              error: `Failed to fetch source - ${source.datasourceId}: ${data}`,
            });
          } else {
            // save data source to DB
            // download source data and apply in database
            const result = await DataSourceService.applySource(
              source,
              inventory,
              populationScaleFactors,
            );
            if (result.success) {
              isSuccessful = true;
              break;
            } else {
              logger.error(
                `Failed to apply source ${source.datasourceId}: ${result.issue}`,
              );
            }
          }

          if (!isSuccessful) {
            const message = `Wasn't able to find a data source for subsector ${subSector}`;
            logger.error(cityLocode, message);
            errors.push({
              locode: cityLocode,
              error: message,
            });
          }
        }
      }),
    );

    return errors;
  }
}
