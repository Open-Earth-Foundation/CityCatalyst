import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
import { DataSourceI18n as DataSource } from "@/models/DataSourceI18n";
import DataSourceService from "@/backend/DataSourceService";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { setupTests } from "../helpers";
import { randomUUID } from "node:crypto";
import { City } from "@/models/City";
import { data } from "./datasource_service_data";
import { Op } from "sequelize";

describe("DataSourceService.applyGlobalAPISource", () => {
  const inventoryId = randomUUID();
  const subsectorId = randomUUID();
  const subcategoryId = randomUUID();
  const inventoryData: Inventory = {
    inventoryId,
    city: { locode: "US NYC", region: "NY" },
    year: 2022,
  } as Inventory;

  const dataSource: DataSource = {
    datasourceId: randomUUID(),
    apiEndpoint: "https://api.example.com/:locode/:year/:gpcReferenceNumber",
    retrievalMethod: "global_api",
    subcategoryId,
    subsectorId,
  } as DataSource;

  let inventory: Inventory;
  let city: City;
  beforeAll(async () => {
    setupTests();
    await db.initialize();
    city = await db.models.City.create({
      cityId: randomUUID(),
      locode: "datasource_service",
      name: "datasource_service",
    });
    const sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      sectorName: "sectorName",
    });
    const subSector = await db.models.SubSector.create({
      subsectorId,
      sectorId: sector.sectorId,
      referenceNumber: "I.4.4",
      subsectorName: "datasource_service_test",
    });
    await db.models.SubCategory.create({
      subcategoryId,
      subsectorId: subSector.subsectorId,
      subcategoryName: "datasource_service_test",
    });
    inventory = await db.models.Inventory.create({
      ...inventoryData,
      inventoryId: randomUUID(),
      cityId: city.cityId,
    });
    await db.models.DataSource.create(dataSource);
  });

  afterAll(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should apply global API source successfully", async () => {
    jest
      .spyOn(DataSourceService, "retrieveGlobalAPISource")
      .mockImplementation((..._args) => {
        return Promise.resolve(data);
      });
    const result = await DataSourceService.applyGlobalAPISource(
      dataSource,
      inventory,
    );
    expect(result).toBe(true);

    const inventoryValue = await db.models.InventoryValue.findOne({
      where: { inventoryId: inventory.inventoryId },
    });
    if (!inventoryValue) {
      expect(inventoryValue).toBeTruthy();
    } else {
      expect(inventoryValue.co2eq).toBe(
        Math.trunc(Number(data.totals.emissions.co2eq_100yr)).toString(),
      );

      const gasValuesInventory = await db.models.GasValue.findAll({
        where: { inventoryValueId: inventoryValue.id },
      });
      expect(gasValuesInventory).toHaveLength(3);
      expect(gasValuesInventory.map((gv) => gv.gas)).toEqual(
        expect.arrayContaining(["CO2", "N2O", "CH4"]),
      );
      expect(gasValuesInventory.find((e) => e.gas === "CO2")!.gasAmount).toBe(
        Math.trunc(Number(data.totals.emissions.co2_mass)).toString(),
      );
      expect(gasValuesInventory.find((e) => e.gas === "N2O")!.gasAmount).toBe(
        Math.trunc(Number(data.totals.emissions.n2o_mass)).toString(),
      );
      expect(gasValuesInventory.find((e) => e.gas === "CH4")!.gasAmount).toBe(
        Math.trunc(Number(data.totals.emissions.ch4_mass)).toString(),
      );

      const activityValues = await db.models.ActivityValue.findAll({
        where: { inventoryValueId: inventoryValue.id },
      });
      expect(activityValues.length).toBe(3);
      expect(activityValues).toContainEqual(
        expect.objectContaining({
          activityData: null,
          co2eq: "670687678",
          co2eqYears: 100,
          datasourceId: null,
          inventoryValueId: inventoryValue.id,
          metadata: {
            activityId: "fuel-consumption-activity",
            "residential-building-fuel-type": "fuel-type-charcoal",
            "residential-building-type": "building-type-all",
          },
        }),
      );
      const gasValuesActivity = await db.models.GasValue.findAll({
        where: {
          activityValueId: { [Op.in]: activityValues.map((i) => i.id) },
        },
      });
      expect(gasValuesActivity.length).toBe(9);
      expect(gasValuesActivity).toContainEqual(
        expect.objectContaining({
          inventoryValueId: null,
          gas: "CH4",
          gasAmount: "1130436",
        }),
      );
    }
  });
});
