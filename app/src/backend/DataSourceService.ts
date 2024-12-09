import { db } from "@/models";
import type { DataSourceI18n as DataSource } from "@/models/DataSourceI18n";
import { Inventory } from "@/models/Inventory";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import Decimal from "decimal.js";
import { decimalToBigInt } from "@/util/big_int";
import type { SubSector } from "@/models/SubSector";

const EARTH_LOCATION = "EARTH";

export type RemovedSourceResult = { source: DataSource; reason: string };
export type FailedSourceResult = { source: DataSource; error: string };
type FilterSourcesResult = {
  applicableSources: DataSource[];
  removedSources: RemovedSourceResult[];
};

export default class DataSourceService {
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
}
