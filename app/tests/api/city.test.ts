import { POST as createCity } from "@/app/api/v0/city/route";
import {
  GET as findCity,
  PATCH as updateCity,
  DELETE as deleteCity,
} from "@/app/api/v0/city/[city]/route";
import { db } from "@/models";
import { CreateCityRequest } from "@/util/validation";
import { NextRequest } from "next/server";
import assert from "node:assert";
import { after, before, describe, it, mock } from "node:test";

import env from "@next/env";

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

export function makeRequest(url: string, body?: any) {
  const request = new NextRequest(new URL(url));
  request.json = mock.fn(() => Promise.resolve(body));
  return request;
}

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
    const req = makeRequest(url, city);
    const res = await createCity(req, { params: {} });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.locode, city.locode);
    assert.equal(data.name, city.name);
    assert.equal(data.country, city.country);
    assert.equal(data.region, city.region);
    assert.equal(data.area, city.area);
  });

  it("should find a city", async () => {
    const url = "http://localhost:3000/api/v0/city/" + city.locode;
    const req = makeRequest(url);
    const res = await findCity(req, { params: { city: city.locode } });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.locode, city.locode);
    assert.equal(data.name, city.name);
    assert.equal(data.country, city.country);
    assert.equal(data.region, city.region);
    assert.equal(data.area, city.area);
  });

  it("should update a city", async () => {
    const url = "http://localhost:3000/api/v0/city/" + city.locode;
    const req = makeRequest(url, city2);
    const res = await updateCity(req, { params: { city: city.locode } });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.locode, city2.locode);
    assert.equal(data.name, city2.name);
    assert.equal(data.country, city2.country);
    assert.equal(data.region, city2.region);
    assert.equal(data.area, city2.area);
  });

  it("should delete a city", async () => {
    const url = "http://localhost:3000/api/v0/city/" + city.locode;
    const req = makeRequest(url);
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
});
