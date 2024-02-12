import { GET as getDataSourcesForSector } from "@/app/api/v0/datasource/[inventoryId]/[sectorId]/route";
import {
  GET as getAllDataSources,
  POST as applyDataSources,
} from "@/app/api/v0/datasource/[inventoryId]/route";

import { db } from "@/models";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Op } from "sequelize";
import { mockRequest, setupTests } from "../helpers";
import { City } from "@/models/City";
import { CreateInventoryRequest } from "@/util/validation";
import { Sector } from "@/models/Sector";
import { Inventory } from "@/models/Inventory";
import fetchMock from "fetch-mock";

const locode = "XX_DATASOURCE_CITY";
const sectorName = "XX_DATASOURCE_TEST_1";
const subsectorName = "XX_DATASOURCE_TEST_1";
const subcategoryName = "XX_DATASOURCE_TEST_1";

const inventoryData: CreateInventoryRequest = {
  inventoryName: "Test Inventory",
  year: 4000,
  totalEmissions: 1337,
};

const sourceLocations = [
  "EARTH",
  "DE,US,XX",
  "DE_BLN,US_NY,XX_DATASOURCE_CITY",
];

const apiEndpoint =
  "http://localhost:4000/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber";

const mockGlobalApiResponses = [
  {
    totals: {
      emissions: { co2_co2eq: 1337, ch4_co2eq: 1338, n2o_co2eq: 1339 },
    },
  },
  {
    totals: {
      emissions: { co2_co2eq: 2337, ch4_co2eq: 2338, n2o_co2eq: 2339 },
    },
  },
  {
    totals: {
      emissions: { co2_co2eq: 3337, ch4_co2eq: 3338, n2o_co2eq: 3339 },
    },
  },
];

describe("DataSource API", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  before(async () => {
    setupTests();
    await db.initialize();
    // this also deletes all Sector/SubSectorValue instances associated with it (cascade)
    await db.models.Inventory.destroy({
      where: { year: inventoryData.year },
    });
    await db.models.DataSource.destroy({
      where: { name: { [Op.like]: "XX_DATASOURCE_TEST%" } },
    });
    await db.models.City.destroy({ where: { locode } });
    city = await db.models.City.create({
      cityId: randomUUID(),
      locode,
      name: "CC_",
    });
    await db.models.SubCategory.destroy({ where: { subcategoryName } });
    await db.models.SubSector.destroy({ where: { subsectorName } });
    await db.models.Sector.destroy({ where: { sectorName } });

    inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      ...inventoryData,
    });
    sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      referenceNumber: "X",
      sectorName,
    });
    const subSector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
      referenceNumber: "X.9",
      subsectorName,
    });
    const subCategory = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subsectorId: subSector.subsectorId,
      referenceNumber: "X.9.9",
      subcategoryName,
    });

    fetchMock.config.overwriteRoutes = true;
    for (let i = 0; i < 3; i++) {
      const source = await db.models.DataSource.create({
        datasourceId: randomUUID(),
        name: "XX_DATASOURCE_TEST_" + i,
        sectorId: sector.sectorId,
        apiEndpoint,
        startYear: 4000 + i,
        endYear: 4010 + i,
        geographicalLocation: sourceLocations[i],
        subcategoryId: subCategory.subcategoryId,
      });
      const url = source
        .apiEndpoint!.replace(":locode", locode)
        .replace(":year", inventory.year!.toString())
        .replace(":gpcReferenceNumber", subCategory.referenceNumber!);
      fetchMock.mock(url, mockGlobalApiResponses[i]);
    }
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should get the data sources for a sector", async () => {
    const req = mockRequest();
    const res = await getDataSourcesForSector(req, {
      params: { inventoryId: inventory.inventoryId, sectorId: sector.sectorId },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.length, 1);
    const { source } = data[0];
    assert.equal(source.name, "XX_DATASOURCE_TEST_0");
    assert.equal(source.sectorId, sector.sectorId);
    assert.equal(source.apiEndpoint, apiEndpoint);
    assert.equal(source.geographicalLocation, "EARTH");
    assert.equal(source.startYear, 4000);
    assert.equal(source.endYear, 4010);
  });

  it("should get the data sources for all sectors", async () => {
    const req = mockRequest();
    const res = await getAllDataSources(req, {
      params: { inventoryId: inventory.inventoryId },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.length, 2);
  });

  it.todo("should apply data sources");
});
