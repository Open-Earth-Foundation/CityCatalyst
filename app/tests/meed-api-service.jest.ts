import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

process.env.HIAP_MEED_API_URL = "https://meed.example";

const inventoryModel = { findOne: jest.fn() };
const inventoryValueModel = { findAll: jest.fn() };
const rankingModel = { findOne: jest.fn(), create: jest.fn() };
const rankedModel = { bulkCreate: jest.fn(), findAll: jest.fn() };
const removedModel = { bulkCreate: jest.fn(), findAll: jest.fn() };
const mockTransaction = {};
const sequelize = {
  transaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
    callback(mockTransaction),
  ),
};

const mockDb = {
  sequelize,
  models: {
    Inventory: inventoryModel,
    InventoryValue: inventoryValueModel,
    MeedRanking: rankingModel,
    MeedActionRanked: rankedModel,
    MeedActionRemoved: removedModel,
    City: {},
    Population: {},
    ActivityValue: {},
    DataSource: {},
  },
};

jest.unstable_mockModule("@/models", () => ({ db: mockDb }));
jest.mock("@/models", () => ({ db: mockDb }));
jest.unstable_mockModule("@/backend/PopulationService", () => ({
  default: { getPopulationDataForCityYear: jest.fn() },
}));
jest.mock("@/backend/PopulationService", () => ({
  default: { getPopulationDataForCityYear: jest.fn() },
}));
jest.unstable_mockModule("@/backend/InventoryService", () => ({
  InventoryService: { extractActivityFields: jest.fn() },
}));
jest.mock("@/backend/InventoryService", () => ({
  InventoryService: { extractActivityFields: jest.fn() },
}));
jest.unstable_mockModule(
  "@/backend/meed/MeedNativeInputCatalogService",
  () => ({
    registerMEEDRanking: jest.fn(),
  }),
);
jest.mock("@/backend/meed/MeedNativeInputCatalogService", () => ({
  registerMEEDRanking: jest.fn(),
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn() },
}));
jest.mock("@/services/logger", () => ({
  logger: { error: jest.fn() },
}));

const populationService = (await import("@/backend/PopulationService")).default;
const { registerMEEDRanking } =
  await import("@/backend/meed/MeedNativeInputCatalogService");
const MeedApiService = (await import("@/backend/MeedApiService")).default;

const request = {
  requestedLanguages: ["en"],
  topN: 5,
  createExplanations: false,
  cityDataList: [
    {
      excludedActionIds: [],
      weightsOverride: {},
      cityStrategicPreferenceSectors: [],
      cityStrategicPreferenceTimeframes: ["no_preference"],
      cityStrategicPreferenceCoBenefitKeys: [],
    },
  ],
};

function response(actionId: string) {
  return {
    status: 200,
    json: async () => ({
      results: [
        {
          ranked_actions: [
            {
              action_id: actionId,
              rank: 1,
              final_score: 0.9,
              impact_score: 0.8,
              alignment_score: 0.7,
              feasibility_score: 0.6,
              evidence_summary: {},
              explanations: {},
            },
          ],
          removed_actions: [],
          metadata: { weights: { impact: 1 } },
        },
      ],
    }),
  };
}

beforeEach(() => {
  inventoryModel.findOne.mockResolvedValue({
    inventoryId: "inventory-1",
    cityId: "city-1",
    year: 2024,
    city: { locode: "BR-SAO", countryLocode: "BR" },
  });
  inventoryValueModel.findAll.mockResolvedValue([]);
  populationService.getPopulationDataForCityYear.mockResolvedValue({
    population: 100,
  });
  rankingModel.findOne.mockResolvedValue(null);
  rankingModel.create.mockImplementation(async (attributes) => ({
    ...attributes,
    id: attributes.id,
  }));
  rankedModel.bulkCreate.mockImplementation(async (rows) => rows);
  removedModel.bulkCreate.mockImplementation(async (rows) => rows);
  rankedModel.findAll.mockResolvedValue([]);
  removedModel.findAll.mockResolvedValue([]);
  registerMEEDRanking.mockResolvedValue({
    catalog: {},
    created: true,
  } as never);
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("MeedApiService versioned persistence", () => {
  it("persists a completed parent and links child rows without deleting prior results", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response("action-1"));

    const result = await MeedApiService.runRanking(
      "inventory-1",
      request,
      "user-1",
    );

    expect(rankedModel.bulkCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          inventoryId: "inventory-1",
          rankingId: expect.any(String),
        }),
      ],
      { transaction: mockTransaction },
    );
    expect(rankingModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryId: "inventory-1",
        userId: "user-1",
        status: "completed",
        actionCount: 1,
      }),
      { transaction: mockTransaction },
    );
    expect(rankingModel.findOne).not.toHaveBeenCalled();
    expect(rankedModel).not.toHaveProperty("destroy");
    expect(registerMEEDRanking).toHaveBeenCalledWith(expect.any(String));
    expect(result).toEqual({
      rankedActions: expect.any(Array),
      removedActions: [],
    });
  });

  it("creates a new version for every successful invocation, even with identical output", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response("action-1"));

    await MeedApiService.runRanking("inventory-1", request, "user-1");
    await MeedApiService.runRanking("inventory-1", request, "user-1");

    expect(rankingModel.create).toHaveBeenCalledTimes(2);
    expect(rankingModel.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        inventoryId: "inventory-1",
        userId: "user-1",
        status: "completed",
      }),
    );
    expect(rankingModel.create.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        inventoryId: "inventory-1",
        userId: "user-1",
        status: "completed",
      }),
    );
    expect(rankingModel.create.mock.calls[0][0].id).not.toBe(
      rankingModel.create.mock.calls[1][0].id,
    );
    expect(rankingModel.findOne).not.toHaveBeenCalled();
  });

  it("reads the latest completed version for the inventory and falls back to legacy rows", async () => {
    rankingModel.findOne.mockResolvedValueOnce({ id: "ranking-latest" });
    rankedModel.findAll.mockResolvedValueOnce([{ id: "ranked-latest" }]);
    removedModel.findAll.mockResolvedValueOnce([{ id: "removed-latest" }]);

    await expect(
      MeedApiService.getRanking("inventory-1", "user-1"),
    ).resolves.toEqual({
      rankedActions: [{ id: "ranked-latest" }],
      removedActions: [{ id: "removed-latest" }],
    });
    expect(rankingModel.findOne).toHaveBeenCalledWith({
      where: {
        inventoryId: "inventory-1",
        status: "completed",
      },
      order: [["created", "DESC"]],
    });

    rankingModel.findOne.mockResolvedValueOnce(null);
    rankedModel.findAll.mockResolvedValueOnce([{ id: "legacy-ranked" }]);
    removedModel.findAll.mockResolvedValueOnce([{ id: "legacy-removed" }]);
    await expect(
      MeedApiService.getRanking("inventory-1", "user-1"),
    ).resolves.toEqual({
      rankedActions: [{ id: "legacy-ranked" }],
      removedActions: [{ id: "legacy-removed" }],
    });
  });
});
