import { db } from "@/models";
import { DataSourceI18n as DataSource } from "@/models/DataSourceI18n";
import { Inventory } from "@/models/Inventory";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import Decimal from "decimal.js";
import { decimalToBigInt } from "@/util/big_int";
import { SubSector } from "@/models/SubSector";
import { DataSourceActivityDataRecord } from "@/app/[lng]/[inventory]/data/[step]/types";
import { InventoryValue } from "@/models/InventoryValue";
import { Publisher } from "@/models/Publisher";
import { Scope } from "@/models/Scope";
import { SubCategory } from "@/models/SubCategory";
import { logger } from "@/services/logger";
import { findClosestYear, PopulationEntry } from "@/util/helpers";
import { PopulationAttributes } from "@/models/Population";
import { maxPopulationYearDifference } from "@/util/constants";
import { Op } from "sequelize";

const EARTH_LOCATION = "EARTH";

export type RemovedSourceResult = { source: DataSource; reason: string };
export type FailedSourceResult = { source: DataSource; error: string };
export type FilterSourcesResult = {
  applicableSources: DataSource[];
  removedSources: RemovedSourceResult[];
};
export type ApplySourceResult = {
  id: string;
  success: boolean;
  issue?: string;
};
export type PopulationScaleFactorResponse = {
  countryPopulationScaleFactor: number;
  regionPopulationScaleFactor: number;
  populationIssue: string | null;
};

export const downscaledByCountryPopulation =
  "global_api_downscaled_by_population";
export const downscaledByRegionPopulation =
  "global_api_downscaled_by_region_population";
export const populationScalingRetrievalMethods = [
  downscaledByCountryPopulation,
  downscaledByRegionPopulation,
];

export default class DataSourceService {
  private static getSourceInclude(inventoryId: string) {
    return [
      {
        model: DataSource,
        as: "dataSources",
        include: [
          { model: Scope, as: "scopes" },
          { model: Publisher, as: "publisher" },
          {
            model: InventoryValue,
            as: "inventoryValues",
            required: false,
            where: { inventoryId },
          },
          { model: SubSector, as: "subSector" },
          {
            model: SubCategory,
            as: "subCategory",
            include: [
              { model: SubSector, as: "subsector" },
              { model: Scope, as: "scope" },
            ],
          },
        ],
      },
    ];
  }

  public static async findAllSources(
    inventoryId: string,
  ): Promise<DataSource[]> {
    const include = DataSourceService.getSourceInclude(inventoryId);

    const sectors = await db.models.Sector.findAll({ include });
    const subSectors = await db.models.SubSector.findAll({ include });
    const subCategories = await db.models.SubCategory.findAll({ include });

    const sectorSources = sectors.flatMap((sector) => sector.dataSources);
    const subSectorSources = subSectors.flatMap(
      (subSector) => subSector.dataSources,
    );
    const subCategorySources = subCategories.flatMap(
      (subCategory) => subCategory.dataSources,
    );

    const sources = sectorSources
      .concat(subSectorSources)
      .concat(subCategorySources);

    return sources;
  }

  public static async findSource(
    inventoryId: string,
    datasourceId: string,
  ): Promise<DataSource | null> {
    const include = DataSourceService.getSourceInclude(inventoryId);
    // Search in all three entity types
    const [sector] = await db.models.Sector.findAll({
      include,
      where: { "$dataSources.datasource_id$": datasourceId },
    });
    if (sector && sector.dataSources) {
      const found = sector.dataSources.find(
        (ds: any) => ds.datasourceId === datasourceId,
      );
      if (found) return found;
    }

    const [subSector] = await db.models.SubSector.findAll({
      include,
      where: { "$dataSources.datasource_id$": datasourceId },
    });
    if (subSector && subSector.dataSources) {
      const found = subSector.dataSources.find(
        (ds: any) => ds.datasourceId === datasourceId,
      );
      if (found) return found;
    }

    const [subCategory] = await db.models.SubCategory.findAll({
      include,
      where: { "$dataSources.datasource_id$": datasourceId },
    });
    if (subCategory && subCategory.dataSources) {
      const found = subCategory.dataSources.find(
        (ds: any) => ds.datasourceId === datasourceId,
      );
      if (found) return found;
    }
    return null;
  }

