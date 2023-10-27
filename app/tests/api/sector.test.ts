import { POST as createSector } from "@/app/api/v0/city/[city]/inventory/[year]/sector/route";
import {
  DELETE as deleteSector,
  GET as findSector,
  PATCH as updateSector,
} from "@/app/api/v0/city/[city]/inventory/[year]/sector/[sector]/route";
import { db } from "@/models";
import { CreateSectorRequest } from "@/util/validation";
import env from "@next/env";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { createRequest } from "../helpers";

import { SectorValue } from "@/models/SectorValue";
import { City } from "@/models/City";

const sectorValueId = randomUUID();
const locode = "XX_INVENTORY_CITY1";
const year = "3000";
const totalEmissions = 44000;

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
  let sectorValue: SectorValue;
  let city: City;
  before(async () => {
    const projectDir = process.cwd();
    env.loadEnvConfig(projectDir);
    await db.initialize();
    await db.models.SectorValue.destroy({
      where: {
        sectorValueId,
      },
    });

    await db.models.City.destroy({
      where: {
        locode,
      },
    });

    city = await db.models.City.create({
      cityId: randomUUID(),
      locode,
    });

    sectorValue = await db.models.SectorValue.create({
      sectorValueId: randomUUID(),
      totalEmissions,
    });
  });

  beforeEach(async () => {
    await db.models.SectorValue.destroy({
      where: { sectorValueId },
    });

    await db.models.SectorValue.create({
      sectorValueId,

      totalEmissions,
    });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("Should create a sector", async () => {
    await db.models.SectorValue.destroy({
      where: { sectorValueId },
    });
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector`;
    const req = createRequest(url, sectorValue1);
    const res = await createSector(req, {
      params: { city: locode, year: year },
    });
    console.log(res);
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.totalEmissions, sectorValue1.totalEmissions);
  });

  it("should not create an inventory with invalid data", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector`;
    const req = createRequest(url, invalidSectorValue);
    const res = await createSector(req, {
      params: { city: locode, year: year },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 1);
  });

  it("should find a sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorValueId}`;
    const req = createRequest(url);
    const res = await findSector(req, {
      params: { city: locode, year: year, sector: sectorValueId },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.totalEmissions, sectorValue.totalEmissions);
  });

  it("should not find non-existing sectors", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/XX_INVALID_SECTOR_ID`;
    const req = createRequest(url, invalidSectorValue);
    const res = await findSector(req, {
      params: {
        city: locode,
        year: year,
        sector: randomUUID(),
      },
    });
    assert.equal(res.status, 404);
  });

  it("should update a sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector`;
    const req = createRequest(url, sectorValue2);
    const res = await updateSector(req, {
      params: { city: locode, year: year, sector: sectorValue.sectorValueId },
    });
    const { data } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.totalEmissions, sectorValue2.totalEmissions);
  });

  it("should not update a sector with invalid data", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector`;
    const req = createRequest(url, invalidSectorValue);
    const res = await updateSector(req, {
      params: { city: locode, year: year, sector: sectorValue.sectorValueId },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 1);
  });

  it("should delete a sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector`;
    const req = createRequest(url);
    const res = await deleteSector(req, {
      params: { city: locode, year: year, sector: sectorValue.sectorValueId },
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.totalEmissions, sectorValue2.totalEmissions);
  });

  it("should not delete a non-existing sector", async () => {
    const url = `http://localhost:3000/api/v0/city/XX_INVALID/inventory/0/sector`;
    const req = createRequest(url);
    const res = await deleteSector(req, {
      params: { city: "XX_INVALID", year: "0", sector: randomUUID() },
    });
    assert.equal(res.status, 404);
  });
});
