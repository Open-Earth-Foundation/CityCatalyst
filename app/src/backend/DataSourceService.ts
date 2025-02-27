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

const EARTH_LOCATION = "EARTH";

export type RemovedSourceResult = { source: DataSource; reason: string };
export type FailedSourceResult = { source: DataSource; error: string };
type FilterSourcesResult = {
  applicableSources: DataSource[];
  removedSources: RemovedSourceResult[];
};

export default class DataSourceService {
  public static async findAllSources(
    inventoryId: string,
  ): Promise<DataSource[]> {
    const include = [
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
      console.error(message, err);
      return message;
    }

    if (typeof data.totals !== "object") {
      const message = "Incorrect response from Global API for URL: " + url;
      console.error(message, data);
      return message;
    }

    return data;
  }

  public static async applyGlobalAPISource(
    source: DataSource,
    inventory: Inventory,
    scaleFactor: number = 1.0,
  ): Promise<string | boolean> {
    // TODO adjust into if/ else statement once global_api_activity_data is implemented (then we will need to check for an ActivityValue with a connected source as well for collisions)
    if (source.retrievalMethod === "global_api_activity_data") {
      throw new createHttpError.BadRequest(
        "Data source of retrieval method global_api_activity_data, not yet supported",
      );
    }

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

    // check for another already connected data source with the same GPC refno to prevent overwriting data or surplus emissions
    const existingInventoryValue = await db.models.InventoryValue.findOne({
      where: {
        gpcReferenceNumber,
        inventoryId: inventory.inventoryId,
      },
    });
    if (existingInventoryValue) {
      // TODO do we need a "force" parameter that overrides this check and deletes the existing value?
      throw new createHttpError.BadRequest(
        "Inventory already has a value for GPC refno " + gpcReferenceNumber,
      );
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
}