  public static async findPopulationScaleFactors(
    inventory: Inventory,
    sources: DataSource[],
  ) {
    let countryPopulationScaleFactor = 1;
    let regionPopulationScaleFactor = 1;
    let populationIssue: string | null = null;
    if (
      sources.some((source) =>
        populationScalingRetrievalMethods.includes(
          source.retrievalMethod ?? "",
        ),
      )
    ) {
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
      const cityPopulations = populations.filter((pop) => !!pop.population);
      const cityPopulation = findClosestYear(
        cityPopulations as PopulationEntry[],
        inventory.year!,
      );
      const countryPopulations = populations.filter(
        (pop) => !!pop.countryPopulation,
      );
      const countryPopulation = findClosestYear(
        countryPopulations as PopulationEntry[],
        inventory.year!,
      ) as PopulationAttributes;
      const regionPopulations = populations.filter(
        (pop) => !!pop.regionPopulation,
      );
      const regionPopulation = findClosestYear(
        regionPopulations as PopulationEntry[],
        inventory.year!,
      ) as PopulationAttributes;
      // TODO allow country downscaling to work if there is no region population?
      if (!cityPopulation || !countryPopulation || !regionPopulation) {
        // City is missing population/ region population/ country population for a year close to the inventory year
        populationIssue = "missing-population"; // translation key
      } else {
        countryPopulationScaleFactor =
          cityPopulation.population / countryPopulation.countryPopulation!;
        regionPopulationScaleFactor =
          cityPopulation.population / regionPopulation.regionPopulation!;
      }
    }

    return {
      countryPopulationScaleFactor,
      regionPopulationScaleFactor,
      populationIssue,
    };
  }

  public static async applySource(
    source: DataSource,
    inventory: Inventory,
    populationScaleFactors: PopulationScaleFactorResponse, // obtained from findPopulationScaleFactors
    forceReplace: boolean = false,
  ): Promise<ApplySourceResult> {
    const result: ApplySourceResult = {
      id: source.datasourceId,
      success: true,
      issue: undefined,
    };

    const {
      countryPopulationScaleFactor,
      regionPopulationScaleFactor,
      populationIssue,
    } = populationScaleFactors;

    if (source.retrievalMethod === "global_api") {
      const sourceStatus = await DataSourceService.applyGlobalAPISource(
        source,
        inventory,
        1.0,
        forceReplace,
      );
      if (typeof sourceStatus === "string") {
        result.issue = sourceStatus;
        result.success = false;
      }
    } else if (source.retrievalMethod === "global_api_notation_key") {
      const sourceStatus =
        await DataSourceService.applyGlobalAPINotationKeySource(
          source,
          inventory,
          forceReplace,
        );
      if (typeof sourceStatus === "string") {
        result.issue = sourceStatus;
        result.success = false;
      }
    } else if (
      populationScalingRetrievalMethods.includes(source.retrievalMethod ?? "")
    ) {
      if (populationIssue) {
        result.issue = populationIssue;
        result.success = false;
        return result;
      }
      let scaleFactor = 1.0;
      if (source.retrievalMethod === downscaledByCountryPopulation) {
        scaleFactor = countryPopulationScaleFactor;
      } else if (source.retrievalMethod === downscaledByRegionPopulation) {
        scaleFactor = regionPopulationScaleFactor;
      }
      const sourceStatus = await DataSourceService.applyGlobalAPISource(
        source,
        inventory,
        scaleFactor,
        forceReplace,
      );
      if (typeof sourceStatus === "string") {
        result.issue = sourceStatus;
        result.success = false;
      }
    } else {
      result.issue = `Unsupported retrieval method ${source.retrievalMethod} for data source ${source.datasourceId}`;
      logger.error(result.issue);
      result.success = false;
    }

    return result;
  }

