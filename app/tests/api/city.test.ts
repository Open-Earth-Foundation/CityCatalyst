import {
  DELETE as deleteCity,
  GET as findCity,
  PATCH as updateCity,
} from "@/app/api/v0/city/[city]/route";
import { POST as createCity } from "@/app/api/v0/city/route";
import { db } from "@/models";
import { CreateCityRequest } from "@/util/validation";
import env from "@next/env";
import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { createRequest } from "../helpers";

const city: CreateCityRequest = {
  locode: "XX_CITY",
  name: "Test City",
  country: "Test Country",
  region: "Test Region",
  area: 1337,
};

const city2: CreateCityRequest = {
  locode: "XX_CITY",
  name: "Test City 2",
  country: "Test Country 2",
  region: "Test Region 2",
  area: 1338,
};

const invalidCity = {
  locode: "",
  name: "",
  country: 4,
  region: 6,
  area: "",
};

describe("City API", () => {
  before(async () => {
    const projectDir = process.cwd();
    env.loadEnvConfig(projectDir);
    await db.initialize();
    await db.models.City.destroy({ where: { locode: city.locode } });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should create a city", async () => {
    const url = "http://localhost:3000/api/v0/city";
    const req = createRequest(url, city);
    const res = await createCity(req, { params: {} });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.locode, city.locode);
    assert.equal(data.name, city.name);
    assert.equal(data.country, city.country);
    assert.equal(data.region, city.region);
    assert.equal(data.area, city.area);
  });

  it("should not create a city with invalid data", async () => {
    const url = "http://localhost:3000/api/v0/city";
    const req = createRequest(url, invalidCity);
    const res = await createCity(req, { params: {} });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 5);
  });

  it("should find a city", async () => {
    const url = "http://localhost:3000/api/v0/city/" + city.locode;
    const req = createRequest(url);
    const res = await findCity(req, { params: { city: city.locode } });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.locode, city.locode);
    assert.equal(data.name, city.name);
    assert.equal(data.country, city.country);
    assert.equal(data.region, city.region);
    assert.equal(data.area, city.area);
  });

  it("should not find a non-existing city", async () => {
    const url = "http://localhost:3000/api/v0/city/XX_INVALID";
    const req = createRequest(url);
    const res = await findCity(req, { params: { city: "XX_INVALID" } });
    assert.equal(res.status, 404);
  });

  it("should update a city", async () => {
    const url = "http://localhost:3000/api/v0/city/" + city.locode;
    const req = createRequest(url, city2);
    const res = await updateCity(req, { params: { city: city.locode } });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.locode, city2.locode);
    assert.equal(data.name, city2.name);
    assert.equal(data.country, city2.country);
    assert.equal(data.region, city2.region);
    assert.equal(data.area, city2.area);
  });

  it("should not update a city with invalid values", async () => {
    const url = "http://localhost:3000/api/v0/city/" + city.locode;
    const req = createRequest(url, invalidCity);
    const res = await updateCity(req, { params: { city: city.locode } });
    assert.equal(res.status, 400);
    const { error: { issues } } = await res.json();
    assert.equal(issues.length, 5);
  });

  it("should delete a city", async () => {
    const url = "http://localhost:3000/api/v0/city/" + city.locode;
    const req = createRequest(url);
    const res = await deleteCity(req, { params: { city: city.locode } });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.locode, city2.locode);
    assert.equal(data.name, city2.name);
    assert.equal(data.country, city2.country);
    assert.equal(data.region, city2.region);
    assert.equal(data.area, city2.area);
  });

  it("should not delete a non-existing city", async () => {
    const url = "http://localhost:3000/api/v0/city/XX_INVALID";
    const req = createRequest(url);
    const res = await deleteCity(req, { params: { city: "XX_INVALID" } });
    assert.equal(res.status, 404);
  });
});
