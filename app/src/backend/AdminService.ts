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
import { Op } from "sequelize";
import { DEFAULT_PROJECT_ID, InventoryTypeEnum } from "@/util/constants";
import { InventoryAttributes } from "@/models/Inventory";
import { GlobalWarmingPotentialTypeEnum } from "@/util/enums";
import CityBoundaryService from "./CityBoundaryService";
import UserService from "./UserService";

export interface BulkInventoryCreateProps {
  cityLocodes: string[]; // List of city locodes
  emails: string[]; // Comma separated list of emails to invite to the all of the created inventories
  years: number[]; // List of years to create inventories for
  scope: "gpc_basic" | "gpc_basic_plus"; // Scope selection (gpc_basic or gpc_basic_plus)
  gwp: "AR5" | "AR6" | "ar5" | "ar6"; // global warming potential standard selection
  projectId: string; // project ID to associate with the inventories
}

export interface BulkInventoryUpdateProps {
  userEmail: string; // Email of the user whose inventories are to be connected
  cityLocodes: string[]; // List of city locodes
  years: number[]; // List of years to create inventories for
  projectId?: string;
}

export interface CreateBulkInventoriesResponse {
  errors: { locode: string; error: any }[];
  results: { locode: string; result: string[] }[];
}

const DEFAULT_PRIORITY = 0; // 10 is the highest priority

