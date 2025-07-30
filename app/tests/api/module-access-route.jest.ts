import { db } from "@/models";
import { beforeAll, afterAll, beforeEach, describe, it, expect, jest } from "@jest/globals";
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


describe("Module Access Route", () => {
  const testModuleId = "077690c6-6fa3-44e1-84b7-6d758a6a4d88";
  let testData: TestData;
  let mockHasModuleAccess: jest.SpiedFunction<
    typeof ModuleAccessService.hasModuleAccess
  >;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    testData = await createTestData();
  });

  afterAll(async () => {
    await cleanupTestData(testData);

    if (db.sequelize) await db.sequelize.close();
  });

  beforeEach(() => {
    mockHasModuleAccess = jest.spyOn(ModuleAccessService, "hasModuleAccess");
    mockHasModuleAccess.mockClear();
  });

  it("should return module access data when city and module exist", async () => {
    mockHasModuleAccess.mockResolvedValue(true);
    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({ city: testData.cityId, module: testModuleId }),
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

  it("should return module access data when access is denied", async () => {
    mockHasModuleAccess.mockResolvedValue(false);
    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({ city: testData.cityId, module: testModuleId }),
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

  it("should return 404 when city has no project", async () => {
    const cityWithoutProject = await createCityWithoutProject();
    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({
        city: cityWithoutProject,
        module: testModuleId,
      }),
    };
    const response = await GET(req, ctx);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.message).toMatch(/City not found/);

    await db.models.City.destroy({ where: { cityId: cityWithoutProject } });
  });

  it("should return 400 when moduleId is missing", async () => {
    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({ city: testData.cityId, module: "" }),
    };
    const response = await GET(req, ctx);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.message).toMatch(/ModuleId is missing/);
  });

  it("should return 500 and error message when service throws", async () => {
    mockHasModuleAccess.mockRejectedValue(new Error("Database error"));
    const req = mockRequest();
    const ctx = {
      params: Promise.resolve({ city: testData.cityId, module: testModuleId }),
    };
    const response = await GET(req, ctx);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error.message).toMatch(/Internal server error/);
  });
}); 