import { db } from "@/models";
import { DataSource } from "@/models/DataSource";
import { Inventory } from "@/models/Inventory";
import { multiplyBigIntFloat } from "@/util/big_int";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";

const EARTH_LOCATION = "EARTH";

export default class DataSourceService {
  public static filterSources(
    inventory: Inventory,
    dataSources: DataSource[],
  ): DataSource[] {
    if (!inventory.city) {
      throw createHttpError.InternalServerError(
        "Inventory doesn't contain city data!",
      );
    }
    const { city } = inventory;

    return dataSources.filter((source) => {
      const locations = source.geographicalLocation?.split(",");
      if (locations?.includes(EARTH_LOCATION)) {
        return true;
      }

      const isCountry = city.country && locations?.includes(city.country);
      const isRegion = city.region && locations?.includes(city.region);
      const isCity = city.locode && locations?.includes(city.locode);

      return isCountry || isRegion || isCity;
    });
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
    const data = await DataSourceService.retrieveGlobalAPISource(
      source,
      inventory,
    );
    if (typeof data === "string") {
      return data;
    }

    const emissions = data.totals.emissions;
    let co2eq, co2Amount, n2oAmount, ch4Amount: bigint;

    if (scaleFactor !== 1.0) {
      co2eq = multiplyBigIntFloat(BigInt(emissions.co2eq_100yr), scaleFactor);
      co2Amount = multiplyBigIntFloat(BigInt(emissions.co2_mass), scaleFactor);
      n2oAmount = multiplyBigIntFloat(BigInt(emissions.n2o_mass), scaleFactor);
      ch4Amount = multiplyBigIntFloat(BigInt(emissions.ch4_mass), scaleFactor);
    } else {
      co2eq = BigInt(emissions.co2eq_100yr);
      co2Amount = BigInt(emissions.co2_mass);
      n2oAmount = BigInt(emissions.n2o_mass);
      ch4Amount = BigInt(emissions.ch4_mass);
    }

    const subCategory = await db.models.SubCategory.findOne({
      where: { subcategoryId: source.subcategoryId },
      include: [{ model: db.models.SubSector, as: "subsector" }],
    });

    if (!subCategory) {
      throw new createHttpError.InternalServerError("Sub-category for source not found");
    }

    // TODO what to do with existing InventoryValues and GasValues?
    const inventoryValue = await db.models.InventoryValue.create({
      datasourceId: source.datasourceId,
      inventoryId: inventory.inventoryId,
      co2eq,
      co2eqYears: 100,
      id: randomUUID(),
      subCategoryId: source.subcategoryId,
      subSectorId: subCategory.subsectorId,
      sectorId: subCategory.subsector.sectorId,
      gpcReferenceNumber: subCategory.referenceNumber,
    });

    // store values for co2, ch4, n2o separately for accounting and editing
    await db.models.GasValue.create({
      id: randomUUID(),
      inventoryValueId: inventoryValue.id,
      gas: "CO2",
      gasAmount: co2Amount,
    });
    await db.models.GasValue.create({
      id: randomUUID(),
      inventoryValueId: inventoryValue.id,
      gas: "N2O",
      gasAmount: n2oAmount,
    });
    await db.models.GasValue.create({
      id: randomUUID(),
      inventoryValueId: inventoryValue.id,
      gas: "CH4",
      gasAmount: ch4Amount,
    });

    return true;
  }
}