export default class AdminService {
  public static async createBulkInventories(
    props: BulkInventoryCreateProps,
    session: AppSession | null,
  ): Promise<CreateBulkInventoriesResponse> {
    UserService.ensureIsAdmin(session);

    const errors: { locode: string; error: any }[] = [];
    const results: { locode: string; result: string[] }[] = [];

    // Find user accounts to add to created inventories
    const users = await db.models.User.findAll({
      where: { email: { [Op.in]: props.emails } },
    });
    if (users.length !== props.emails.length) {
      throw new createHttpError.BadRequest(
        "Not all users to be added to inventories were found",
      );
    }

    // Bulk create inventories
    logger.info(
      `Creating bulk inventories for cities ${props.cityLocodes} and years ${props.years}`,
    );
    for (const cityLocode of props.cityLocodes) {
      const cityName = await OpenClimateService.getCityName(cityLocode);
      if (!cityName) {
        throw new createHttpError.NotFound(
          `Failed to query city name from OpenClimate!`,
        );
      }

      const city = await db.models.City.create({
        cityId: randomUUID(),
        locode: cityLocode,
        name: cityName,
        projectId: props.projectId ?? DEFAULT_PROJECT_ID,
      });

      // add users to the city
      await db.models.CityUser.bulkCreate(
        users.map((user) => ({
          cityUserId: randomUUID(),
          cityId: city.cityId,
          userId: user.userId,
        })),
      );

      logger.info("Creating inventories for city " + cityLocode);
      const inventories: InventoryAttributes[] = props.years.map((year) => ({
        inventoryId: randomUUID(),
        cityLocode,
        year,
        inventoryType: props.scope as InventoryTypeEnum,
        globalWarmingPotentialType:
          props.gwp.toLowerCase() as GlobalWarmingPotentialTypeEnum,
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
        if (!inventory.year) {
          console.error("No year for inventory", inventory.inventoryId);
          errors.push({
            locode: cityLocode,
            error: "No year for inventory " + inventory.inventoryId,
          });
          continue;
        }
        const populationErrors = await this.createPopulationEntries(
          cityLocode,
          inventory.year,
          city.cityId,
          props.projectId,
        );
        errors.push(...populationErrors);
      }
    }

    return { errors, results };
  }

  public static async bulkConnectDataSources(
    props: BulkInventoryUpdateProps,
    session: AppSession | null,
  ): Promise<{ errors: { locode: string; error: string }[] }> {
    UserService.ensureIsAdmin(session);

    const errors: { locode: string; error: string }[] = [];

    const inventories = await db.models.Inventory.findAll({
      attributes: ["inventoryId"],
      where: {
        year: { [Op.in]: props.years },
      },
      include: [
        {
          model: City,
          as: "city",
          attributes: ["locode"],
          where: { locode: { [Op.in]: props.cityLocodes } },
          include: [
            {
              model: db.models.User,
              as: "users",
              attributes: ["userId"],
              where: { email: props.userEmail },
            },
          ],
        },
      ],
    });

    for (const inventory of inventories) {
      if (!inventory.city?.locode) {
        throw new createHttpError.NotFound(
          "City or locode not found for inventory " + inventory.inventoryId,
        );
      }

      // Connect all data sources, rank them by priority, check if they connect
      const sourceErrors = await this.connectAllDataSources(
        inventory.inventoryId,
        inventory.city.locode,
      );
      errors.push(...sourceErrors);
    }

    return { errors };
  }

  public static async bulkUpdateInventories(
    { cityLocodes, userEmail, years, projectId }: BulkInventoryUpdateProps,
    session: AppSession | null,
  ) {
    UserService.ensureIsAdmin(session);
    const errors: { locode: string; error: string }[] = [];
    for (const locode of cityLocodes) {
      const city = await db.models.City.findOne({
        where: { locode },
        attributes: ["cityId"],
        include: [
          {
            model: db.models.User,
            as: "users",
            attributes: ["userId"],
            where: { email: userEmail },
          },
        ],
      });
      if (!city) {
        throw new createHttpError.NotFound(`City ${locode} not found`);
      }
      for (const year of years) {
        const newErrors = await this.createPopulationEntries(
          locode,
          year,
          city?.cityId,
          projectId,
        );
        errors.push(...newErrors);
      }
    }

    return errors;
  }

  private static async createPopulationEntries(
    cityLocode: string,
    inventoryYear: number,
    cityId: string,
    projectId?: string,
  ) {
    const errors: { locode: string; error: string }[] = [];

    // query population data from OpenClimate and save in Population table
    const populationData = await OpenClimateService.getPopulationData(
      cityLocode,
      inventoryYear,
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
        error: `Population data incomplete for city ${cityLocode} and inventory year ${inventoryYear}`,
      });
      return errors;
    }

    // they might be for the same year, but that is not guaranteed (because of data availability)
    await db.models.Population.upsert({
      population: populationData.cityPopulation,
      cityId,
      year: populationData.cityPopulationYear,
    });
    await db.models.Population.upsert({
      countryPopulation: populationData.countryPopulation,
      cityId,
      year: populationData.countryPopulationYear,
    });
    await db.models.Population.upsert({
      regionPopulation: populationData.regionPopulation,
      cityId,
      year: populationData.regionPopulationYear,
    });

    const boundaryData = await CityBoundaryService.getCityBoundary(cityLocode);
    const area = boundaryData.area;

    // save context data to City table
    const { region, regionLocode, country, countryLocode } = populationData;
    await db.models.City.update(
      {
        region,
        regionLocode,
        country,
        countryLocode,
        area: area ? Math.round(area) : undefined,
        projectId: projectId ?? undefined,
      },
      { where: { cityId } },
    );

    return errors;
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

    // group sources by GPC reference number so we can prioritize for each choice individually
    // TODO filter out sources that don't match the inventory's inventory type/ Subcategory's ReportingLevel
    const sourcesByReferenceNumber = groupBy(
      applicableSources.filter(
        (source) =>
          source.subCategory?.referenceNumber ||
          source.subSector?.referenceNumber,
      ),
      (source) =>
        source.subCategory?.referenceNumber ??
        source.subSector?.referenceNumber ??
        "unknown",
    );

    const populationScaleFactors =
      await DataSourceService.findPopulationScaleFactors(
        inventory,
        applicableSources,
      );

    await Promise.all(
      Object.entries(sourcesByReferenceNumber).map(
        async ([gpcReferenceNumber, sources]) => {
          // Sort each group by priority field
          const prioritizedSources = sources.sort(
            (a, b) =>
              (b.priority ?? DEFAULT_PRIORITY) -
              (a.priority ?? DEFAULT_PRIORITY),
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
                true, // force replace existing InventoryValue entries
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
              logger.error(
                `${cityLocode} - Wasn't able to find a data source for GPC reference number ${gpcReferenceNumber}`,
              );
              errors.push({
                locode: cityLocode,
                error: "no-data-source-available-for-gpc-reference-number",
                detail: gpcReferenceNumber,
              });
            }
          }
        },
      ),
    );

    return errors;
  }
}
