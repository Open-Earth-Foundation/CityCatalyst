import { db } from "@/models";
import { DataSource } from "@/models/DataSource";
import { Inventory } from "@/models/Inventory";
import { SubCategoryValueAttributes } from "@/models/SubCategoryValue";
import {
  SubSectorValue,
  SubSectorValueCreationAttributes,
} from "@/models/SubSectorValue";
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
    // TODO store values for co2, ch4, n2o separately for accounting and editing
    const totalEmissions = emissions.co2eq_100yr;
    const values: Partial<SubCategoryValueAttributes> = {
      datasourceId: source.datasourceId,
      inventoryId: inventory.inventoryId,
      totalEmissions,
      co2EmissionsValue: emissions.co2_mass,
      n2oEmissionsValue: emissions.n2o_mass,
      ch4EmissionsValue: emissions.ch4_mass,
    };

    if (source.subsectorId) {
      await DataSourceService.initSubSectorValue(
        source,
        inventory,
        totalEmissions,
        values,
        source.subSector.sectorId!,
        source.subsectorId,
      );
    } else if (source.subcategoryId) {
      // add parent SubSectorValue if not present yet
      let subSectorValue = await db.models.SubSectorValue.findOne({
        where: {
          subsectorId: source.subCategory?.subsectorId,
          inventoryId: inventory.inventoryId,
        },
      });
      if (!subSectorValue) {
        subSectorValue = await DataSourceService.initSubSectorValue(
          source,
          inventory,
          totalEmissions,
          values,
          source.subCategory?.subsector?.sectorId!,
          source.subCategory?.subsectorId!,
        );
      } else {
        await subSectorValue.update({
          totalEmissions: (subSectorValue.totalEmissions || 0) + totalEmissions,
        });
      }
      const subCategoryValue = await db.models.SubCategoryValue.create({
        ...values,
        subcategoryValueId: randomUUID(),
        subcategoryId: source.subcategoryId,
        subsectorValueId: subSectorValue.subsectorValueId,
      });
    } else {
      return false;
    }

    return true;
  }

  private static async initSubSectorValue(
    source: DataSource,
    inventory: Inventory,
    totalEmissions: number,
    values: Partial<SubSectorValueCreationAttributes>,
    sectorId: string,
    subsectorId: string,
  ): Promise<SubSectorValue> {
    if (!sectorId) {
      throw new createHttpError.InternalServerError(
        "Failed to find sector ID for source " + source.datasourceId,
      );
    }
    if (!subsectorId) {
      throw new createHttpError.InternalServerError(
        "Failed to find subsector ID for source " + source.datasourceId,
      );
    }

    let sectorValue = await db.models.SectorValue.findOne({
      where: {
        sectorId,
        inventoryId: inventory.inventoryId,
      },
    });
    // TODO have to init/ update totalEmissions here?
    if (!sectorValue) {
      sectorValue = await db.models.SectorValue.create({
        sectorValueId: randomUUID(),
        sectorId,
        inventoryId: inventory.inventoryId,
        totalEmissions,
      });
    } else {
      await sectorValue.update({
        totalEmissions: (sectorValue.totalEmissions || 0) + totalEmissions,
      });
    }
    const subSectorValue = await db.models.SubSectorValue.create({
      ...values,
      sectorValueId: sectorValue.sectorValueId,
      subsectorId,
      subsectorValueId: randomUUID(),
    });
    return subSectorValue;
  }
}
