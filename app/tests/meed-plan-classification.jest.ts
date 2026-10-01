import { beforeEach, describe, expect, it, jest } from "@jest/globals";

process.env.HIAP_MEED_API_URL = "https://meed.example";

const reportModel = {
  findOne: jest.fn(),
  create: jest.fn(async (values: unknown) => values),
};
const mockDb = {
  models: {
    Inventory: {
      findOne: jest.fn(async () => ({ city: { locode: "CL IQQ" } })),
    },
    MeedRankSnapshot: {
      findOne: jest.fn(async () => ({ request: {}, response: {} })),
    },
    MeedActionReport: reportModel,
  },
};

jest.unstable_mockModule("@/models", () => ({ db: mockDb }));
jest.mock("@/models", () => ({ db: mockDb }));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));
jest.unstable_mockModule("@/backend/PopulationService", () => ({
  default: {},
}));
jest.mock("@/backend/PopulationService", () => ({ default: {} }));
jest.unstable_mockModule("@/backend/InventoryService", () => ({
  InventoryService: {},
}));
jest.mock("@/backend/InventoryService", () => ({ InventoryService: {} }));
jest.unstable_mockModule(
  "@/backend/meed/MeedNativeInputCatalogService",
  () => ({ registerMEEDRanking: jest.fn() }),
);
jest.mock("@/backend/meed/MeedNativeInputCatalogService", () => ({
  registerMEEDRanking: jest.fn(),
}));

const MeedApiService = (await import("@/backend/MeedApiService")).default;

const classification = {
  classification_method: "ai_classified",
  review_status: "pending_human_review",
  authority_scope: "qualified",
  authority_scope_status: "pending_human_review",
};

describe("MeedApiService plan classification persistence", () => {
  beforeEach(() => {
    reportModel.findOne.mockReset();
    reportModel.create.mockClear();
    reportModel.findOne.mockResolvedValue(null);
    global.fetch = jest.fn(async () => ({
      status: 200,
      json: async () => ({
        action_id: "icare_0016",
        language: ["en"],
        chapters: [{ key: "legal", markdown: { en: "Body" }, limitations: { en: [] } }],
        metadata: { authority_scope_classification: classification },
      }),
    })) as unknown as typeof fetch;
  });

  it("stores the backend classification and reloads it on the report row", async () => {
    const created = await MeedApiService.generatePlan(
      "inventory-1",
      ["en"],
      "icare_0016",
      true,
    );
    expect(created.authorityScopeClassification).toEqual(classification);
    reportModel.findOne.mockResolvedValue(created);
    const reloaded = await MeedApiService.getPlan("inventory-1", "icare_0016");
    expect(reloaded.authorityScopeClassification).toEqual(classification);
  });

  it("stores null instead of an invalid classification pair", async () => {
    global.fetch = jest.fn(async () => ({
      status: 200,
      json: async () => ({
        action_id: "icare_0016",
        language: ["en"],
        chapters: [],
        metadata: {
          authority_scope_classification: {
            ...classification,
            classification_method: "human_classified",
            review_status: "human_rejected",
          },
        },
      }),
    })) as unknown as typeof fetch;
    const created = await MeedApiService.generatePlan(
      "inventory-1",
      ["en"],
      "icare_0016",
      true,
    );
    expect(created.authorityScopeClassification).toBeNull();
  });
});
