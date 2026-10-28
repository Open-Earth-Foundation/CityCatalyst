import { GET as findInventoryValuesBySubsector } from "@/app/api/v1/inventory/[inventory]/value/subsector/[subsector]/route";

import { db } from "@/models";
import { randomUUID } from "node:crypto";
import { describe, expect, beforeAll, afterAll, it } from "@jest/globals";

import {
  expectStatusCode,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";
import {
  createTestData,
  cleanupTestData,
  TestData,
} from "../helpers/testDataCreationHelper";

import { Inventory } from "@/models/Inventory";
import { SubSector } from "@/models/SubSector";
import { Publisher } from "@/models/Publisher";
import { DataSourceI18n as DataSource } from "@/models/DataSourceI18n";

const locode = "XX_SUBSECTOR_DS_CITY";
const inventoryName = "TEST_SUBSECTOR_DS_INVENTORY";
const subsectorName = "TEST_SUBSECTOR_DS_SUBSECTOR";
const publisherName = "TEST_PUBLISHER";

describe("Inventory Value Subsector API - data source publisher", () => {
  let inventory: Inventory;
  let subSector: SubSector;
  let publisher: Publisher;
  let dataSource: DataSource;
  let testData: TestData;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    await db.models.SubSector.destroy({ where: { subsectorName } });

    const prevInventory = await db.models.Inventory.findOne({
      where: { inventoryName },
    });
    if (prevInventory) {
      await db.models.InventoryValue.destroy({
        where: { inventoryId: prevInventory.inventoryId },
      });
      await db.models.Inventory.destroy({ where: { inventoryName } });
    }

    testData = await createTestData({
      cityName: locode,
      countryLocode: "XX",
    });

    const city = await db.models.City.findByPk(testData.cityId);
    if (!city) {
      throw new Error(`Failed to find city with ID ${testData.cityId}`);
    }

    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);

    inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      inventoryName,
      cityId: testData.cityId,
    });

    subSector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      subsectorName,
    });

    publisher = await db.models.Publisher.create({
      publisherId: randomUUID(),
      name: publisherName,
      url: "example.com",
    });

    dataSource = await db.models.DataSource.create({
      datasourceId: randomUUID(),
      publisherId: publisher.publisherId,
      datasetName: { en: "TEST_DATASET" },
    });

    await db.models.InventoryValue.create({
      inventoryId: inventory.inventoryId,
      id: randomUUID(),
      subSectorId: subSector.subsectorId,
      datasourceId: dataSource.datasourceId,
      gpcReferenceNumber: "I.1.1",
    });
  });

  afterAll(async () => {
    await db.models.InventoryValue.destroy({
      where: { inventoryId: inventory.inventoryId },
    });
    await db.models.DataSource.destroy({
      where: { datasourceId: dataSource.datasourceId },
    });
    await db.models.Publisher.destroy({
      where: { publisherId: publisher.publisherId },
    });
    await db.models.SubSector.destroy({
      where: { subsectorId: subSector.subsectorId },
    });
    await db.models.Inventory.destroy({
      where: { inventoryId: inventory.inventoryId },
    });
    await cleanupTestData(testData);
    if (db.sequelize) await db.sequelize.close();
  });

  it("includes the data source's publisher name", async () => {
    const req = mockRequest();
    const res = await findInventoryValuesBySubsector(req, {
      params: Promise.resolve({
        inventory: inventory.inventoryId,
        subsector: subSector.subsectorId,
      }),
    });

    await expectStatusCode(res, 200);
    const { data } = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].dataSource).toBeDefined();
    expect(data[0].dataSource.publisher).toBeDefined();
    expect(data[0].dataSource.publisher.name).toEqual(publisherName);
  });
});
