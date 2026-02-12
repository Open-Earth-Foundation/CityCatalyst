/**
 * Unit tests for action plan generation.
 * Mocks the external HIAP plan-creator API (fetch) to test the full generation flow
 * without calling the real service.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { db } from "@/models";
import { randomUUID } from "node:crypto";
import { setupTests } from "../helpers";
import {
  createTestData,
  cleanupTestData,
  TestData,
} from "../helpers/testDataCreationHelper";
import { hiapApiWrapper } from "@/backend/hiap/HiapApiService";
import { hiapServiceWrapper } from "@/backend/hiap/HiapService";
import ActionPlanEmailService from "@/backend/ActionPlanEmailService";
import { ACTION_TYPES, HighImpactActionRankingStatus } from "@/util/types";

const HIAP_API_URL = process.env.HIAP_API_URL || "http://hiap-service";

/** Sample plan response from HIAP API */
const MOCK_PLAN_RESPONSE = {
  metadata: {
    locode: "XX APT",
    cityName: "Test City",
    actionId: "test-action-123",
    actionName: "Solar Rooftop",
    language: "en",
    createdAt: "2024-01-15T12:00:00Z",
  },
  content: {
    introduction: {
      city_description: "Test city description",
      action_description: "Solar rooftop installation plan",
      national_strategy_explanation: "Aligned with national goals",
    },
    subactions: { items: [{ name: "Phase 1: Assessment" }] },
    institutions: { items: [] },
    milestones: { items: [] },
    timeline: {},
    costBudget: {},
    merIndicators: { items: [] },
    mitigations: { items: [] },
    adaptations: { items: [] },
    sdgs: { items: [] },
  },
};

/** Mock city/emissions data for HIAP */
const MOCK_CITY_DATA = {
  cityContextData: {
    locode: "XX APT",
    populationSize: 100000,
  },
  cityEmissionsData: {
    stationaryEnergyEmissions: 50000,
    transportationEmissions: 30000,
    wasteEmissions: 5000,
    ippuEmissions: 1000,
    afoluEmissions: 2000,
  },
};

