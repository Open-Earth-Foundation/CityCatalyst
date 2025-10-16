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
} from "@/app/api/v1/city/[city]/route";
import { GET as getAllCities } from "@/app/api/v1/admin/all-cities/route";
import { POST as createCity } from "@/app/api/v1/city/route";
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

// Test users with different permission levels
const collaboratorUserId = randomUUID();
const orgAdminUserId = randomUUID();

const collaboratorSession: AppSession = {
  user: { id: collaboratorUserId, role: Roles.User },
  expires: "1h",
};

const orgAdminSession: AppSession = {
  user: { id: orgAdminUserId, role: Roles.User },
  expires: "1h",
};

const systemAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};

const emptyParams = { params: Promise.resolve({}) };

describe("City API", () => {
  let city: City;
  let collaboratorUser: User;
  let orgAdminUser: User;
  let project: Project;
  let organizationId: string;

  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    // Create test users
    [collaboratorUser] = await db.models.User.upsert({
      userId: collaboratorUserId,
      name: "COLLABORATOR_USER",
    });
    [orgAdminUser] = await db.models.User.upsert({
      userId: orgAdminUserId,
      name: "ORG_ADMIN_USER",
    });

    project = (await Project.findOne({
      where: { name: "cc_project_default" },
    })) as Project;

    if (!project) {
      throw new Error("Default project not found. Test setup incomplete.");
    }

    // Get the organization ID from the project
    const projectWithOrg = await db.models.Project.findByPk(project.projectId, {
      include: [{
        model: db.models.Organization,
        as: 'organization',
        attributes: ['organizationId']
      }]
    });
    organizationId = projectWithOrg?.organization?.organizationId as string;

    if (!organizationId) {
      throw new Error("Could not find organization for default project");
    }

    // Make orgAdminUser an organization admin
    await db.models.OrganizationAdmin.create({
      organizationAdminId: randomUUID(),
      userId: orgAdminUserId,
      organizationId: organizationId
    });
  });

  beforeEach(async () => {
    // Clean up any existing test city from previous test runs
    if (city) {
      try {
        // Clear any users that have this city as their default before deleting
        await db.models.User.update(
          { defaultCityId: null },
          { where: { defaultCityId: city.cityId } },
        );
        await city.destroy();
      } catch (error) {
        // Ignore errors if city was already deleted
      }
    }

    city = await db.models.City.create({
      ...cityData,
      cityId: randomUUID(),
      projectId: project.projectId,
    });
    await city.addUser(collaboratorUser);
  });

  afterAll(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  it("should create a city as org admin", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(orgAdminSession));

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

  it("should reject city creation as collaborator", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(collaboratorSession));

    const req = mockRequest({ ...cityData, projectId: project?.projectId });
    const res = await createCity(req, emptyParams);
    assert.equal(res.status, 403);
    const { error } = await res.json();
    assert.equal(error.message, "You do not have access to this project");
  });

  it("should not create a city with invalid data as org admin", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(orgAdminSession));

    const req = mockRequest(invalidCity);
    const res = await createCity(req, emptyParams);
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 5);
  });

  it("should find a city as org admin", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(orgAdminSession));

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

  it("should find a city as collaborator", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(collaboratorSession));

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

  it("should prevent unauthorized access to all city data as collaborator", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(collaboratorSession));
    const req = mockRequest();
    const res = await getAllCities(req, emptyParams);
    assert.equal(res.status, 403);
  });

  it("should get all cities for system admin", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(systemAdminSession));
    const req = mockRequest();
    const res = await getAllCities(req, emptyParams);
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.notEqual(data.length, 0);
  });

  it("should not find a non-existing city as org admin", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(orgAdminSession));

    const req = mockRequest();
    const res = await findCity(req, {
      params: Promise.resolve({ city: randomUUID() }),
    });
    assert.equal(res.status, 404);
  });

  it("should return 404 for non-existing city as collaborator", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(collaboratorSession));

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
