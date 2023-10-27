import { POST as createSubSector } from "@/app/api/v0/city/[city]/inventory/[year]/sector/[sector]/subsector/route";
import {
  DELETE as deleteSubSector,
  GET as findSubSector,
  PATCH as updateSubSector,
} from "@/app/api/v0/city/[city]/inventory/[year]/sector/[sector]/subsector/[subsector]/route";

import { db } from "@/models";
import { CreateSubSectorRequest } from "@/util/validation";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { createRequest, setupTests } from "../helpers";

import { SubSectorValue } from "@/models/SubSectorValue";
import { SectorValue } from "@/models/SectorValue";

const sectorValueId = randomUUID();
const subsectorValueId = randomUUID();

const locode = "XX7_INVENTORY_CITY";
const year = "3000";
const totalEmissions = 44000;
const activityUnits = "UNITS";
const activityValue = 1000;
const emissionFactorValue = 5;

const subsectorValue1: CreateSubSectorRequest = {
  activityUnits: "UNITS",
  activityValue: 1000,
  emissionFactorValue: 12,
  totalEmissions: 44000,
};

const subsectorValue2: CreateSubSectorRequest = {
  activityUnits: "UNITS",
  activityValue: 1000,
  emissionFactorValue: 12,
  totalEmissions: 700000,
};

const invalidSubSectorValue = {
  activityUnits: 0,
  activityValue: "1000s",
  emissionFactorValue: "va",
  totalEmissions: "TOTAL_EMISSIONS",
};

describe("Sub Sector API", () => {
  let subsectorValue: SubSectorValue;
  let sectorValue: SectorValue;
  before(async () => {
    setupTests();
    await db.initialize();
    await db.models.SubSectorValue.destroy({
      where: {
        subsectorValueId,
      },
    });

    sectorValue = await db.models.SectorValue.create({
      sectorValueId,
      totalEmissions,
    });

    subsectorValue = await db.models.SubSectorValue.create({
      subsectorValueId,
      sectorValueId,
      totalEmissions,
      activityUnits,
      activityValue,
      emissionFactorValue,
    });
  });

  beforeEach(async () => {
    await db.models.SubSectorValue.destroy({
      where: { subsectorValueId },
    });

    await db.models.SectorValue.destroy({
      where: { sectorValueId },
    });

    await db.models.SectorValue.create({
      sectorValueId,
      totalEmissions,
    });

    await db.models.SubSectorValue.create({
      subsectorValueId,
      totalEmissions,
      sectorValueId,
      activityUnits,
      activityValue,
      emissionFactorValue,
    });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("Should create a sub sector", async () => {
    await db.models.SubSectorValue.destroy({
      where: { subsectorValueId },
    });
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorValueId}/subsector`;
    const req = createRequest(url, subsectorValue1);
    const res = await createSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
      },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    console.log(data);
    assert.equal(data.totalEmissions, subsectorValue1.totalEmissions);
    assert.equal(data.activityUnits, subsectorValue1.activityUnits);
    assert.equal(data.activityValue, subsectorValue1.activityValue);
    assert.equal(data.emissionFactorValue, subsectorValue1.emissionFactorValue);
  });

  it("Should not create a sub sector with invalid data", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorValueId}/subsector`;
    const req = createRequest(url, invalidSubSectorValue);
    const res = await createSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
      },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 4);
  });

  it("Should find a sub sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorValueId}/subsector/${subsectorValueId}`;
    const req = createRequest(url, subsectorValue1);
    const res = await findSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
      },
    });
    const { data } = await res.json();
    console.log(data);
    assert.equal(res.status, 200);
    assert.equal(data.totalEmissions, totalEmissions);
    assert.equal(data.activityUnits, activityUnits);
    assert.equal(data.activityValue, activityValue);
    assert.equal(data.emissionFactorValue, emissionFactorValue);
  });

  it("Should not find a non-existing sub sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorValueId}/subsector/XX_INVALID_SUBSECTOR_ID`;
    const req = createRequest(url, invalidSubSectorValue);
    const res = await findSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: randomUUID(),
      },
    });
    assert.equal(res.status, 404);
  });

  it("Should update a sub sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorValueId}/subsector/${subsectorValueId}`;
    const req = createRequest(url, subsectorValue1);
    const res = await updateSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
      },
    });
    const { data } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.totalEmissions, subsectorValue1.totalEmissions);
    assert.equal(data.activityUnits, subsectorValue1.activityUnits);
    assert.equal(data.activityValue, subsectorValue1.activityValue);
    assert.equal(data.emissionFactorValue, subsectorValue1.emissionFactorValue);
  });

  it("Should not update a sub sector with invalid data", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorValueId}/subsector/${subsectorValueId}`;
    const req = createRequest(url, invalidSubSectorValue);
    const res = await updateSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
      },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 4);
  });

  it("Should delete a sub sector", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${year}/sector/${sectorValueId}/subsector/${subsectorValueId}`;
    const req = createRequest(url, subsectorValue1);
    const res = await deleteSubSector(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
      },
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.totalEmissions, totalEmissions);
    assert.equal(data.activityUnits, activityUnits);
    assert.equal(data.activityValue, activityValue);
    assert.equal(data.emissionFactorValue, emissionFactorValue);
  });

  it("Should not delete a non-existing sub sector", async () => {
    const url = `http://localhost:3000/api/v0/city/XX_INVALID/inventory/0/sector/${randomUUID()}/subsector/${randomUUID()}`;
    const req = createRequest(url, subsectorValue1);
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