  public static filterSources(
    inventory: Inventory,
    dataSources: DataSource[],
  ): FilterSourcesResult {
    if (!inventory.city) {
      throw createHttpError.InternalServerError(
        "Inventory doesn't contain city data!",
      );
    }
    if (!inventory.year) {
      throw createHttpError.InternalServerError(
        "Inventory doesn't contain year!",
      );
    }
    const { city } = inventory;

    const removedSources: RemovedSourceResult[] = [];
    const applicableSources = dataSources.filter((source) => {
      const locations = source.geographicalLocation?.split(",");
      if (locations?.includes(EARTH_LOCATION)) {
        return true;
      }

      if (!source.startYear || !source.endYear) {
        removedSources.push({
          source,
          reason: "startYear or endYear missing in source",
        });
        return false;
      }
      const isMatchingYearRange =
        source.startYear <= inventory.year! &&
        source.endYear >= inventory.year!;
      if (!isMatchingYearRange) {
        removedSources.push({
          source,
          reason: "inventory year not in [startYear, endYear] range of source",
        });
        return false;
      }

      // TODO store locode for country and region as separate columns in City
      const countryLocode = city.locode?.split(" ")[0];
      const isCountry = countryLocode && locations?.includes(countryLocode);
      const isRegion = city.region && locations?.includes(city.region);
      const isCity = city.locode && locations?.includes(city.locode);
      const isMatchingLocation = isCountry || isRegion || isCity;

      if (!isMatchingLocation) {
        removedSources.push({
          source,
          reason: "geographicalLocation doesn't match inventory locodes",
        });
        return false;
      }

      return true;
    });

    return { applicableSources, removedSources };
  }

  public static async retrieveGlobalAPISource(
    source: DataSource,
    inventory: Inventory,
  ): Promise<any | string> {
    const referenceNumber =
      source.subCategory?.referenceNumber || source.subSector?.referenceNumber;
    if (
      !source.apiEndpoint ||
      !inventory.city.locode ||
      inventory.year == null ||
      !(source.subsectorId || source.subcategoryId) ||
      !referenceNumber
    ) {
      return "Missing reference data in inventory";
    }

    const url = source.apiEndpoint
      .replace(":locode", inventory.city.locode.replace("-", " "))
      .replace(":country", inventory.city.locode.slice(0, 2))
      .replace(":year", inventory.year.toString())
      .replace(":gpcReferenceNumber", referenceNumber);

    let data;
    try {
      const response = await fetch(url);
      data = await response.json();
    } catch (err) {
      const message = `Failed to query data source ${source.datasourceId} at URL ${url}:`;
      logger.error({ err }, message);
      return message;
    }

    if (typeof data.totals !== "object") {
      if (data.detail === "No data available") {
        return "Source doesn't have data available for this input";
      } else {
        const message = "Incorrect response from Global API for URL: " + url;
        logger.error(message, data);
        return message;
      }
    }

    return data;
  }

