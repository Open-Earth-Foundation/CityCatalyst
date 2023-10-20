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

import { Sector } from "@/models/Sector";

const sectorId = randomUUID();
const sectorName = "Test Sector";
const locode = "XX_INVENTORY_CITY";
const year = "3000";

const sector1: CreateSectorRequest = {
  sectorName: "Test Sector",
};

const sector2: CreateSectorRequest = {
  sectorName: "Test Sector 2",
};

const invalidSector = {
  sectorName: 0,
};

describe("Sector API", () => {
  let sector: Sector;
  before(async () => {
    const projectDir = process.cwd();
    env.loadEnvConfig(projectDir);
    await db.initialize();
    await db.models.Sector.destroy({
      where: {
        sectorId: sectorId,
      },
    });

    sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      sectorName,
    });
  });

  beforeEach(async () => {
    await db.models.Sector.destroy({
      where: { sectorId },
    });

    await db.models.Sector.create({
      sectorId,
      sectorName,
    });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("Should create a sector", async () => {
    await db.models.Sector.destroy({
      where: { sectorId },
    });
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector`;
    const req = createRequest(url, sector1);
    const res = await createSector(req, {
      params: { city: locode, year: year },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.sectorName, sector.sectorName);
  });

  it("should not create an inventory with invalid data", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector`;
    const req = createRequest(url, invalidSector);
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
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sector.sectorId}`;
    const req = createRequest(url);
    const res = await findSector(req, {
      params: { city: locode, year: year, sector: sector.sectorId },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.sectorName, sector.sectorName);
  });

  it("should not find non-existing sectors", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/XX_INVALID_SECTOR_ID`;
    const req = createRequest(url, invalidSector);
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
    const req = createRequest(url, sector2);
    const res = await updateSector(req, {
      params: { city: locode, year: year, sector: sector.sectorId },
    });
    const { data } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.sectorName, sector2.sectorName);
  });

  it("should not update a sector with invalid data", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector`;
    const req = createRequest(url, invalidSector);
    const res = await updateSector(req, {
      params: { city: locode, year: year, sector: sector.sectorId },
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
      params: { city: locode, year: year, sector: sector.sectorId },
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.sectorName, sector2.sectorName);
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
