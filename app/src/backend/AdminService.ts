import { AppSession } from "@/lib/auth";
import { db } from "@/models";
import { logger } from "@/services/logger";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import DataSourceConnectService from "./DataSourceConnectService";
import { City } from "@/models/City";
import OpenClimateService from "./OpenClimateService";
import { Op } from "sequelize";
import { DEFAULT_PROJECT_ID, InventoryTypeEnum } from "@/util/constants";
import { InventoryAttributes } from "@/models/Inventory";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum as GhgiInventoryTypeEnum,
} from "@/util/enums";
import CityBoundaryService from "./CityBoundaryService";
import UserService from "./UserService";
import {
  formatStoredLocode,
  locodeLookupValues,
  normalizeCityName,
} from "@/backend/BulkInventoryImportMatcher";
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
  errors: { locode: string; error: unknown }[];
  results: { locode: string; result: string[] }[];
}

export type CityInventoryShellErrorCode =
  "missing_city_identity" | "city_in_other_project";

export class CityInventoryShellError extends Error {
  constructor(
    public readonly code: CityInventoryShellErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CityInventoryShellError";
  }
}

export interface FindOrCreateCityAndInventoryProps {
  projectId: string;
  year: number;
  cityName?: string | null;
  locode?: string | null;
  inventoryType: "gpc_basic" | "gpc_basic_plus";
  gwp: GlobalWarmingPotentialTypeEnum;
  userId?: string | null;
}

export interface FindOrCreateCityAndInventoryResult {
  cityId: string;
  inventoryId: string;
  locode: string | null;
  cityName: string;
  createdCity: boolean;
  createdInventory: boolean;
}

export default class AdminService {
  public static async createBulkInventories(
    props: BulkInventoryCreateProps,
    session: AppSession | null,
  ): Promise<CreateBulkInventoriesResponse> {
    UserService.ensureIsAdmin(session);

    const errors: { locode: string; error: unknown }[] = [];
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
      const sourceErrors =
        await DataSourceConnectService.connectAllForInventory(
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

  /**
   * Find or create a city in the project and an inventory for `year`.
   * OpenClimate is enrichment only: a manifest/filename name is enough, including
   * comunas with an INE key and no UN/LOCODE. Population/boundary must not fail
   * the caller.
   */
  public static async findOrCreateCityAndInventory(
    props: FindOrCreateCityAndInventoryProps,
  ): Promise<FindOrCreateCityAndInventoryResult> {
    const locodeInput = props.locode?.trim() || null;
    const nameInput = props.cityName?.trim() || null;
    if (!locodeInput && !nameInput) {
      throw new CityInventoryShellError(
        "missing_city_identity",
        "File has no city name, locode, or INE code to create from",
      );
    }

    const storedLocode = locodeInput ? formatStoredLocode(locodeInput) : null;
    const city = await this.findOrCreateProjectCity({
      projectId: props.projectId,
      locode: storedLocode,
      locodeInput,
      nameInput,
    });
    const createdCity = city.created;
    const cityName = city.record.name ?? nameInput ?? storedLocode ?? "";

    if (props.userId) {
      await this.ensureCityUser(city.record.cityId, props.userId);
    }

    if (storedLocode) {
      await this.enrichCityBestEffort(
        storedLocode,
        props.year,
        city.record.cityId,
        props.projectId,
      );
    }

    const inventory = await this.findOrCreateInventory({
      cityId: city.record.cityId,
      cityName,
      year: props.year,
      inventoryType: props.inventoryType,
      gwp: props.gwp,
    });

    return {
      cityId: city.record.cityId,
      inventoryId: inventory.inventoryId,
      locode: city.record.locode ?? storedLocode,
      cityName,
      createdCity,
      createdInventory: inventory.created,
    };
  }

  private static async findOrCreateProjectCity(input: {
    projectId: string;
    locode: string | null;
    locodeInput: string | null;
    nameInput: string | null;
  }): Promise<{ record: City; created: boolean }> {
    if (input.locodeInput) {
      const existing = await db.models.City.findAll({
        where: { locode: { [Op.in]: locodeLookupValues(input.locodeInput) } },
      });
      const inProject = existing.filter(
        (row) => row.projectId === input.projectId,
      );
      if (inProject.length > 0) {
        return { record: inProject[0], created: false };
      }
      const elsewhere = existing.find(
        (row) => row.projectId && row.projectId !== input.projectId,
      );
      if (elsewhere) {
        throw new CityInventoryShellError(
          "city_in_other_project",
          `Locode ${input.locode} already belongs to another project`,
        );
      }
      if (existing.length > 0) {
        const orphan = existing[0];
        if (!orphan.projectId) {
          await orphan.update({ projectId: input.projectId });
        }
        return { record: orphan, created: false };
      }
    }

    if (input.nameInput) {
      const projectCities = await db.models.City.findAll({
        where: { projectId: input.projectId },
        attributes: ["cityId", "name", "locode", "projectId"],
      });
      const key = normalizeCityName(input.nameInput);
      const nameMatches = projectCities.filter(
        (row) => row.name != null && normalizeCityName(row.name) === key,
      );
      if (nameMatches.length === 1) {
        const record = nameMatches[0];
        if (!record.locode && input.locode) {
          try {
            await record.update({ locode: input.locode });
          } catch (err) {
            logger.warn(
              { err, locode: input.locode, cityId: record.cityId },
              "Could not attach locode to existing city",
            );
          }
        }
        return { record, created: false };
      }
    }

    const name = await this.resolveCityName(input.locode, input.nameInput);
    if (!name) {
      throw new CityInventoryShellError(
        "missing_city_identity",
        "File has no city name, locode, or INE code to create from",
      );
    }

    try {
      const record = await db.models.City.create({
        cityId: randomUUID(),
        name,
        locode: input.locode ?? undefined,
        projectId: input.projectId,
      });
      return { record, created: true };
    } catch (err) {
      if (input.locodeInput) {
        const raced = await db.models.City.findAll({
          where: { locode: { [Op.in]: locodeLookupValues(input.locodeInput) } },
        });
        const inProject = raced.find(
          (row) => row.projectId === input.projectId,
        );
        if (inProject) return { record: inProject, created: false };
        if (raced.length > 0) {
          throw new CityInventoryShellError(
            "city_in_other_project",
            `Locode ${input.locode} already belongs to another project`,
          );
        }
      }
      throw err;
    }
  }

  private static async findOrCreateInventory(input: {
    cityId: string;
    cityName: string;
    year: number;
    inventoryType: "gpc_basic" | "gpc_basic_plus";
    gwp: GlobalWarmingPotentialTypeEnum;
  }): Promise<{ inventoryId: string; created: boolean }> {
    const existing = await db.models.Inventory.findOne({
      where: { cityId: input.cityId, year: input.year },
      attributes: ["inventoryId"],
    });
    if (existing) {
      return { inventoryId: existing.inventoryId, created: false };
    }

    const created = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: input.cityId,
      inventoryName: `${input.cityName} ${input.year}`,
      year: input.year,
      inventoryType: input.inventoryType,
      globalWarmingPotentialType: input.gwp,
    });
    return { inventoryId: created.inventoryId, created: true };
  }

