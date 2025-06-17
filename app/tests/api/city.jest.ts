import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  jest,
} from "@jest/globals";
import {
  DELETE as deleteCity,
  GET as findCity,
  PATCH as updateCity,
} from "@/app/api/v0/city/[city]/route";
import { GET as getAllCities } from "@/app/api/v0/admin/all-cities/route";
import { POST as createCity } from "@/app/api/v0/city/route";
import { db } from "@/models";
import { CreateCityRequest } from "@/util/validation";
import assert from "node:assert";
import { mockRequest, setupTests, testUserID } from "../helpers";
import { City } from "@/models/City";
import { randomUUID } from "node:crypto";
import { AppSession, Auth } from "@/lib/auth";
import { User } from "@/models/User";
import { Roles } from "@/util/types";
import { Project } from "@/models/Project";

const cityData: Omit<CreateCityRequest, "projectId"> = {
  locode: "XX_CITY",
  name: "Test City",
  country: "Test Country",
  region: "Test Region",
  area: 1337,
};

const city2: Omit<CreateCityRequest, "projectId"> = {
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

const mockSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};

const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};

const emptyParams = { params: Promise.resolve({}) };

describe("City API", () => {
  let city: City;
  let user: User;
  let project: Project;

  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    [user] = await db.models.User.upsert({
      userId: testUserID,
      name: "TEST_USER",
    });

    Auth.getServerSession = jest.fn(() => Promise.resolve(mockSession));

    project = (await Project.findOne({
      where: { name: "cc_project_default" },
    })) as Project;
  });

  beforeEach(async () => {
    await db.models.City.destroy({ where: { locode: cityData.locode } });

    city = await db.models.City.create({
      ...cityData,
      cityId: randomUUID(),
      projectId: project.projectId,
    });
    await city.addUser(user);
  });

  afterAll(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  it("should create a city", async () => {
    await db.models.City.destroy({ where: { locode: cityData.locode } });

    const req = mockRequest({ ...cityData, projectId: project?.projectId });
    const res = await createCity(req, emptyParams);
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.locode, cityData.locode);
    assert.equal(data.name, cityData.name);
    assert.equal(data.country, cityData.country);
    assert.equal(data.region, cityData.region);
    assert.equal(data.area, cityData.area);
  });

  it("should not create a city with invalid data", async () => {
    const req = mockRequest(invalidCity);
    const res = await createCity(req, emptyParams);
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 5);
  });

  it("should find a city", async () => {
    const req = mockRequest();
    const res = await findCity(req, {
      params: Promise.resolve({ city: city.cityId }),
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.locode, cityData.locode);
    assert.equal(data.name, cityData.name);
    assert.equal(data.country, cityData.country);
    assert.equal(data.region, cityData.region);
    assert.equal(data.area, cityData.area);
  });

  it("should prevent unauthorized access to all city data", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockSession));
    const req = mockRequest();
    const res = await getAllCities(req, emptyParams);
    assert.equal(res.status, 403);
  });

  it("should get all cities for admin", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    const req = mockRequest();
    const res = await getAllCities(req, emptyParams);
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.notEqual(data.length, 0);
  });

  it("should not find a non-existing city", async () => {
    const req = mockRequest();
    const res = await findCity(req, {
      params: Promise.resolve({ city: randomUUID() }),
    });
    assert.equal(res.status, 404);
  });

  it("should update a city", async () => {
    const req = mockRequest({ ...city2, projectId: project.projectId });
    const res = await updateCity(req, {
      params: Promise.resolve({ city: city.cityId }),
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.locode, city2.locode);
    assert.equal(data.name, city2.name);
    assert.equal(data.country, city2.country);
    assert.equal(data.region, city2.region);
    assert.equal(data.area, city2.area);
  });

  it("should not update a city with invalid values", async () => {
    const req = mockRequest(invalidCity);
    const res = await updateCity(req, {
      params: Promise.resolve({ city: city.cityId }),
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 5);
  });

  it("should delete a city", async () => {
    const req = mockRequest();
    const res = await deleteCity(req, {
      params: Promise.resolve({ city: city.cityId }),
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.locode, cityData.locode);
    assert.equal(data.name, cityData.name);
    assert.equal(data.country, cityData.country);
    assert.equal(data.region, cityData.region);
    assert.equal(data.area, cityData.area);
  });

  it("should not delete a non-existing city", async () => {
    const req = mockRequest();
    const res = await deleteCity(req, {
      params: Promise.resolve({ city: randomUUID() }),
    });
    assert.equal(res.status, 404);
  });
});
