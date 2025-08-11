import { db } from "@/models";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  jest,
} from "@jest/globals";
import { setupTests, mockRequest } from "../helpers";
import {
  createTestData,
  cleanupTestData,
  createCityWithoutProject,
  TestData,
} from "../helpers/testDataCreationHelper";
import { GET } from "@/app/api/v0/city/[city]/modules/[module]/access/route";
import { ModuleAccessService } from "@/backend/ModuleAccessService";
import { randomUUID } from "crypto";
import { AppSession, Auth } from "@/lib/auth";
import { Roles } from "@/util/types";

describe("City Module Access Route", () => {
  const testModuleId = "077690c6-6fa3-44e1-84b7-6d758a6a4d88";
  let testData: TestData;
  let mockHasModuleAccess: jest.SpiedFunction<
    typeof ModuleAccessService.hasModuleAccess
  >;
  let mockAdminSession: AppSession;
  let mockUserSession: AppSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    testData = await createTestData();

    // Create test sessions
    mockAdminSession = {
      user: { id: testData.userId, role: Roles.Admin },
      expires: "1h",
    };

    mockUserSession = {
      user: { id: testData.userId, role: Roles.User },
      expires: "1h",
    };
  });

  afterAll(async () => {
    await cleanupTestData(testData);

    if (db.sequelize) await db.sequelize.close();
  });

  beforeEach(() => {
    mockHasModuleAccess = jest.spyOn(ModuleAccessService, "hasModuleAccess");
    mockHasModuleAccess.mockClear();
  });

  it("should return module access data when city and module exist and user is admin", async () => {
    mockHasModuleAccess.mockResolvedValue(true);

    // Mock authentication for admin
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockAdminSession);

    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({
        city: testData.cityId,
        module: testModuleId,
      }),
    };
    const response = await GET(req, ctx);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ data: { hasAccess: true } });
    expect(mockHasModuleAccess).toHaveBeenCalledWith(
      testData.projectId,
      testModuleId,
    );
  });

  it("should return module access data when user has access to the city", async () => {
    mockHasModuleAccess.mockResolvedValue(true);

    // Create a city user association
    await db.models.CityUser.create({
      cityUserId: randomUUID(),
      userId: testData.userId,
      cityId: testData.cityId,
    });

    // Mock authentication for regular user
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockUserSession);

    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({
        city: testData.cityId,
        module: testModuleId,
      }),
    };
    const response = await GET(req, ctx);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ data: { hasAccess: true } });
    expect(mockHasModuleAccess).toHaveBeenCalledWith(
      testData.projectId,
      testModuleId,
    );

    // Cleanup
    await db.models.CityUser.destroy({
      where: { userId: testData.userId, cityId: testData.cityId },
    });
  });

  it("should return 401 when user has no access to the city", async () => {
    // Mock authentication for regular user
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockUserSession);

    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({
        city: testData.cityId,
        module: testModuleId,
      }),
    };
    const response = await GET(req, ctx);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.message).toMatch(/User is not part of this city/);
  });

  it("should return 401 when no session is provided", async () => {
    // Mock authentication for no session
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(null);

    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({
        city: testData.cityId,
        module: testModuleId,
      }),
    };
    const response = await GET(req, ctx);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.message).toMatch(/Not signed in/);
  });

  it("should return module access data when access is denied", async () => {
    mockHasModuleAccess.mockResolvedValue(false);

    // Mock authentication for admin
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockAdminSession);

    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({
        city: testData.cityId,
        module: testModuleId,
      }),
    };
    const response = await GET(req, ctx);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ data: { hasAccess: false } });
    expect(mockHasModuleAccess).toHaveBeenCalledWith(
      testData.projectId,
      testModuleId,
    );
  });

  it("should return 404 when city is not found", async () => {
    // Mock authentication for admin
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockAdminSession);

    const req = mockRequest();
    const nonExistentCityId = randomUUID();
    const ctx = {
      params: Promise.resolve({
        city: nonExistentCityId,
        module: testModuleId,
      }),
    };
    const response = await GET(req, ctx);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.message).toMatch(/City not found/);
  });

  it("should return 500 when city has no project", async () => {
    // Mock authentication for admin
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockAdminSession);

    const cityWithoutProject = await createCityWithoutProject();
    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({
        city: cityWithoutProject,
        module: testModuleId,
      }),
    };
    const response = await GET(req, ctx);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error.message).toMatch(/Internal server error/);

    await db.models.City.destroy({ where: { cityId: cityWithoutProject } });
  });

  it("should return 400 when moduleId is missing", async () => {
    // Mock authentication for admin
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockAdminSession);

    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({ city: testData.cityId, module: "" }),
    };
    const response = await GET(req, ctx);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toMatch(/Invalid request/);
  });

  it("should return 500 and error message when service throws", async () => {
    mockHasModuleAccess.mockRejectedValue(new Error("Database error"));

    // Mock authentication for admin
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockAdminSession);

    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({
        city: testData.cityId,
        module: testModuleId,
      }),
    };
    const response = await GET(req, ctx);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error.message).toMatch(/Internal server error/);
  });
});
