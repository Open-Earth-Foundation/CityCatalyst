import { POST as savePopulations } from "@/app/api/v0/city/[city]/population/route";
import { db } from "@/models";
import { mockRequest, setupTests, testUserID } from "../helpers";
import { CreatePopulationRequest } from "@/util/validation";
import { Op } from "sequelize";
import { keyBy } from "@/util/helpers";
import { describe, expect, beforeAll, afterAll, it } from "@jest/globals";

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
  beforeAll(async () => {
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

  afterAll(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should save correct population information", async () => {
    const req = mockRequest(validPopulationUpdate);
    const res = await savePopulations(req, { params: { city: cityId } });
    expect(res.status).toEqual(200);
    const data = await res.json();

    expect(data.data.cityPopulation.population).toEqual(
      validPopulationUpdate.cityPopulation,
    );
    expect(data.data.cityPopulation.year).toEqual(
      validPopulationUpdate.cityPopulationYear,
    );
    expect(data.data.regionPopulation.regionPopulation).toEqual(
      validPopulationUpdate.regionPopulation,
    );
    expect(data.data.regionPopulation.year).toEqual(
      validPopulationUpdate.regionPopulationYear,
    );
    expect(data.data.countryPopulation.countryPopulation).toEqual(
      validPopulationUpdate.countryPopulation,
    );
    expect(data.data.countryPopulation.year).toEqual(
      validPopulationUpdate.countryPopulationYear,
    );

    const populations = await db.models.Population.findAll({
      where: { cityId, year: { [Op.in]: [1337, 1338, 1339] } },
    });
    expect(populations.length).toEqual(3);
    const populationByYear = keyBy(populations, (p) => p.year.toString());
    expect(populationByYear["1337"].population).toEqual(1);
    expect(populationByYear["1338"].regionPopulation).toEqual(2);
    expect(populationByYear["1339"].countryPopulation).toEqual(3);
  });

  it("should correctly save population information for the same year", async () => {
    const req = mockRequest(overlappingPopulationUpdate);
    const res = await savePopulations(req, { params: { city: cityId } });
    expect(res.status).toEqual(200);
    const data = await res.json();

    expect(data.data.cityPopulation.population).toEqual(
      overlappingPopulationUpdate.cityPopulation,
    );
    expect(data.data.cityPopulation.year).toEqual(
      overlappingPopulationUpdate.cityPopulationYear,
    );
    expect(data.data.regionPopulation.regionPopulation).toEqual(
      overlappingPopulationUpdate.regionPopulation,
    );
    expect(data.data.regionPopulation.year).toEqual(
      overlappingPopulationUpdate.regionPopulationYear,
    );
    expect(data.data.countryPopulation.countryPopulation).toEqual(
      overlappingPopulationUpdate.countryPopulation,
    );
    expect(data.data.countryPopulation.year).toEqual(
      overlappingPopulationUpdate.countryPopulationYear,
    );

    const populations = await db.models.Population.findAll({
      where: { cityId, year: 1340 },
    });
    expect(populations.length).toEqual(1);
    expect(populations[0].population).toEqual(4);
    expect(populations[0].regionPopulation).toEqual(5);
    expect(populations[0].countryPopulation).toEqual(6);
  });

  it("should not save invalid population information", async () => {
    const req = mockRequest(invalidPopulationUpdate);
    const res = await savePopulations(req, { params: { city: cityId } });
    expect(res.status).toEqual(400);
    const populations = await db.models.Population.findAll({
      where: { cityId, year: -1340 },
    });
    expect(populations.length).toEqual(0);
  });
});
