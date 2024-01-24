import { db } from "@/models";
import { DataSource } from "@/models/DataSource";
import { Inventory } from "@/models/Inventory";
import { InventoryValueAttributes } from "@/models/InventoryValue";
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
  ): Promise<any | null> {
    const referenceNumber =
      source.subCategory?.referenceNumber || source.subSector?.referenceNumber;
    if (
      !source.apiEndpoint ||
      !inventory.city.locode ||
      inventory.year == null ||
      !(source.subsectorId || source.subcategoryId) ||
      !referenceNumber
    ) {
      return null;
    }

    const url = source.apiEndpoint
      .replace(":locode", inventory.city.locode.replace("-", " "))
      .replace(":year", inventory.year.toString())
      .replace(":gpcReferenceNumber", referenceNumber);

    let data;
    try {
      const response = await fetch(url);
      data = await response.json();
    } catch (err) {
      console.error(
        `Failed to query data source ${source.datasourceId} at URL ${url}:`,
        err,
      );
      return null;
    }

    if (typeof data.totals !== "object") {
      console.error("Incorrect response from Global API for URL:", url, data);
      return null;
    }

    return data;
  }

  public static async applyGlobalAPISource(
    source: DataSource,
    inventory: Inventory,
  ): Promise<boolean> {
    const data = await DataSourceService.retrieveGlobalAPISource(
      source,
      inventory,
    );

    const emissions = data.totals.emissions;
    const totalEmissions = emissions.co2eq_100yr;
    const values: Partial<InventoryValueAttributes> = {
      datasourceId: source.datasourceId,
      inventoryId: inventory.inventoryId,
      co2eq: totalEmissions,
      co2eqYears: 100,
    };

    // TODO what to do with existing InventoryValues and GasValues?
    const inventoryValue = await db.models.InventoryValue.create({
      ...values,
      id: randomUUID(),
      subCategoryId: source.subcategoryId,
    });

    // store values for co2, ch4, n2o separately for accounting and editing
    // TODO what emissions factor should be used?
    await db.models.GasValue.create({
      id: randomUUID(),
      inventoryValueId: inventoryValue.id,
      gas: "CO2",
      gasAmount: emissions.co2_mass,
      // emissionsFactorId:
    });
    await db.models.GasValue.create({
      id: randomUUID(),
      inventoryValueId: inventoryValue.id,
      gas: "N2O",
      gasAmount: emissions.n2o_mass,
      // emissionsFactorId:
    });
    await db.models.GasValue.create({
      id: randomUUID(),
      inventoryValueId: inventoryValue.id,
      gas: "CH4",
      gasAmount: emissions.ch4_mass,
      // emissionsFactorId:
    });

    return true;
  }
}