  public static async applyGlobalAPISource(
    source: DataSource,
    inventory: Inventory,
    scaleFactor: number = 1.0,
    forceReplace: boolean = false,
  ): Promise<string | boolean> {
    // TODO adjust into if/ else statement once global_api_activity_data is implemented (then we will need to check for an ActivityValue with a connected source as well for collisions)
    if (source.retrievalMethod === "global_api_activity_data") {
      throw new createHttpError.BadRequest(
        "Data source of retrieval method global_api_activity_data, not yet supported",
      );
    }

    const { gpcReferenceNumber, subSector } =
      await DataSourceService.findSubSectorAndGPCRefNo(source);

    // check for another already connected data source with the same GPC refno to prevent overwriting data or surplus emissions
    const existingInventoryValue = await db.models.InventoryValue.findOne({
      where: {
        gpcReferenceNumber,
        inventoryId: inventory.inventoryId,
      },
    });
    if (existingInventoryValue) {
      // forceReplace parameter overrides existing value check and deletes it
      if (forceReplace) {
        await existingInventoryValue.destroy();
      } else {
        throw new createHttpError.BadRequest(
          "Inventory already has a value for GPC refno " + gpcReferenceNumber,
        );
      }
    }

    const data = await DataSourceService.retrieveGlobalAPISource(
      source,
      inventory,
    );
    if (typeof data === "string") {
      return data; // this is an error/ validation failure message and handled at the callsite
    }

    const emissions = data.totals.emissions;
    const co2eq = new Decimal(emissions.co2eq_100yr).times(scaleFactor);
    const co2Amount = new Decimal(emissions.co2_mass).times(scaleFactor);
    const n2oAmount = new Decimal(emissions.n2o_mass).times(scaleFactor);
    const ch4Amount = new Decimal(emissions.ch4_mass).times(scaleFactor);

    // TODO what to do with existing InventoryValues and GasValues?
    const inventoryValue = await db.models.InventoryValue.create({
      datasourceId: source.datasourceId,
      inventoryId: inventory.inventoryId,
      co2eq: decimalToBigInt(co2eq),
      co2eqYears: 100,
      id: randomUUID(),
      subCategoryId: source.subcategoryId,
      subSectorId: subSector.subsectorId,
      sectorId: subSector.sectorId,
      gpcReferenceNumber,
    });
    if (data.records) {
      await DataSourceService.saveActivityValues({
        inventoryValueId: inventoryValue.id,
        records: data.records,
        gpcReferenceNumber,
      });
    }
    // store values for co2, ch4, n2o separately for accounting and editing
    await db.models.GasValue.create({
      id: randomUUID(),
      inventoryValueId: inventoryValue.id,
      gas: "CO2",
      gasAmount: decimalToBigInt(co2Amount),
    });
    await db.models.GasValue.create({
      id: randomUUID(),
      inventoryValueId: inventoryValue.id,
      gas: "N2O",
      gasAmount: decimalToBigInt(n2oAmount),
    });
    await db.models.GasValue.create({
      id: randomUUID(),
      inventoryValueId: inventoryValue.id,
      gas: "CH4",
      gasAmount: decimalToBigInt(ch4Amount),
    });

    return true;
  }

  private static async findSubSectorAndGPCRefNo(source: DataSource): Promise<{
    gpcReferenceNumber: string;
    subSector: SubSector;
  }> {
    let gpcReferenceNumber: string | undefined;
    let subSector: SubSector | undefined;

    if (source.subcategoryId) {
      const subCategory = await db.models.SubCategory.findOne({
        where: { subcategoryId: source.subcategoryId },
        include: [{ model: db.models.SubSector, as: "subsector" }],
      });

      if (!subCategory) {
        throw new createHttpError.InternalServerError(
          "Sub-category for source not found",
        );
      }
      gpcReferenceNumber = subCategory.referenceNumber;
      subSector = subCategory.subsector;
    } else if (source.subsectorId) {
      subSector =
        (await db.models.SubSector.findOne({
          where: { subsectorId: source.subsectorId },
        })) ?? undefined;

      if (!subSector) {
        throw new createHttpError.InternalServerError(
          "Sub-sector for source not found",
        );
      }
      gpcReferenceNumber = subSector.referenceNumber;
    } else {
      throw new createHttpError.InternalServerError(
        "Sub-category or sub-sector not set in source data",
      );
    }

    return { gpcReferenceNumber: gpcReferenceNumber!, subSector };
  }

