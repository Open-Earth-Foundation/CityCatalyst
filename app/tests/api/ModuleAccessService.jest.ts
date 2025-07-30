import { db } from "@/models";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
} from "@jest/globals";
import { setupTests } from "../helpers";
import {
  createTestData,
  cleanupTestData,
  createTestModule,
  associateProjectWithModule,
  TestData,
} from "../helpers/testDataCreationHelper";
import { ModuleAccessService } from "@/backend/ModuleAccessService";
import { randomUUID } from "crypto";

describe("ModuleAccessService", () => {
  let testData: TestData;
  let testModuleId: string;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    testData = await createTestData();
    testModuleId = await createTestModule();
  });

  afterAll(async () => {
    // Clean up test data
    await db.models.ProjectModules.destroy({
      where: { projectId: testData.projectId },
    });
    await db.models.Module.destroy({ where: { id: testModuleId } });
    await cleanupTestData(testData);
    if (db.sequelize) await db.sequelize.close();
  });

  beforeEach(async () => {
    // Clean up any project-module associations before each test
    await db.models.ProjectModules.destroy({
      where: { projectId: testData.projectId },
    });
  });

  describe("hasModuleAccess", () => {
    it("should return false when project does not exist", async () => {
      const result = await ModuleAccessService.hasModuleAccess(
        randomUUID(),
        testModuleId,
      );
      expect(result).toBe(false);
    });

    it("should return false when module does not exist", async () => {
      const result = await ModuleAccessService.hasModuleAccess(
        testData.projectId,
        randomUUID(),
      );
      expect(result).toBe(false);
    });

    it("should return false when project has no access to module", async () => {
      const result = await ModuleAccessService.hasModuleAccess(
        testData.projectId,
        testModuleId,
      );
      expect(result).toBe(false);
    });

    it("should return true when project has access to module", async () => {
      await associateProjectWithModule(testData.projectId, testModuleId);
      const result = await ModuleAccessService.hasModuleAccess(
        testData.projectId,
        testModuleId,
      );
      expect(result).toBe(true);
    });

    it("should return false when module access has expired", async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday
      await db.models.ProjectModules.create({
        projectId: testData.projectId,
        moduleId: testModuleId,
        expiresOn: expiredDate,
      });
      const result = await ModuleAccessService.hasModuleAccess(
        testData.projectId,
        testModuleId,
      );
      expect(result).toBe(false);
    });

    it("should return true when module access has not expired", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow
      await db.models.ProjectModules.create({
        projectId: testData.projectId,
        moduleId: testModuleId,
        expiresOn: futureDate,
      });
      const result = await ModuleAccessService.hasModuleAccess(
        testData.projectId,
        testModuleId,
      );
      expect(result).toBe(true);
    });

    it("should return true when module access has no expiration date", async () => {
      await associateProjectWithModule(testData.projectId, testModuleId);
      const result = await ModuleAccessService.hasModuleAccess(
        testData.projectId,
        testModuleId,
      );
      expect(result).toBe(true);
    });

    it("should handle database errors gracefully", async () => {
      const invalidProjectId = "01985bb0-2304-726f-b9c2-5026d6a76973";
      const invalidModuleId = "01985bb0-2304-726f-b9c2-5026d6a76973";
      const result = await ModuleAccessService.hasModuleAccess(
        invalidProjectId,
        invalidModuleId,
      );
      expect(result).toBe(false);
    });
  });
});
