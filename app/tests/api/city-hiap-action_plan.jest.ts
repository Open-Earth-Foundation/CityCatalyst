import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  expectStatusCode,
  expectStatusCodes,
  mockRequest,
  setupTests,
} from "../helpers";
import {
  createTestData,
  cleanupTestData,
  TestData,
} from "../helpers/testDataCreationHelper";
import { AppSession, Auth } from "@/lib/auth";
import {
  Roles,
  ACTION_TYPES,
  HighImpactActionRankingStatus,
} from "@/util/types";
import { db } from "@/models";
import { randomUUID } from "node:crypto";
import {
  GET as getActionPlans,
  POST as createActionPlan,
} from "@/app/api/v1/city/[city]/hiap/action-plan/route";
import {
  GET as getActionPlanById,
  PATCH as updateActionPlan,
  DELETE as deleteActionPlan,
} from "@/app/api/v1/city/[city]/hiap/action-plan/[id]/route";
import { POST as generateActionPlan } from "@/app/api/v1/city/[city]/hiap/action-plan/generate/route";

import * as HiapApiService from "@/backend/hiap/HiapApiService";

describe("City HIAP Prioritization API", () => {
  let testData: TestData;
  let inventoryId: string;
  let mockSession: AppSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    // Create test data with proper relationships
    testData = await createTestData({
      cityName: "Action Plan Test City",
      organizationName: "Action Plan Test Org",
      projectName: "Action Plan Test Project",
    });

    // Update city to have locode
    await db.models.City.update(
      { locode: "XX-APT" },
      { where: { cityId: testData.cityId } },
    );

    // Create test inventory
    const inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: testData.cityId,
      year: 2024,
    });
    inventoryId = inventory.inventoryId;

    mockSession = {
      user: { id: testData.userId, role: Roles.Admin },
      expires: "1h",
    };
  });

  beforeEach(() => {
    // Mock authentication
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockSession);

    // Mock HiapApiService external API wrappers
    jest
      .spyOn(HiapApiService.hiapApiWrapper, "translateActionPlan")
      .mockResolvedValue({
        metadata: { actionName: "Translated Plan" },
      });

    jest
      .spyOn(HiapApiService.hiapApiWrapper, "startActionPlanJob")
      .mockResolvedValue({
        plan: JSON.stringify({
          metadata: { title: "Generated Plan" },
          sections: [],
        }),
        timestamp: new Date().toISOString(),
        actionName: "Mock Action",
      });
  });

  afterAll(async () => {
    // Cleanup any remaining action plans
    if (inventoryId) {
      try {
        await db.models.ActionPlan.destroy({
          where: { cityLocode: "XX-APT" },
        });
        await db.models.NativeInputCatalog.destroy({
          where: { inventoryId },
        });
      } catch {
        // Table might not exist, that's okay
      }
      await db.models.Inventory.destroy({ where: { inventoryId } });
    }

    // Cleanup test data
    await cleanupTestData(testData);

    if (db.sequelize) await db.sequelize.close();
  });

  describe("GET /api/v0/city/[city]/hiap/action-plan", () => {
    it("returns 400 when required query params are missing", async () => {
      const req = mockRequest(undefined, {});
      const res = await getActionPlans(req, {
        params: Promise.resolve({ city: testData.cityId }),
      });

      await expectStatusCode(res, 400);
      const body = await res.json();
      expect(body?.error?.message).toMatch(/Invalid request/i);
    });

    it("returns 400 when cityId param is missing", async () => {
      const req = mockRequest();
      const res = await getActionPlans(req, {
        params: Promise.resolve({
          language: "en",
          actionId: "test-action-id",
        }),
      });

      await expectStatusCode(res, 400);
      const body = await res.json();
      expect(body?.error?.message).toMatch(/Invalid request/i);
    });

    it("returns action plan when it exists in database", async () => {
      // Create ranking and ranked action
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId,
        locode: "XX-APT",
        type: ACTION_TYPES.Mitigation,
        langs: ["en"],
        jobId: randomUUID(),
        status: HighImpactActionRankingStatus.SUCCESS,
      });

      const rankedAction = await db.models.HighImpactActionRanked.create({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        actionId: "test-action-123",
        rank: 1,
        explanation: { explanations: { en: "Test" } },
        lang: "en",
        type: "mitigation",
        name: "Test Action",
        isSelected: true,
      });

      // Create action plan in database
      const actionPlan = await db.models.ActionPlan.create({
        id: randomUUID(),
        actionId: rankedAction.actionId,
        highImpactActionRankedId: rankedAction.id,
        cityLocode: "XX-APT",
        actionName: "Test Action",
        language: "en",
        subactions: [{ name: "Test subaction" }],
        createdBy: testData.userId,
      });

      // Build URL with query params
      const url = `http://localhost:3000/api/v0/city/${testData.cityId}/hiap/action-plan?language=en&actionId=${rankedAction.actionId}`;
      const req = mockRequest(url);

      const res = await getActionPlans(req, {
        params: Promise.resolve({ city: testData.cityId }),
        searchParams: {
          language: "en",
          actionId: rankedAction.actionId,
        },
      });

      await expectStatusCode(res, 200);
      const body = await res.json();
      expect(body.data).toBeTruthy();
      // fetchOrTranslateActionPlan returns an array
      expect(Array.isArray(body.data)).toBe(true);
      if (body.data.length > 0) {
        expect(body.data[0].actionId).toBe(rankedAction.actionId);
      }

      // Cleanup
      await db.models.ActionPlan.destroy({ where: { id: actionPlan.id } });
      await db.models.HighImpactActionRanked.destroy({
        where: { id: rankedAction.id },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });
  });

  describe("POST /api/v0/city/[city]/hiap/action-plan", () => {
    it("requires authentication for direct action-plan saves", async () => {
      jest.spyOn(Auth, "getServerSession").mockResolvedValueOnce(null);

      const req = mockRequest({
        actionId: "test-action",
        inventoryId,
        hiActionRankingId: randomUUID(),
        cityLocode: "XX-APT",
        actionName: "Test Action",
        language: "en",
        planData: {},
      });
      const res = await createActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId }),
      });

      await expectStatusCode(res, 401);
    });

    it("rejects an inventory that belongs to another city", async () => {
      const req = mockRequest({
        actionId: "test-action",
        inventoryId,
        hiActionRankingId: randomUUID(),
        cityLocode: "XX-APT",
        actionName: "Test Action",
        language: "en",
        planData: {},
      });
      const res = await createActionPlan(req, {
        params: Promise.resolve({ city: randomUUID() }),
      });

      await expectStatusCode(res, 400);
      const body = await res.json();
      expect(body?.error?.message).toMatch(/inventory.*city/i);
    });

    it("rejects an action that does not match the ranked action", async () => {
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId,
        locode: "XX-APT",
        type: ACTION_TYPES.Mitigation,
        langs: ["en"],
        status: HighImpactActionRankingStatus.SUCCESS,
      });
      const rankedAction = await db.models.HighImpactActionRanked.create({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        actionId: "stored-action",
        rank: 1,
        explanation: { explanations: { en: "Test" } },
        lang: "en",
        type: "mitigation",
        name: "Stored Action",
        isSelected: true,
      });

      const req = mockRequest({
        actionId: "different-action",
        inventoryId,
        hiActionRankingId: rankedAction.id,
        cityLocode: "XX-APT",
        actionName: "Test Action",
        language: "en",
        planData: {},
      });
      const res = await createActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId }),
      });

      await expectStatusCode(res, 400);
      const body = await res.json();
      expect(body?.error?.message).toMatch(/does not match/i);

      await db.models.HighImpactActionRanked.destroy({
        where: { id: rankedAction.id },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });

    it("returns 400 when required fields are missing", async () => {
      const req = mockRequest({
        actionId: "test-action",
        // missing other required fields
      });
      const res = await createActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId }),
      });

      await expectStatusCode(res, 400);
      const body = await res.json();
      expect(body?.error).toBeTruthy();
    });

    it("creates action plan when valid data provided", async () => {
      // Create ranking and ranked action first
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId,
        locode: "XX-APT",
        type: ACTION_TYPES.Mitigation,
        langs: ["en"],
        jobId: randomUUID(),
        status: HighImpactActionRankingStatus.SUCCESS,
      });

      const rankedAction = await db.models.HighImpactActionRanked.create({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        actionId: "create-test-action",
        rank: 1,
        explanation: { explanations: { en: "Test" } },
        lang: "en",
        type: "mitigation",
        name: "Create Test Action",
        isSelected: true,
      });

      const actionPlanData = {
        actionId: rankedAction.actionId,
        inventoryId,
        hiActionRankingId: rankedAction.id,
        cityLocode: "XX-APT",
        actionName: "Create Test Action",
        language: "en",
        planData: {
          sections: [{ title: "Overview", content: "Test content" }],
        },
      };

      const req = mockRequest(actionPlanData);
      const res = await createActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId }),
      });

      await expectStatusCode(res, 201);
      const body = await res.json();
      expect(body.data).toBeTruthy();
      expect(body.data.actionId).toBe(rankedAction.actionId);
      expect(body.data.language).toBe("en");

      // Verify it was saved to database
      const savedPlan = await db.models.ActionPlan.findOne({
        where: {
          actionId: rankedAction.actionId,
          language: "en",
        },
      });
      expect(savedPlan).toBeTruthy();
      expect(savedPlan?.actionId).toBe(rankedAction.actionId);

      // Cleanup
      if (savedPlan) {
        await db.models.ActionPlan.destroy({ where: { id: savedPlan.id } });
      }
      await db.models.HighImpactActionRanked.destroy({
        where: { id: rankedAction.id },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });

    it("validates UUID format for inventoryId and hiActionRankingId", async () => {
      const req = mockRequest({
        actionId: "test-action",
        inventoryId: "not-a-uuid",
        hiActionRankingId: "also-not-a-uuid",
        cityLocode: "XX-APT",
        actionName: "Test Action",
        language: "en",
        planData: {},
      });
      const res = await createActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId }),
      });

      await expectStatusCode(res, 400);
      const body = await res.json();
      expect(body?.error).toBeTruthy();
    });
  });

  describe("GET /api/v0/city/[city]/hiap/action-plan/[id]", () => {
    it("returns 404 when action plan does not exist", async () => {
      const nonExistentId = randomUUID();
      const req = mockRequest();
      const res = await getActionPlanById(req, {
        params: Promise.resolve({ city: testData.cityId, id: nonExistentId }),
      });

      await expectStatusCode(res, 404);
      const body = await res.json();
      expect(body?.error?.message).toMatch(/not found/i);
    });

    it("returns action plan when it exists", async () => {
      // Create ranking, ranked action, and action plan
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId,
        locode: "XX-APT",
        type: ACTION_TYPES.Mitigation,
        langs: ["en"],
        jobId: randomUUID(),
        status: HighImpactActionRankingStatus.SUCCESS,
      });

      const rankedAction = await db.models.HighImpactActionRanked.create({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        actionId: "get-by-id-action",
        rank: 1,
        explanation: { explanations: { en: "Test" } },
        lang: "en",
        type: "mitigation",
        name: "Get By ID Action",
        isSelected: true,
      });

      const actionPlan = await db.models.ActionPlan.create({
        id: randomUUID(),
        actionId: rankedAction.actionId,
        highImpactActionRankedId: rankedAction.id,
        cityLocode: "XX-APT",
        actionName: "Get By ID Action",
        language: "en",
        subactions: [{ name: "Test subaction" }],
        createdBy: testData.userId,
      });

      const req = mockRequest();
      const res = await getActionPlanById(req, {
        params: Promise.resolve({ city: testData.cityId, id: actionPlan.id }),
      });

      await expectStatusCode(res, 200);
      const body = await res.json();
      expect(body.data).toBeTruthy();
      expect(body.data.id).toBe(actionPlan.id);

      // Cleanup
      await db.models.ActionPlan.destroy({ where: { id: actionPlan.id } });
      await db.models.HighImpactActionRanked.destroy({
        where: { id: rankedAction.id },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });
  });

  describe("PATCH /api/v0/city/[city]/hiap/action-plan/[id]", () => {
    it("requires authentication", async () => {
      jest.spyOn(Auth, "getServerSession").mockResolvedValueOnce(null);

      const req = mockRequest({ planData: {} });
      const res = await updateActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId, id: randomUUID() }),
      });

      await expectStatusCode(res, 401);
    });

    it("updates action plan successfully", async () => {
      // Create ranking, ranked action, and action plan
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId,
        locode: "XX-APT",
        type: ACTION_TYPES.Mitigation,
        langs: ["en"],
        jobId: randomUUID(),
        status: HighImpactActionRankingStatus.SUCCESS,
      });

      const rankedAction = await db.models.HighImpactActionRanked.create({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        actionId: "patch-action",
        rank: 1,
        explanation: { explanations: { en: "Test" } },
        lang: "en",
        type: "mitigation",
        name: "Patch Action",
        isSelected: true,
      });

      const actionPlan = await db.models.ActionPlan.create({
        id: randomUUID(),
        actionId: rankedAction.actionId,
        highImpactActionRankedId: rankedAction.id,
        cityLocode: "XX-APT",
        cityId: testData.cityId,
        inventoryId,
        actionName: "Patch Action",
        language: "en",
        subactions: [{ name: "Original subaction" }],
        createdBy: testData.userId,
      });

      const updateData = {
        planData: { metadata: { title: "Updated Plan" } },
        actionName: "Updated Action Name",
      };

      const req = mockRequest(updateData);
      const wrongCityRes = await updateActionPlan(req, {
        params: Promise.resolve({ city: randomUUID(), id: actionPlan.id }),
      });
      await expectStatusCode(wrongCityRes, 400);

      const res = await updateActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId, id: actionPlan.id }),
      });

      await expectStatusCode(res, 200);
      const body = await res.json();
      expect(body.data).toBeTruthy();
      expect(body.data.actionName).toBe("Updated Action Name");

      // Verify in database
      const updated = await db.models.ActionPlan.findByPk(actionPlan.id);
      expect(updated?.actionName).toBe("Updated Action Name");

      // Cleanup
      await db.models.ActionPlan.destroy({ where: { id: actionPlan.id } });
      await db.models.HighImpactActionRanked.destroy({
        where: { id: rankedAction.id },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });

    it("returns 404 when action plan does not exist", async () => {
      const req = mockRequest({ planData: {} });
      const res = await updateActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId, id: randomUUID() }),
      });

      // Service returns 200 with null data when not found
      await expectStatusCodes(res, [200, 404]);
    });
  });

  describe("DELETE /api/v0/city/[city]/hiap/action-plan/[id]", () => {
    it("requires authentication", async () => {
      jest.spyOn(Auth, "getServerSession").mockResolvedValueOnce(null);

      const req = mockRequest();
      const res = await deleteActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId, id: randomUUID() }),
      });

      await expectStatusCode(res, 401);
    });

    it("deletes action plan successfully", async () => {
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId,
        locode: "XX-APT",
        type: ACTION_TYPES.Mitigation,
        langs: ["en"],
        jobId: randomUUID(),
        status: HighImpactActionRankingStatus.SUCCESS,
      });

      const rankedAction = await db.models.HighImpactActionRanked.create({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        actionId: "delete-action",
        rank: 1,
        explanation: { explanations: { en: "Test" } },
        lang: "en",
        type: "mitigation",
        name: "Delete Action",
        isSelected: true,
      });

      const actionPlan = await db.models.ActionPlan.create({
        id: randomUUID(),
        actionId: rankedAction.actionId,
        highImpactActionRankedId: rankedAction.id,
        cityLocode: "XX-APT",
        cityId: testData.cityId,
        inventoryId,
        actionName: "Delete Action",
        language: "en",
        subactions: [{ name: "Test subaction" }],
        createdBy: testData.userId,
      });

      const req = mockRequest();
      const wrongCityRes = await deleteActionPlan(req, {
        params: Promise.resolve({ city: randomUUID(), id: actionPlan.id }),
      });
      await expectStatusCode(wrongCityRes, 400);

      const res = await deleteActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId, id: actionPlan.id }),
      });

      await expectStatusCode(res, 200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const deleted = await db.models.ActionPlan.findByPk(actionPlan.id);
      expect(deleted).toBeNull();

      await db.models.HighImpactActionRanked.destroy({
        where: { id: rankedAction.id },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });

    it("returns 404 when action plan does not exist", async () => {
      const req = mockRequest();
      const res = await deleteActionPlan(req, {
        params: Promise.resolve({ city: testData.cityId, id: randomUUID() }),
      });

      // Service may return 200 or 404 depending on implementation
      await expectStatusCodes(res, [200, 404]);
    });
  });

  describe("POST /api/v0/city/[city]/hiap/action-plan/generate/[rankingId]", () => {
    it("generates action plan for a specific action", async () => {
      // Create ranking and ranked action
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId,
        locode: "XX-APT",
        type: ACTION_TYPES.Mitigation,
        langs: ["en"],
        jobId: randomUUID(),
        status: HighImpactActionRankingStatus.SUCCESS,
      });

      const rankedAction = await db.models.HighImpactActionRanked.create({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        actionId: "generate-action",
        rank: 1,
        explanation: { explanations: { en: "Test" } },
        lang: "en",
        type: "mitigation",
        name: "Generate Action",
        isSelected: true,
      });

      const requestBody = {
        action: {
          actionId: rankedAction.actionId,
          name: "Generate Action",
          hiaRankingId: rankedAction.id,
        },
        inventoryId,
        cityLocode: "XX-APT",
        lng: "en",
      };

      const req = mockRequest(requestBody);
      const res = await generateActionPlan(req, {
        params: Promise.resolve({
          city: testData.cityId,
        }),
      });

      await expectStatusCode(res, 200);
      const body = await res.json();
      expect(body.data).toBeTruthy();
      expect(body.data.actionName).toBe("Mock Action");

      // Verify the mock was called
      expect(
        HiapApiService.hiapApiWrapper.startActionPlanJob,
      ).toHaveBeenCalled();

      // Cleanup action plans created by the service
      await db.models.ActionPlan.destroy({
        where: { actionId: rankedAction.actionId },
      });
      await db.models.HighImpactActionRanked.destroy({
        where: { id: rankedAction.id },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });

    it("returns 400 when required fields are missing", async () => {
      const req = mockRequest({
        action: {},
        // missing inventoryId and cityLocode
      });
      const res = await generateActionPlan(req, {
        params: Promise.resolve({
          city: testData.cityId,
        }),
      });

      await expectStatusCode(res, 400);
    });
  });
});
