import { POST as createCity } from "@/app/api/v0/city/route";
import { db } from "@/models";
import { CreateCityRequest } from "@/util/validation";
import { NextRequest } from "next/server";
import assert from "node:assert";
import { after, before, describe, it, mock } from "node:test";

import env from "@next/env";

const cityRequest: CreateCityRequest = {
  locode: "XX_CITY",
  name: "Test City",
  country: "Test Country",
  region: "Test Region",
  area: 1337,
};
const emptyProps = { params: {} };

export function makeRequest(url: string, body: any) {
  const request = new NextRequest(new URL(url));
  request.json = mock.fn(() => Promise.resolve(body));
  return request;
}

describe("City API", () => {
  before(async () => {
    const projectDir = process.cwd();
    env.loadEnvConfig(projectDir);
    await db.initialize();
    await db.models.City.destroy({ where: { locode: cityRequest.locode } });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should create a city", async () => {
    const url = 'http://localhost:3000/api/v0/city';
    const req = makeRequest(url, cityRequest);
    const res = await createCity(req, emptyProps);
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.name, cityRequest.name);
    assert.equal(data.country, cityRequest.country);
    assert.equal(data.region, cityRequest.region);
    assert.equal(data.area, cityRequest.area);
  });
});
