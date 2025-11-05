import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { POST as createActionPlan } from "@/app/api/v1/city/[city]/hiap/action-plan/route";
import { POST as generateActionPlan } from "@/app/api/v1/city/[city]/hiap/action-plan/generate/[rankingId]/route";
import { randomUUID } from "node:crypto";

// Mock the database models with hardcoded returns
jest.mock("@/models", () => ({
  db: {
    initialize: jest.fn(),
    models: {
      ActionPlan: {
        create: jest.fn(() =>
          Promise.resolve({
            id: "mock-plan-id",
            actionId: "test-action-123",
            cityLocode: "XX-TEST",
            actionName: "Test Action",
            language: "en",
            createdBy: "test-user-id",
            created: new Date(),
            lastUpdated: new Date(),
          }),
        ),
        findOne: jest.fn(),
        findAll: jest.fn(() => Promise.resolve([])),
        destroy: jest.fn(),
      },
      HighImpactActionRanking: {
        create: jest.fn().mockImplementation((data: any) =>
          Promise.resolve({
            id: "mock-ranking-id",
            ...data,
          }),
        ),
        findOne: jest.fn(),
        destroy: jest.fn(),
      },
      HighImpactActionRanked: {
        create: jest.fn().mockImplementation((data: any) =>
          Promise.resolve({
            id: "mock-ranked-id",
            ...data,
          }),
        ),
        findOne: jest.fn(),
        destroy: jest.fn(),
      },
      Inventory: {
        create: jest.fn(),
        findOne: jest.fn(),
        destroy: jest.fn(),
      },
    },
  },
}));

// Mock the HIAP API service
jest.mock("@/backend/hiap/HiapApiService", () => ({
  hiapApiWrapper: {
    startActionPlanJob: jest.fn(),
  },
}));

// Mock the api utility to avoid logging issues
jest.mock("@/util/api", () => ({
  recordApiUsage: jest.fn(),
  apiHandler: jest.fn((handler) => handler),
}));

// Mock the logger with all methods
jest.mock("@/services/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    silly: jest.fn(),
  },
}));

// Mock permission service
jest.mock("@/backend/permissions/PermissionService", () => ({
  PermissionService: {
    checkAccess: jest.fn(),
    canAccessInventory: jest.fn(),
  },
}));

// Import after mocks
import { db } from "@/models";
import * as HiapApiService from "@/backend/hiap/HiapApiService";

describe("Action Plan API Tests", () => {
  const mockSession = {
    user: { id: "test-user-id", role: "Admin" },
    expires: "1h",
  };

  const mockRequest = (body: any) =>
    ({
      url: "http://localhost:3000/api/v1/city/test-city/hiap/action-plan",
      json: async () => body,
    }) as any; // Type assertion to satisfy NextRequest interface

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up mock return values with hardcoded responses
    (HiapApiService.hiapApiWrapper.startActionPlanJob as any).mockResolvedValue(
      {
        plan: JSON.stringify({
          metadata: { title: "Generated Plan" },
          sections: [],
        }),
        timestamp: new Date().toISOString(),
        actionName: "Generated Action",
      },
    );
  });

  describe("POST /api/v1/city/[city]/hiap/action-plan (Create)", () => {
    it("should create an action plan via API", async () => {
      const testCityId = "test-city-id";
      const mockActionPlan = {
        id: randomUUID(),
        actionId: "test-action-123",
        cityLocode: "XX-TEST",
        actionName: "Test Action",
        language: "en",
        createdBy: "test-user-id",
        created: new Date(),
        lastUpdated: new Date(),
      };

      // Mock database create
      (db.models.ActionPlan.create as any).mockResolvedValue(mockActionPlan);

      const actionPlanData = {
        actionId: "test-action-123",
        inventoryId: randomUUID(),
        hiActionRankingId: randomUUID(),
        cityLocode: "XX-TEST",
        actionName: "Test Action",
        language: "en",
        planData: {
          sections: [{ title: "Overview", content: "Test content" }],
        },
      };

      const req = mockRequest(actionPlanData);
      const res = await createActionPlan(req, {
        params: Promise.resolve({ city: testCityId }),
        session: mockSession,
      } as any);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data).toBeTruthy();
      expect(body.data.actionId).toBe("test-action-123");
      expect(body.data.language).toBe("en");
      expect(db.models.ActionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId: "test-action-123",
          cityLocode: "XX-TEST",
          actionName: "Test Action",
          language: "en",
          createdBy: "test-user-id",
        }),
      );
    });
  });

  describe("POST /api/v1/city/[city]/hiap/action-plan/generate/[rankingId] (Generate)", () => {
    it("should generate an action plan via API", async () => {
      const testCityId = "test-city-id";
      const rankingId = randomUUID();

      const requestBody = {
        action: {
          actionId: "generate-action-123",
          name: "Generate Test Action",
          hiaRankingId: randomUUID(),
        },
        inventoryId: randomUUID(),
        cityLocode: "XX-TEST",
        lng: "en",
      };

      const req = mockRequest(requestBody);
      const res = await generateActionPlan(req, {
        params: Promise.resolve({ city: testCityId, rankingId }),
        session: mockSession,
      } as any);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeTruthy();
      expect(body.data.actionName).toBe("Generated Action");
      expect(
        HiapApiService.hiapApiWrapper.startActionPlanJob,
      ).toHaveBeenCalled();
    });
  });
});
