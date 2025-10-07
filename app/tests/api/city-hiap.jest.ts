import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { mockRequest, setupTests } from "../helpers";
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

import { GET, PATCH } from "@/app/api/v0/inventory/[inventory]/hiap/route";
import * as HiapApiService from "@/backend/hiap/HiapApiService";

describe("Inventory HIAP API", () => {
  let inventoryId: string;
  let testData: TestData;
  let mockSession: AppSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    // Create test data with proper relationships
    testData = await createTestData({
      cityName: "HIAP Test City",
      organizationName: "HIAP Test Org",
      projectName: "HIAP Test Project",
    });

    // Update city to have locode (required by InventoryService.getLocode)
    await db.models.City.update(
      { locode: "XX-TST" },
      { where: { cityId: testData.cityId } },
    );

    // Create test inventory
    const inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: testData.cityId,
      year: 2024,
    });
    inventoryId = inventory.inventoryId;

    // Use admin session so access control passes
    mockSession = {
      user: { id: testData.userId, role: Roles.Admin },
      expires: "1h",
    };
  });

  beforeEach(() => {
    // Mock authentication
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockSession);

    // Mock HIAP API wrapper functions - these are the actual external API calls
    jest
      .spyOn(HiapApiService.hiapApiWrapper, "startPrioritization")
      .mockResolvedValue({
        taskId: "mock-task-id",
      });
    jest
      .spyOn(HiapApiService.hiapApiWrapper, "checkPrioritizationProgress")
      .mockResolvedValue({
        status: "completed",
      });
    jest
      .spyOn(HiapApiService.hiapApiWrapper, "getPrioritizationResult")
      .mockResolvedValue({
        rankedActionsMitigation: [
          {
            actionId: "test-action-1",
            rank: 1,
            explanation: {
              en: "Test explanation for mitigation",
              es: "Explicación de prueba para mitigación",
              pt: "Explicação de teste para mitigação",
            },
          },
        ],
        rankedActionsAdaptation: [],
      } as any);
  });

  afterAll(async () => {
    // Cleanup test data - order matters due to foreign keys
    if (inventoryId) {
      // First delete any HIAP rankings and their actions
      const rankings = await db.models.HighImpactActionRanking.findAll({
        where: { inventoryId },
      });
      for (const ranking of rankings) {
        await db.models.HighImpactActionRanked.destroy({
          where: { hiaRankingId: ranking.id },
        });
      }
      await db.models.HighImpactActionRanking.destroy({
        where: { inventoryId },
      });

      // Then delete inventory
      await db.models.Inventory.destroy({ where: { inventoryId } });
    }

    // Cleanup test data created by helper
    await cleanupTestData(testData);

    if (db.sequelize) await db.sequelize.close();
  });

  describe("GET /api/v0/inventory/[inventory]/hiap", () => {
    it("returns 500 when required query params are missing", async () => {
      const req = mockRequest();
      const res = await GET(req, {
        params: Promise.resolve({ inventory: inventoryId }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body?.error).toBeTruthy();
    });

    it("creates new ranking and starts processing when none exists", async () => {
      const req = mockRequest(undefined, {
        actionType: "mitigation",
        lng: "en",
      });

      const res = await GET(req, {
        params: Promise.resolve({ inventory: inventoryId }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeTruthy();

      // Verify startPrioritization was called
      expect(
        HiapApiService.hiapApiWrapper.startPrioritization,
      ).toHaveBeenCalled();

      // Verify a ranking was created in the database
      const ranking = await db.models.HighImpactActionRanking.findOne({
        where: { inventoryId },
      });
      expect(ranking).toBeTruthy();
      expect(ranking?.jobId).toBe("mock-task-id");
      expect(ranking?.status).toBe(HighImpactActionRankingStatus.PENDING); // Initially pending

      // Note: checkActionRankingJob runs in the background with a 10-second polling interval.
      // We're not testing the polling mechanism here - we just verify the ranking was created
      // with the correct job ID and initial PENDING status.

      // Cleanup
      if (ranking) {
        await db.models.HighImpactActionRanked.destroy({
          where: { hiaRankingId: ranking.id },
        });
        await db.models.HighImpactActionRanking.destroy({
          where: { id: ranking.id },
        });
      }
    });

    it("returns existing HIAP ranking when it exists in database", async () => {
      // Create a completed ranking with ranked actions
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId,
        locode: "XX-TST",
        type: ACTION_TYPES.Mitigation,
        langs: ["en"],
        jobId: randomUUID(),
        status: HighImpactActionRankingStatus.SUCCESS,
      });

      await db.models.HighImpactActionRanked.create({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        actionId: randomUUID(),
        rank: 1,
        explanation: { en: "Test explanation" } as any,
        lang: "en",
        type: "mitigation",
        name: "Test Action",
        isSelected: false,
      });

      const req = mockRequest(undefined, {
        actionType: "mitigation",
        lng: "en",
      });

      const res = await GET(req, {
        params: Promise.resolve({ inventory: inventoryId }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeTruthy();
      // The response contains the ranking data directly
      expect(body.data.actions || body.data.rankedActions).toBeTruthy();

      // Cleanup
      await db.models.HighImpactActionRanked.destroy({
        where: { hiaRankingId: ranking.id },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });
  });

  describe("PATCH /api/v0/inventory/[inventory]/hiap", () => {
    it("updates selection flags for ranked actions", async () => {
      // Create a ranking and some ranked actions tied to this inventory
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId,
        locode: "XX-TST",
        type: ACTION_TYPES.Mitigation,
        langs: ["en"],
        jobId: randomUUID(),
        status: HighImpactActionRankingStatus.PENDING,
      });

      const ranked1 = await db.models.HighImpactActionRanked.create({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        actionId: randomUUID(),
        rank: 1,
        explanation: { en: "Test explanation" } as any,
        lang: "en",
        type: "mitigation",
        name: "Test Action 1",
        isSelected: false,
      });

      const ranked2 = await db.models.HighImpactActionRanked.create({
        id: randomUUID(),
        hiaRankingId: ranking.id,
        actionId: randomUUID(),
        rank: 2,
        explanation: { en: "Test explanation" } as any,
        lang: "en",
        type: "mitigation",
        name: "Test Action 2",
        isSelected: true,
      });

      const body = { selectedActionIds: [ranked1.id] };
      const req = mockRequest(body);
      const res = await PATCH(req, {
        params: Promise.resolve({ inventory: inventoryId }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(typeof json.updated).toBe("number");

      // Verify DB state: ranked1 true, ranked2 false
      const refreshed1 = await db.models.HighImpactActionRanked.findByPk(
        ranked1.id,
      );
      const refreshed2 = await db.models.HighImpactActionRanked.findByPk(
        ranked2.id,
      );
      expect(refreshed1?.isSelected).toBe(true);
      expect(refreshed2?.isSelected).toBe(false);

      // cleanup
      await db.models.HighImpactActionRanked.destroy({
        where: { id: [ranked1.id, ranked2.id] },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });

    it("is a no-op when there are no rankings for inventory", async () => {
      const req = mockRequest({ selectedActionIds: [] });
      // Use the actual inventory ID which exists but has no rankings
      const res = await PATCH(req, {
        params: Promise.resolve({ inventory: inventoryId }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.updated).toBe(0);
    });
  });
});