function createMockFetch(
  overrides?: {
    startPlanCreation?: { taskId?: string; status?: number; body?: string };
    checkProgress?: { status?: string; error?: string };
    getPlan?: { plan?: object; status?: number };
  },
) {
  const taskId = overrides?.startPlanCreation?.taskId ?? "mock-task-uuid-123";

  return jest.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const urlStr = typeof url === "string" ? url : "";

    // start_plan_creation
    if (urlStr.includes("/plan-creator/v1/start_plan_creation")) {
      const status = overrides?.startPlanCreation?.status ?? 202;
      const body = overrides?.startPlanCreation?.body ?? JSON.stringify({ taskId });
      return Promise.resolve(
        new Response(body, {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    // check_progress
    if (urlStr.includes("/plan-creator/v1/check_progress/")) {
      const status = overrides?.checkProgress?.status ?? "completed";
      const error = overrides?.checkProgress?.error;
      return Promise.resolve(
        new Response(
          JSON.stringify(status === "failed" ? { status, error } : { status }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    // get_plan
    if (urlStr.includes("/plan-creator/v1/get_plan/")) {
      const status = overrides?.getPlan?.status ?? 200;
      const plan = overrides?.getPlan?.plan ?? MOCK_PLAN_RESPONSE;
      return Promise.resolve(
        new Response(JSON.stringify(plan), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${urlStr}`));
  });
}

describe("Action Plan Generation", () => {
  let testData: TestData;
  let inventoryId: string;
  let rankingId: string;
  let rankedActionId: string;
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: jest.Mock;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    testData = await createTestData({
      cityName: "Plan Gen Test City",
      organizationName: "Plan Gen Test Org",
      projectName: "Plan Gen Test Project",
    });

    await db.models.City.update(
      { locode: "XXAPT" },
      { where: { cityId: testData.cityId } },
    );

    const inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: testData.cityId,
      year: 2024,
    });
    inventoryId = inventory.inventoryId;

    const ranking = await db.models.HighImpactActionRanking.create({
      id: randomUUID(),
      inventoryId,
      locode: "XX APT",
      type: ACTION_TYPES.Mitigation,
      langs: ["en"],
      jobId: randomUUID(),
      status: HighImpactActionRankingStatus.SUCCESS,
    });
    rankingId = ranking.id;

    const rankedAction = await db.models.HighImpactActionRanked.create({
      id: randomUUID(),
      hiaRankingId: ranking.id,
      actionId: "test-action-123",
      rank: 1,
      explanation: { en: "Test explanation" } as any,
      lang: "en",
      type: "mitigation",
      name: "Solar Rooftop",
      isSelected: true,
    });
    rankedActionId = rankedAction.id;
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = createMockFetch();
    globalThis.fetch = mockFetch as typeof fetch;

    jest.spyOn(hiapServiceWrapper, "getCityContextAndEmissionsData").mockResolvedValue(MOCK_CITY_DATA as any);
    jest.spyOn(ActionPlanEmailService, "sendActionPlanReadyEmailWithUrl").mockResolvedValue(undefined);
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;

    await db.models.ActionPlan.destroy({ where: { actionId: "test-action-123" } });
    await db.models.HighImpactActionRanked.destroy({ where: { id: rankedActionId } });
    await db.models.HighImpactActionRanking.destroy({ where: { id: rankingId } });
    await db.models.Inventory.destroy({ where: { inventoryId } });
    await cleanupTestData(testData);

    if (db.sequelize) await db.sequelize.close();
  });

  describe("startActionPlanJob - success flow", () => {
    it("calls HIAP API in correct order: start, check_progress, get_plan", async () => {
      await hiapApiWrapper.startActionPlanJob({
        action: {
          actionId: "test-action-123",
          name: "Solar Rooftop",
          hiaRankingId: rankedActionId,
        } as any,
        cityId: testData.cityId,
        cityLocode: "XX APT",
        lng: "en",
        inventoryId,
        createdBy: testData.userId,
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);

      // 1. start_plan_creation
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `${HIAP_API_URL}/plan-creator/v1/start_plan_creation`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
        }),
      );

      // 2. check_progress
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("/plan-creator/v1/check_progress/"),
        expect.objectContaining({
          headers: { Accept: "application/json" },
        }),
      );

      // 3. get_plan
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("/plan-creator/v1/get_plan/"),
        expect.objectContaining({
          headers: { Accept: "application/json" },
        }),
      );
    });

    it("sends correct payload to start_plan_creation", async () => {
      await hiapApiWrapper.startActionPlanJob({
        action: {
          actionId: "solar-action-456",
          name: "Solar Rooftop",
          hiaRankingId: rankedActionId,
        } as any,
        cityId: testData.cityId,
        cityLocode: "BR SAO",
        lng: "es",
        inventoryId,
      });

      const startCall = mockFetch.mock.calls.find((call: any[]) =>
        String(call[0]).includes("start_plan_creation"),
      );
      expect(startCall).toBeDefined();
      const body = JSON.parse((startCall as any)[1].body);
      expect(body).toMatchObject({
        countryCode: "BR",
        actionId: "solar-action-456",
        language: "es",
        cityData: {
          cityContextData: MOCK_CITY_DATA.cityContextData,
          cityEmissionsData: MOCK_CITY_DATA.cityEmissionsData,
        },
      });
    });

    it("saves action plan to database", async () => {
      await hiapApiWrapper.startActionPlanJob({
        action: {
          actionId: "test-action-123",
          name: "Solar Rooftop",
          hiaRankingId: rankedActionId,
        } as any,
        cityId: testData.cityId,
        cityLocode: "XX APT",
        lng: "en",
        inventoryId,
        createdBy: testData.userId,
      });

      const saved = await db.models.ActionPlan.findOne({
        where: { actionId: "test-action-123", language: "en" },
      });
      expect(saved).toBeTruthy();
      expect(saved?.cityName).toBe("Test City");
      expect(saved?.actionName).toBe("Solar Rooftop");
      expect(saved?.cityDescription).toContain("Test city description");
    });

    it("sends email when plan is newly created and createdBy is set", async () => {
      await db.models.ActionPlan.destroy({
        where: { actionId: "test-action-123", language: "en" },
      });

      await hiapApiWrapper.startActionPlanJob({
        action: {
          actionId: "test-action-123",
          name: "Solar Rooftop",
          hiaRankingId: rankedActionId,
        } as any,
        cityId: testData.cityId,
        cityLocode: "XX APT",
        lng: "en",
        inventoryId,
        createdBy: testData.userId,
      });

      expect(ActionPlanEmailService.sendActionPlanReadyEmailWithUrl).toHaveBeenCalled();
    });

    it("returns plan, timestamp, and actionName", async () => {
      const result = await hiapApiWrapper.startActionPlanJob({
        action: {
          actionId: "test-action-123",
          name: "Solar Rooftop",
          hiaRankingId: rankedActionId,
        } as any,
        cityId: testData.cityId,
        cityLocode: "XX APT",
        lng: "en",
        inventoryId,
      });

      expect(result).toMatchObject({
        actionName: "Solar Rooftop",
        timestamp: expect.any(String),
      });
      expect(result.plan).toBeTruthy();
      const parsed = JSON.parse(result.plan);
      expect(parsed.metadata.actionId).toBe("test-action-123");
    });
  });

  describe("startActionPlanJob - error handling", () => {
    it("throws when start_plan_creation returns non-OK status", async () => {
      globalThis.fetch = createMockFetch({
        startPlanCreation: { status: 500, body: "Internal Server Error" },
      }) as typeof fetch;

      await expect(
        hiapApiWrapper.startActionPlanJob({
          action: {
            actionId: "test-action-123",
            name: "Solar Rooftop",
            hiaRankingId: rankedActionId,
          } as any,
          cityId: testData.cityId,
          cityLocode: "XX APT",
          lng: "en",
          inventoryId,
        }),
      ).rejects.toThrow(/Failed to start plan generation/);

      globalThis.fetch = mockFetch as typeof fetch;
    });

    it("throws when start_plan_creation returns invalid JSON", async () => {
      globalThis.fetch = createMockFetch({
        startPlanCreation: {
          status: 202,
          body: "not valid json {{{",
        },
      }) as typeof fetch;

      await expect(
        hiapApiWrapper.startActionPlanJob({
          action: {
            actionId: "test-action-123",
            name: "Solar Rooftop",
            hiaRankingId: rankedActionId,
          } as any,
          cityId: testData.cityId,
          cityLocode: "XX APT",
          lng: "en",
          inventoryId,
        }),
      ).rejects.toThrow(/Invalid JSON/);

      globalThis.fetch = mockFetch as typeof fetch;
    });

    it("throws when start_plan_creation returns no taskId", async () => {
      globalThis.fetch = createMockFetch({
        startPlanCreation: {
          status: 202,
          body: JSON.stringify({ status: "pending" }),
        },
      }) as typeof fetch;

      await expect(
        hiapApiWrapper.startActionPlanJob({
          action: {
            actionId: "test-action-123",
            name: "Solar Rooftop",
            hiaRankingId: rankedActionId,
          } as any,
          cityId: testData.cityId,
          cityLocode: "XX APT",
          lng: "en",
          inventoryId,
        }),
      ).rejects.toThrow(/No task_id in response/);

      globalThis.fetch = mockFetch as typeof fetch;
    });

    it("throws when check_progress returns failed status", async () => {
      globalThis.fetch = createMockFetch({
        checkProgress: { status: "failed", error: "AI model error" },
      }) as typeof fetch;

      await expect(
        hiapApiWrapper.startActionPlanJob({
          action: {
            actionId: "test-action-123",
            name: "Solar Rooftop",
            hiaRankingId: rankedActionId,
          } as any,
          cityId: testData.cityId,
          cityLocode: "XX APT",
          lng: "en",
          inventoryId,
        }),
      ).rejects.toThrow(/Plan generation failed|AI model error/);

      globalThis.fetch = mockFetch as typeof fetch;
    });

    it("throws when get_plan returns non-OK status", async () => {
      globalThis.fetch = createMockFetch({
        getPlan: { status: 404, plan: {} },
      }) as typeof fetch;

      await expect(
        hiapApiWrapper.startActionPlanJob({
          action: {
            actionId: "test-action-123",
            name: "Solar Rooftop",
            hiaRankingId: rankedActionId,
          } as any,
          cityId: testData.cityId,
          cityLocode: "XX APT",
          lng: "en",
          inventoryId,
        }),
      ).rejects.toThrow(/Failed to retrieve plan/);

      globalThis.fetch = mockFetch as typeof fetch;
    });
  });

  describe("startActionPlanJob - data flow", () => {
    it("uses getCityContextAndEmissionsData for payload", async () => {
      await hiapApiWrapper.startActionPlanJob({
        action: {
          actionId: "test-action-123",
          name: "Solar Rooftop",
          hiaRankingId: rankedActionId,
        } as any,
        cityId: testData.cityId,
        cityLocode: "XX APT",
        lng: "en",
        inventoryId,
      });

      expect(hiapServiceWrapper.getCityContextAndEmissionsData).toHaveBeenCalledWith(inventoryId);
    });

    it("extracts country code from locode (first 2 chars)", async () => {
      await hiapApiWrapper.startActionPlanJob({
        action: {
          actionId: "test-action-123",
          name: "Solar Rooftop",
          hiaRankingId: rankedActionId,
        } as any,
        cityId: testData.cityId,
        cityLocode: "CR SJ",
        lng: "en",
        inventoryId,
      });

      const startCall = mockFetch.mock.calls.find((call: any[]) =>
        String(call[0]).includes("start_plan_creation"),
      );
      const body = JSON.parse((startCall as any)[1].body);
      expect(body.countryCode).toBe("CR");
    });
  });
});
