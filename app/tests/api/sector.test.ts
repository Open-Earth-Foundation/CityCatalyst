import {
  DELETE as deleteSector,
  GET as findSector,
  PATCH as upsertSector,
} from "@/app/api/v0/inventory/[inventory]/sector/[sector]/route";
import { db } from "@/models";
import { CreateSectorRequest } from "@/util/validation";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { mockRequest, setupTests } from "../helpers";

import { SectorValue } from "@/models/SectorValue";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { Sector } from "@/models/Sector";

const locode = "XX_SECTOR_CITY";
const inventoryName = "TEST_SECTOR_INVENTORY";
const sectorName = "TEST_SECTOR_SECTOR";
const year = 3000;
const totalEmissions = 4000;

const sectorValue1: CreateSectorRequest = {
  totalEmissions: 4000,
};

const sectorValue2: CreateSectorRequest = {
  totalEmissions: 5000,
};

const invalidSectorValue = {
  totalEmissions: "XX_TOTAL_EMISSIONS",
};

describe("Sector API", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  let sectorValue: SectorValue;

  before(async () => {
    setupTests();
    await db.initialize();

    const prevInventory = await db.models.Inventory.findOne({
      where: { inventoryName },
    });
    if (prevInventory) {
      await db.models.SectorValue.destroy({
        where: { inventoryId: prevInventory?.inventoryId },
      });
      await prevInventory.destroy();
    }
    await db.models.Sector.destroy({
      where: { sectorName },
    });
    await db.models.City.destroy({
      where: { locode },
    });

    city = await db.models.City.create({
      cityId: randomUUID(),
      locode,
    });
    sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      sectorName,
      referenceNumber: "X.X.X",
    });
  });

  beforeEach(async () => {
    await db.models.SectorValue.destroy({
      where: { sectorId: sector.sectorId },
    });
    await db.models.Inventory.destroy({
      where: { inventoryName },
    });

    inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      year,
      inventoryName,
    });
    sectorValue = await db.models.SectorValue.create({
      sectorValueId: randomUUID(),
      sectorId: sector.sectorId,
      inventoryId: inventory.inventoryId,
      totalEmissions,
    });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("Should create a sector", async () => {
    await db.models.SectorValue.destroy({
      where: { sectorValueId: sectorValue.sectorValueId },
    });
    const req = mockRequest(sectorValue1);
    const res = await upsertSector(req, {
      params: { inventory: inventory.inventoryId, sector: sector.sectorId },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.totalEmissions, sectorValue1.totalEmissions);
  });

  it("should not create an inventory with invalid data", async () => {
    const req = mockRequest(invalidSectorValue);
    const res = await upsertSector(req, {
      params: { inventory: inventory.inventoryId, sector: sector.sectorId },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 1);
  });

  it("should find a sector", async () => {
    const req = mockRequest();
    const res = await findSector(req, {
      params: { inventory: inventory.inventoryId, sector: sector.sectorId },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.totalEmissions, sectorValue.totalEmissions);
  });

  it("should not find non-existing sectors", async () => {
    const req = mockRequest(invalidSectorValue);
    const res = await findSector(req, {
      params: { inventory: inventory.inventoryId, sector: randomUUID() },
    });
    assert.equal(res.status, 404);
  });

  it("should update a sector", async () => {
    const req = mockRequest(sectorValue2);
    const res = await upsertSector(req, {
      params: { inventory: inventory.inventoryId, sector: sector.sectorId },
    });
    const { data } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.totalEmissions, sectorValue2.totalEmissions);
  });

  it("should not update a sector with invalid data", async () => {
    const req = mockRequest(invalidSectorValue);
    const res = await upsertSector(req, {
      params: { inventory: inventory.inventoryId, sector: sector.sectorId },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 1);
  });

  it("should delete a sector", async () => {
    const req = mockRequest();
    const res = await deleteSector(req, {
      params: { inventory: inventory.inventoryId, sector: sector.sectorId },
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.totalEmissions, sectorValue1.totalEmissions);
  });

  it("should not delete a non-existing sector", async () => {
    const req = mockRequest();
    const res = await deleteSector(req, {
      params: { inventory: randomUUID(), sector: randomUUID() },
    });
    assert.equal(res.status, 404);
  });
});
