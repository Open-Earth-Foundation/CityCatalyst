import { POST as createSubSector } from "@/app/api/v0/city/[city]/inventory/[year]/sector/[sector]/subsector/route";
import {
  DELETE as deleteSubSector,
  GET as findSubSector,
  PATCH as updateSubSector,
} from "@/app/api/v0/city/[city]/inventory/[year]/sector/[sector]/subsector/[subsector]/route";

import { db } from "@/models";
import { CreateSubSectorRequest } from "@/util/validation";
import env from "@next/env";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { createRequest } from "../helpers";

import { SubSector } from "@/models/SubSector";
import { Sector } from "@/models/Sector";

const sectorId = randomUUID();
const subsectorId = randomUUID();

const sectorName = "Test Sector";
const subsectorName = "Test Sub Sector";
const locode = "XX7_INVENTORY_CITY";
const year = "3000";

const subsector1: CreateSubSectorRequest = {
  subsectorName: "Test Sub Sector",
  sectorId,
};

const subsector2: CreateSubSectorRequest = {
  subsectorName: "Test Sector 2",
  sectorId: randomUUID(),
};

const invalidSubSector = {
  subsectorName: 0,
  sectorId: "INVALID_XX",
};

describe("Sub Sector API", () => {
  let subsector: SubSector;
  let sector: Sector;
  before(async () => {
    const projectDir = process.cwd();
    env.loadEnvConfig(projectDir);
    await db.initialize();
    await db.models.SubSector.destroy({
      where: {
        subsectorId,
      },
    });

    sector = await db.models.Sector.create({
      sectorId,
      sectorName,
    });

    subsector = await db.models.SubSector.create({
      subsectorId,
      sectorId,
      subsectorName,
    });
  });

  beforeEach(async () => {
    await db.models.SubSector.destroy({
      where: { subsectorId },
    });

    await db.models.Sector.destroy({
      where: { sectorId },
    });

    await db.models.Sector.create({
      sectorId,
      sectorName,
    });

    await db.models.SubSector.create({
      subsectorId,
      subsectorName,
      sectorId,
    });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("Should create a sub sector", async () => {
    await db.models.SubSector.destroy({
      where: { subsectorId },
    });
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorId}/subsector`;
    const req = createRequest(url, subsector1);
    const res = await createSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorId,
      },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.subsectorName, subsector.subsectorName);
    assert.equal(data.sectorId, subsector.sectorId);
  });

  it("Should not create a sub sector with invalid data", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorId}/subsector`;
    const req = createRequest(url, invalidSubSector);
    const res = await createSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorId,
        subsector: subsectorId,
      },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 1);
  });

  it("Should find a sub sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorId}/subsector/${subsectorId}`;
    const req = createRequest(url);
    const res = await findSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorId,
        subsector: subsectorId,
      },
    });
    const { data } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.subsectorName, subsector.subsectorName);
    assert.equal(data.sectorId, subsector.sectorId);
  });

  it("Should not find a non-existing sub sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorId}/subsector/XX_INVALID_SUBSECTOR_ID`;
    const req = createRequest(url, invalidSubSector);
    const res = await findSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorId,
        subsector: randomUUID(),
      },
    });
    assert.equal(res.status, 404);
  });

  it("Should update a sub sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorId}/subsector/${subsectorId}`;
    const req = createRequest(url, subsector1);
    const res = await updateSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorId,
        subsector: subsectorId,
      },
    });
    const { data } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.subsectorName, subsector1.subsectorName);
    assert.equal(data.sectorId, subsector1.sectorId);
  });

  it("Should not update a sub sector with invalid data", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorId}/subsector/${subsectorId}`;
    const req = createRequest(url, invalidSubSector);
    const res = await updateSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorId,
        subsector: subsectorId,
      },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 1);
  });

  it("Should delete a sub sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorId}/subsector/${subsectorId}`;
    const req = createRequest(url, subsector1);
    const res = await deleteSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorId,
        subsector: subsectorId,
      },
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.subsectorName, subsector1.subsectorName);
    assert.equal(data.sectorId, subsector1.sectorId);
  });

  it("Should not delete a non-existing sub sector", async () => {
    const url = `http://localhost:3000/api/v0/city/XX_INVALID/inventory/0/sector/${randomUUID()}/subsector/${randomUUID()}`;
    const req = createRequest(url, subsector1);
    const res = await deleteSubSector(req, {
      params: {
        city: "XX_INVALID",
        year: "0",
        sector: randomUUID(),
        subsector: randomUUID(),
      },
    });
    assert.equal(res.status, 404);
  });
});