  public static async applyGlobalAPINotationKeySource(
    source: DataSource,
    inventory: Inventory,
    forceReplace: boolean = false,
  ): Promise<string | boolean> {
    const { gpcReferenceNumber, subSector } =
      await DataSourceService.findSubSectorAndGPCRefNo(source);

    // check for another already connected data source with the same GPC refno to prevent overwriting data or surplus emissions
    const existingInventoryValue = await db.models.InventoryValue.findOne({
      where: {
        gpcReferenceNumber,
        inventoryId: inventory.inventoryId,
      },
    });
    if (existingInventoryValue) {
      // forceReplace parameter overrides existing value check and deletes it
      if (forceReplace) {
        await existingInventoryValue.destroy();
      } else {
        throw new createHttpError.BadRequest(
          "Inventory already has a value for GPC refno " + gpcReferenceNumber,
        );
      }
    }

    // same function is used as the only differences are the API route (in the source) and the returned values
    const data = await DataSourceService.retrieveGlobalAPISource(
      source,
      inventory,
    );
    if (typeof data === "string") {
      return data; // this is an error/ validation failure message and handled at the callsite
    }

    const unavailableReason = data.unavailable_reason;
    const unavailableExplanation = data.unavailable_explanation;

    if (!unavailableReason || !unavailableExplanation) {
      logger.error(data, "Invalid data returned from notation key source");
      return "invalid_notation_key_data"; // returned as error with translation key
    }

    await db.models.InventoryValue.create({
      datasourceId: source.datasourceId,
      inventoryId: inventory.inventoryId,
      id: randomUUID(),
      subCategoryId: source.subcategoryId,
      subSectorId: subSector.subsectorId,
      sectorId: subSector.sectorId,
      gpcReferenceNumber,
      unavailableReason,
      unavailableExplanation,
    });

    return true;
  }

  private static async saveActivityValue({
    inventoryValueId,
    activity,
    gpcReferenceNumber,
  }: {
    inventoryValueId: string;
    activity: DataSourceActivityDataRecord;
    gpcReferenceNumber: string | undefined;
  }) {
    const co2eq = activity.gases.reduce(
      (sum, gas) => sum.plus(new Decimal(gas.emissions_value_100yr)),
      new Decimal(0),
    );

    const activityValue = await db.models.ActivityValue.create({
      id: randomUUID(),
      inventoryValueId,
      co2eq: BigInt(decimalToBigInt(co2eq)),
      co2eqYears: 100,
      metadata: {
        activityId: activity.activity_name + "-activity",
        ...activity.activity_subcategory_type,
      },
      activityData: {
        "activity-value":
          activity.gases.reduce((acc, gas) => acc + gas.activity_value, 0) ?? 0,
        "activity-unit": activity.activity_units,
      },
    });
    const emissionsFactors = activity.gases.map((gas) => ({
      id: randomUUID(),
      gas: gas.gas_name,
      gpcReferenceNumber,
      emissionsPerActivity: gas.emissionfactor_value,
      units: activity.activity_units,
    }));

    const createdEmissionsFactors = await db.models.EmissionsFactor.bulkCreate(
      emissionsFactors,
      { returning: true },
    );

    const gasValues = activity.gases.map((gas, index) => ({
      id: randomUUID(),
      activityValueId: activityValue.id,
      gas: gas.gas_name,
      gasAmount: BigInt(Math.trunc(gas.emissions_value)),
      emissionsFactorId: createdEmissionsFactors[index].id,
    }));

    await db.models.GasValue.bulkCreate(gasValues);
  }

  private static async saveActivityValues({
    inventoryValueId,
    records,
    gpcReferenceNumber,
  }: {
    inventoryValueId: string;
    records: DataSourceActivityDataRecord[];
    gpcReferenceNumber: string | undefined;
  }) {
    await Promise.all(
      records.map((activity) =>
        DataSourceService.saveActivityValue({
          activity,
          inventoryValueId,
          gpcReferenceNumber,
        }),
      ),
    );
  }

  /**
   * Gets a datasource from an inventory and scales it if necessary
   */
  public static async getSourceWithData(
    source: any,
    inventory: any,
    countryPopulationScaleFactor: number,
    regionPopulationScaleFactor: number,
    populationIssue: string | null,
  ): Promise<{ error?: string; source: any; data?: any }> {
    const data = await DataSourceService.retrieveGlobalAPISource(
      source,
      inventory,
    );
    if (data instanceof String || typeof data === "string") {
      return { error: data as string, source };
    }
    let scaleFactor = 1.0;
    let issue: string | null = null;
    if (source.retrievalMethod === downscaledByCountryPopulation) {
      scaleFactor = countryPopulationScaleFactor;
      issue = populationIssue;
    } else if (source.retrievalMethod === downscaledByRegionPopulation) {
      scaleFactor = regionPopulationScaleFactor;
      issue = populationIssue;
    }
    return { source, data: { ...data, scaleFactor, issue } };
  }
}
