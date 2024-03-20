import { POST as savePopulations } from "@/app/api/v0/city/[city]/population/route";
import { db } from "@/models";
import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { mockRequest, setupTests, testUserID } from "../helpers";
import { CreatePopulationRequest } from "@/util/validation";
import { Op } from "sequelize";
import { keyBy } from "@/util/helpers";

const cityId = "76bb1ab7-5177-45a1-a61f-cfdee9c448e8";

const validPopulationUpdate: CreatePopulationRequest = {
  cityId,
  cityPopulation: 1,
  cityPopulationYear: 1337,
  regionPopulation: 2,
  regionPopulationYear: 1338,
  countryPopulation: 3,
  countryPopulationYear: 1339,
};

const overlappingPopulationUpdate: CreatePopulationRequest = {
  cityId,
  cityPopulation: 4,
  cityPopulationYear: 1340,
  regionPopulation: 5,
  regionPopulationYear: 1340,
  countryPopulation: 6,
  countryPopulationYear: 1340,
};

const invalidPopulationUpdate: CreatePopulationRequest = {
  cityId,
  cityPopulation: -4,
  cityPopulationYear: -1340,
  regionPopulation: -5,
  regionPopulationYear: -1340,
  countryPopulation: -6,
  countryPopulationYear: -1340,
};

describe("Population API", () => {
  before(async () => {
    setupTests();
    await db.initialize();
    await db.models.Population.destroy({ where: { cityId } });
    await db.models.City.destroy({ where: { cityId } });
    const city = await db.models.City.create({
      cityId,
      name: "Population Test City",
    });
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should save correct population information", async () => {
    const req = mockRequest(validPopulationUpdate);
    const res = await savePopulations(req, { params: { city: cityId } });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.notEqual(data.data.cityPopulation, null);
    assert.notEqual(data.data.regionPopulation, null);
    assert.notEqual(data.data.countryPopulation, null);
    const populations = await db.models.Population.findAll({
      where: { cityId, year: { [Op.in]: [1337, 1338, 1339] } },
    });
    assert.equal(populations.length, 3);
    const populationByYear = keyBy(populations, (p) => p.year.toString());
    assert.equal(populationByYear["1337"].population, 1);
    assert.equal(populationByYear["1338"].regionPopulation, 2);
    assert.equal(populationByYear["1339"].countryPopulation, 3);
  });

  it("should correctly save population information for the same year", async () => {
    const req = mockRequest(overlappingPopulationUpdate);
    const res = await savePopulations(req, { params: { city: cityId } });
    assert.equal(res.status, 200);
    const data = await res.json();
    console.log("datalol", data);
    assert.notEqual(data.data.cityPopulation, null);
    assert.notEqual(data.data.regionPopulation, null);
    assert.notEqual(data.data.countryPopulation, null);
    const populations = await db.models.Population.findAll({
      where: { cityId, year: 1340 },
    });
    assert.equal(populations.length, 1);
    console.dir(populations[0].dataValues);
    assert.equal(populations[0].population, 4);
    assert.equal(populations[0].regionPopulation, 5);
    assert.equal(populations[0].countryPopulation, 6);
  });

  it("should not save invalid population information", async () => {
    const req = mockRequest(invalidPopulationUpdate);
    const res = await savePopulations(req, { params: { city: cityId } });
    assert.equal(res.status, 400);
    const populations = await db.models.Population.findAll({
      where: { cityId, year: -1340 },
    });
    assert.equal(populations.length, 0);
  });
});
