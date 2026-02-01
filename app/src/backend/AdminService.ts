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
import {
  DEFAULT_PROJECT_ID,
  InventoryTypeEnum,
  getScopesForInventoryAndSector,
} from "@/util/constants";
import { InventoryAttributes } from "@/models/Inventory";
import { GlobalWarmingPotentialTypeEnum } from "@/util/enums";
import CityBoundaryService from "./CityBoundaryService";
import UserService from "./UserService";
import InventoryProgressService from "./InventoryProgressService";

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
          logger.error(
            { inventoryId: inventory.inventoryId },
            "No year for inventory",
          );
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
          where: {
            locode: { [Op.in]: props.cityLocodes },
            projectId: props.projectId ? props.projectId : { [Op.ne]: null },
          },
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
        session?.user.id,
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
    userId: string | undefined,
  ): Promise<{ locode: string; error: string }[]> {
    const errors: any[] = [];
    logger.info(
      `Connecting data sources for inventory ${inventoryId} (city: ${cityLocode})`,
    );
    const inventory = await db.models.Inventory.findOne({
      where: { inventoryId },
      include: [{ model: City, as: "city" }],
    });
    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    // Find all data sources for the inventory
    const sources = await DataSourceService.findAllSources(inventoryId);
    logger.debug(
      `Found ${sources.length} data sources for inventory ${inventoryId}`,
    );
    // Filter by locally available criteria (e.g. geographical location, year of inventory etc.)
    const { applicableSources, removedSources } =
      DataSourceService.filterSources(inventory, sources);
    logger.debug(
      `Found ${applicableSources.length} applicable data sources for inventory ${inventoryId}`,
    );
    for (const removedSource of removedSources) {
      logger.debug(
        `Data source ${removedSource.source.datasourceName} was filtered out for inventory ${inventoryId}: ${removedSource.reason}`,
      );
    }

    // Group sources by GPC reference number so we can prioritize for each choice individually
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

    // Get all possible GPC sectors, subsectors, and scope combinations for this inventory
    const allGPCCombinations = await this.getAllPossibleGPCCombinations(
      inventory.inventoryType!,
    );

    logger.debug(
      `Processing ${allGPCCombinations.length} possible GPC combinations for inventory ${inventoryId}`,
    );

    // Loop over all possible GPC combinations, not just available sources
    for (const combination of allGPCCombinations) {
      const { gpcReferenceNumber, sectorId, subSectorId, subCategoryId } =
        combination;

      // Check if we have data sources available for this GPC reference number
      const sourcesForReference =
        sourcesByReferenceNumber[gpcReferenceNumber] || [];

      if (sourcesForReference.length > 0) {
        // Sort by priority and try to apply data sources
        const prioritizedSources = sourcesForReference.sort(
          (a, b) =>
            (b.priority ?? DEFAULT_PRIORITY) - (a.priority ?? DEFAULT_PRIORITY),
        );

        let isSuccessful = false;
        for (const source of prioritizedSources) {
          logger.debug(
            `Trying data source ${source.datasourceId} for inventory ${inventoryId}`,
          );

          // Handle notation key sources differently
          if (source.retrievalMethod === "global_api_notation_key") {
            const result = await DataSourceService.applySource(
              source,
              inventory,
              populationScaleFactors,
              userId,
              true, // force replace existing InventoryValue entries
            );
            if (result.success) {
              logger.debug(
                `Successfully applied notation key source ${source.datasourceId} for inventory ${inventoryId}`,
              );
              isSuccessful = true;
              break;
            } else {
              logger.error(
                `Failed to apply notation key source ${source.datasourceId}: ${result.issue}`,
              );
            }
          } else {
            const data = await DataSourceService.retrieveGlobalAPISource(
              source,
              inventory,
            );
            if (data instanceof String || typeof data === "string") {
              logger.error(
                `Failed to fetch source ${source.datasourceId} for inventory ${inventoryId} for city ${cityLocode}: ${data}`,
              );
              errors.push({
                locode: cityLocode,
                error: `Failed to fetch source - ${source.datasourceId}: ${data}`,
              });
            } else {
              logger.debug(
                `Applying source ${source.datasourceId} for inventory ${inventoryId}`,
              );
              const result = await DataSourceService.applySource(
                source,
                inventory,
                populationScaleFactors,
                userId,
                true, // force replace existing InventoryValue entries
              );
              if (result.success) {
                logger.debug(
                  `Successfully applied source ${source.datasourceId} for inventory ${inventoryId}`,
                );
                isSuccessful = true;
                break;
              } else {
                logger.error(
                  `Failed to apply source ${source.datasourceId}: ${result.issue}`,
                );
              }
            }
          }
        }

        if (!isSuccessful) {
          logger.error(
            `${cityLocode} - Wasn't able to apply any data source for GPC reference number ${gpcReferenceNumber}`,
          );
          // Create unavailable inventory value with reason-NE
          await this.createUnavailableInventoryValue(
            inventoryId,
            gpcReferenceNumber,
            sectorId,
            subSectorId,
            subCategoryId,
            "reason-NE",
          );
        }
      } else {
        // No data sources available for this GPC combination - mark as unavailable with reason-NE
        logger.debug(
          `No data sources available for GPC reference number ${gpcReferenceNumber} in inventory ${inventoryId}`,
        );
        await this.createUnavailableInventoryValue(
          inventoryId,
          gpcReferenceNumber,
          sectorId,
          subSectorId,
          subCategoryId,
          "reason-NE",
        );
      }
    }

    return errors;
  }

  private static async getAllPossibleGPCCombinations(
    inventoryType: string,
  ): Promise<
    Array<{
      gpcReferenceNumber: string;
      sectorId: string;
      subSectorId: string | null;
      subCategoryId: string | null;
    }>
  > {
    const validSectorRefNos = {
      gpc_basic: ["I", "II", "III"],
      gpc_basic_plus: ["I", "II", "III", "IV", "V"],
    };

    const inventoryStructure =
      await InventoryProgressService.getSortedInventoryStructure();
    const applicableSectors = inventoryStructure.filter((sector) => {
      if (!sector.referenceNumber) {
        return false;
      }
      return (
        validSectorRefNos[
          inventoryType as keyof typeof validSectorRefNos
        ]?.includes(sector.referenceNumber) ?? false
      );
    });

    const combinations: Array<{
      gpcReferenceNumber: string;
      sectorId: string;
      subSectorId: string | null;
      subCategoryId: string | null;
    }> = [];

    for (const sector of applicableSectors) {
      for (const subSector of sector.subSectors) {
        if (subSector.subCategories.length > 0) {
          // Process subcategories when they exist
          for (const subCategory of subSector.subCategories) {
            // Apply the same scope filtering logic as InventoryProgressService
            if (inventoryType === "gpc_basic_plus") {
              // All subcategories are valid for GPC_BASIC_PLUS
              combinations.push({
                gpcReferenceNumber: subCategory.referenceNumber!,
                sectorId: sector.sectorId,
                subSectorId: subSector.subsectorId,
                subCategoryId: subCategory.subcategoryId,
              });
            } else {
              // For GPC_BASIC, filter by scope
              const scope =
                subCategory.scope?.scopeName &&
                /^\d+$/.test(subCategory.scope.scopeName)
                  ? Number(subCategory.scope.scopeName)
                  : null;

              if (!sector.referenceNumber) {
                continue;
              }

              const allowedScopes = getScopesForInventoryAndSector(
                inventoryType as any,
                sector.referenceNumber,
              );

              // If allowedScopes is empty (like for sectors IV and V in GPC_BASIC), skip all subcategories
              if (allowedScopes.length === 0) {
                continue;
              }

              // If scope is null but allowedScopes has values, skip this subcategory
              if (scope === null) {
                continue;
              }

              if (allowedScopes.includes(scope)) {
                combinations.push({
                  gpcReferenceNumber: subCategory.referenceNumber!,
                  sectorId: sector.sectorId,
                  subSectorId: subSector.subsectorId,
                  subCategoryId: subCategory.subcategoryId,
                });
              }
            }
          }
        } else {
          // Process subsector directly when no subcategories exist (like IV.1, V.1, etc.)
          if (!sector.referenceNumber) {
            continue;
          }

          const allowedScopes = getScopesForInventoryAndSector(
            inventoryType as any,
            sector.referenceNumber,
          );

          // For sectors IV and V, check if they're allowed for this inventory type
          if (
            inventoryType === "gpc_basic_plus" &&
            (sector.referenceNumber === "IV" || sector.referenceNumber === "V")
          ) {
            // Include subsector for GPC_BASIC_PLUS
            combinations.push({
              gpcReferenceNumber: subSector.referenceNumber!,
              sectorId: sector.sectorId,
              subSectorId: subSector.subsectorId,
              subCategoryId: null,
            });
          } else if (
            inventoryType === "gpc_basic" &&
            allowedScopes.length > 0
          ) {
            // For GPC_BASIC, only include if the sector has allowed scopes
            combinations.push({
              gpcReferenceNumber: subSector.referenceNumber!,
              sectorId: sector.sectorId,
              subSectorId: subSector.subsectorId,
              subCategoryId: null,
            });
          }
        }
      }
    }

    return combinations;
  }

  private static async createUnavailableInventoryValue(
    inventoryId: string,
    gpcReferenceNumber: string,
    sectorId: string,
    subSectorId: string | null,
    subCategoryId: string | null,
    reason: string,
  ): Promise<void> {
    try {
      // Check if inventory value already exists
      const existingValue = await db.models.InventoryValue.findOne({
        where: {
          inventoryId,
          gpcReferenceNumber,
        },
      });

      if (!existingValue) {
        await db.models.InventoryValue.create({
          id: randomUUID(),
          inventoryId,
          gpcReferenceNumber,
          sectorId,
          subSectorId: subSectorId ?? undefined,
          subCategoryId: subCategoryId ?? undefined,
          unavailableReason: reason,
          unavailableExplanation: "Data not available from data sources",
          co2eq: undefined,
        });
        logger.debug(
          `Created unavailable inventory value for ${gpcReferenceNumber} with reason ${reason}`,
        );
      } else {
        logger.debug(
          `Inventory value already exists for ${gpcReferenceNumber}, skipping creation`,
        );
      }
    } catch (error) {
      logger.error(
        `Failed to create unavailable inventory value for ${gpcReferenceNumber}: ${error}`,
      );
    }
  }
}
