import { beforeEach, describe, expect, it, jest } from "@jest/globals";

process.env.HIAP_MEED_API_URL = "https://meed.example";

const reportModel = {
  findOne: jest.fn(),
  create: jest.fn(async (values: unknown) => values),
};
const registerMEEDOutputPlan = jest.fn();
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
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
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
  () => ({
    registerMEEDRanking: jest.fn(),
    registerMEEDOutputPlan,
  }),
);
jest.mock("@/backend/meed/MeedNativeInputCatalogService", () => ({
  registerMEEDRanking: jest.fn(),
  registerMEEDOutputPlan,
}));

const MeedApiService = (await import("@/backend/MeedApiService")).default;

const classification = {
  classification_method: "ai_classified",
  review_status: "pending_human_review",
  authority_scope: "qualified",
  authority_scope_status: "pending_human_review",
};

function completePlanResponse(
  overrides: Record<string, unknown> = {},
): Response {
  return {
    status: 200,
    json: async () => ({
      action_id: "icare_0016",
      language: ["en"],
      chapters: [
        { key: "legal", markdown: { en: "Body" }, limitations: { en: [] } },
      ],
      metadata: {
        required_sources_ok: true,
        authority_scope_classification: classification,
      },
      ...overrides,
    }),
  } as unknown as Response;
}

describe("MeedApiService plan classification persistence", () => {
  beforeEach(() => {
    reportModel.findOne.mockReset();
    reportModel.create.mockClear();
    reportModel.findOne.mockResolvedValue(null);
    registerMEEDOutputPlan.mockReset();
    registerMEEDOutputPlan.mockResolvedValue({
      catalog: { id: "catalog-1" },
      created: true,
    });
    global.fetch = jest.fn(async () =>
      completePlanResponse(),
    ) as unknown as typeof fetch;
  });

  it("stores the backend classification and reloads it on the report row", async () => {
    const created = await MeedApiService.generatePlan(
      "inventory-1",
      ["en"],
      "icare_0016",
      false,
    );
    expect(created.authorityScopeClassification).toEqual(classification);
    expect(reportModel.create).toHaveBeenCalled();
    expect(registerMEEDOutputPlan).toHaveBeenCalledWith(created.id);
    reportModel.findOne.mockResolvedValue(created);
    const reloaded = await MeedApiService.getPlan("inventory-1", "icare_0016");
    expect(reloaded.authorityScopeClassification).toEqual(classification);
    expect(reportModel.findOne).toHaveBeenCalledWith({
      where: { inventoryId: "inventory-1", actionId: "icare_0016" },
      order: [
        ["created", "DESC"],
        ["id", "DESC"],
      ],
    });
  });

  it("stores null instead of an invalid classification pair", async () => {
    global.fetch = jest.fn(async () =>
      completePlanResponse({
        metadata: {
          required_sources_ok: true,
          authority_scope_classification: {
            ...classification,
            classification_method: "human_classified",
            review_status: "human_rejected",
          },
        },
      }),
    ) as unknown as typeof fetch;
    const created = await MeedApiService.generatePlan(
      "inventory-1",
      ["en"],
      "icare_0016",
      false,
    );
    expect(created.authorityScopeClassification).toBeNull();
  });

  it("returns debug plans without storing or registering them", async () => {
    const created = await MeedApiService.generatePlan(
      "inventory-1",
      ["en"],
      "icare_0016",
      true,
    );
    expect(created.chapters).toEqual([
      { key: "legal", markdown: { en: "Body" }, limitations: { en: [] } },
    ]);
    expect(reportModel.create).not.toHaveBeenCalled();
    expect(registerMEEDOutputPlan).not.toHaveBeenCalled();
  });

  it("rejects a plan without chapters", async () => {
    global.fetch = jest.fn(async () =>
      completePlanResponse({
        chapters: [],
        metadata: { required_sources_ok: true },
      }),
    ) as unknown as typeof fetch;

    await expect(
      MeedApiService.generatePlan("inventory-1", ["en"], "icare_0016", false),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(reportModel.create).not.toHaveBeenCalled();
    expect(registerMEEDOutputPlan).not.toHaveBeenCalled();
  });

  it("stores an incomplete plan but keeps it out of the catalog", async () => {
    global.fetch = jest.fn(async () =>
      completePlanResponse({ metadata: { required_sources_ok: false } }),
    ) as unknown as typeof fetch;

    const created = await MeedApiService.generatePlan(
      "inventory-1",
      ["en"],
      "icare_0016",
      false,
    );
    expect(reportModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ catalogEligible: false }),
    );
    expect(created.chapters).toHaveLength(1);
    expect(registerMEEDOutputPlan).not.toHaveBeenCalled();
  });

  it("stores a plan missing a requested language as catalog-ineligible", async () => {
    const created = await MeedApiService.generatePlan(
      "inventory-1",
      ["en", "es"],
      "icare_0016",
      false,
    );
    expect(reportModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ catalogEligible: false }),
    );
    expect(created).toBeDefined();
    expect(registerMEEDOutputPlan).not.toHaveBeenCalled();
  });
});