  private static async ensureCityUser(
    cityId: string,
    userId: string,
  ): Promise<void> {
    const existing = await db.models.CityUser.findOne({
      where: { cityId, userId },
      attributes: ["cityUserId"],
    });
    if (existing) return;
    await db.models.CityUser.create({
      cityUserId: randomUUID(),
      cityId,
      userId,
    });
  }

  private static async resolveCityName(
    locode: string | null,
    fallbackName: string | null,
  ): Promise<string | null> {
    if (locode) {
      try {
        const ocName = await OpenClimateService.getCityName(locode);
        if (ocName) return ocName;
      } catch (err) {
        logger.warn(
          { err, locode },
          "OpenClimate city name lookup failed (best-effort)",
        );
      }
    }
    return fallbackName || locode;
  }

  /**
   * Pull OpenClimate population nearest to `year` (10-year window, same as
   * onboarding) and Global API boundary. Never throws to the caller.
   */
  public static async enrichCityBestEffort(
    locode: string,
    year: number,
    cityId: string,
    projectId: string,
  ): Promise<void> {
    try {
      const errors = await this.createPopulationEntries(
        locode,
        year,
        cityId,
        projectId,
      );
      if (errors.length) {
        logger.warn(
          { locode, cityId, errors },
          "OpenClimate population/boundary enrichment failed (best-effort)",
        );
      }
    } catch (err) {
      logger.warn(
        { err, locode, cityId },
        "OpenClimate enrichment threw (best-effort)",
      );
    }
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

    // Persist whatever OC has nearest to the inventory year. City / region /
    // country series often use different years; missing one must not drop the rest.
    if (
      populationData.cityPopulation != null &&
      populationData.cityPopulationYear != null
    ) {
      await db.models.Population.upsert({
        population: populationData.cityPopulation,
        cityId,
        year: populationData.cityPopulationYear,
      });
    } else {
      errors.push({
        locode: cityLocode,
        error: `No city population near inventory year ${inventoryYear} for ${cityLocode}`,
      });
    }
    if (
      populationData.countryPopulation != null &&
      populationData.countryPopulationYear != null
    ) {
      await db.models.Population.upsert({
        countryPopulation: populationData.countryPopulation,
        cityId,
        year: populationData.countryPopulationYear,
      });
    }
    if (
      populationData.regionPopulation != null &&
      populationData.regionPopulationYear != null
    ) {
      await db.models.Population.upsert({
        regionPopulation: populationData.regionPopulation,
        cityId,
        year: populationData.regionPopulationYear,
      });
    }

    let area: number | undefined;
    try {
      const boundaryData =
        await CityBoundaryService.getCityBoundary(cityLocode);
      area = boundaryData.area;
    } catch (err) {
      logger.warn(
        { err, locode: cityLocode },
        "City boundary lookup failed (best-effort)",
      );
    }

    const { region, regionLocode, country, countryLocode } = populationData;
    await db.models.City.update(
      {
        region: region ?? undefined,
        regionLocode: regionLocode ?? undefined,
        country: country ?? undefined,
        countryLocode: countryLocode ?? undefined,
        area: area ? Math.round(area) : undefined,
        projectId: projectId ?? undefined,
      },
      { where: { cityId } },
    );

    return errors;
  }
}
