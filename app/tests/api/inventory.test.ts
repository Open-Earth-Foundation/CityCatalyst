import {
  DELETE as deleteInventory,
  GET as findInventory,
  PATCH as updateInventory,
} from "@/app/api/v0/city/[city]/inventory/[year]/route";
import { POST as createInventory } from "@/app/api/v0/city/[city]/inventory/route";
import { db } from "@/models";
import { CreateInventoryRequest } from "@/util/validation";
import env from "@next/env";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Op } from "sequelize";
import { createRequest } from "../helpers";

const locode = "XX_INVENTORY_CITY";

const inventory: CreateInventoryRequest = {
  inventoryName: "Test Inventory",
  year: 3000,
  totalEmissions: 1337,
};

const inventory2: CreateInventoryRequest = {
  inventoryName: "Test Inventory 2",
  year: 3001,
  totalEmissions: 1338,
};

const invalidInventory = {
  inventoryName: "",
  year: 0,
  totalEmissions: "246kg co2eq",
};

describe("Inventory API", () => {
  before(async () => {
    const projectDir = process.cwd();
    env.loadEnvConfig(projectDir);
    await db.initialize();
    await db.models.Inventory.destroy({
      where: { year: { [Op.or]: [inventory.year, inventory2.year] } },
    });
    await db.models.City.destroy({ where: { locode } });
    await db.models.City.create({ cityId: randomUUID(), locode });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should create an inventory", async () => {
    const url = "http://localhost:3000/api/v0/city" + locode;
    const req = createRequest(url, inventory);
    const res = await createInventory(req, {
      params: { city: locode },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.inventoryName, inventory.inventoryName);
    assert.equal(data.year, inventory.year);
    assert.equal(data.totalEmissions, inventory.totalEmissions);
  });

  it("should not create an inventory with invalid data", async () => {
    const url = "http://localhost:3000/api/v0/city/" + locode;
    const req = createRequest(url, invalidInventory);
    const res = await createInventory(req, {
      params: { city: locode },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 3);
  });

  it("should find an inventory", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}`;
    const req = createRequest(url);
    const res = await findInventory(req, {
      params: { city: locode, year: inventory.year.toString() },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.inventoryName, inventory.inventoryName);
    assert.equal(data.year, inventory.year);
    assert.equal(data.totalEmissions, inventory.totalEmissions);
  });

  it("should not find non-existing inventories", async () => {
    const url = "http://localhost:3000/api/v0/city/XX_INVALID/inventory/0";
    const req = createRequest(url, invalidInventory);
    const res = await findInventory(req, {
      params: { city: "XX_INVALID", year: "0" },
    });
    assert.equal(res.status, 404);
  });

  it("should update an inventory", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}`;
    const req = createRequest(url, inventory2);
    const res = await updateInventory(req, {
      params: { city: locode, year: inventory.year.toString() },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.inventoryName, inventory2.inventoryName);
    assert.equal(data.year, inventory2.year);
    assert.equal(data.totalEmissions, inventory2.totalEmissions);
  });

  it("should not update an inventory with invalid data", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}`;
    const req = createRequest(url, invalidInventory);
    const res = await updateInventory(req, {
      params: { city: locode, year: inventory.year.toString() },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 3);
  });

  it("should delete an inventory", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}`;
    const req = createRequest(url);
    const res = await deleteInventory(req, {
      params: { city: locode, year: inventory2.year.toString() },
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.inventoryName, inventory2.inventoryName);
    assert.equal(data.year, inventory2.year);
    assert.equal(data.totalEmissions, inventory2.totalEmissions);
  });

  it("should not delete a non-existing inventory", async () => {
    const url = `http://localhost:3000/api/v0/city/XX_INVALID/inventory/0`;
    const req = createRequest(url);
    const res = await deleteInventory(req, {
      params: { city: "XX_INVALID", year: "0" },
    });
    assert.equal(res.status, 404);
  });
});
