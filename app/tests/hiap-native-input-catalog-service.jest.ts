import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const catalogModel = {
  findAll: jest.fn(),
  update: jest.fn(),
};
const rankingModel = {
  findOne: jest.fn(),
};
const rankedModel = {
  findAll: jest.fn(),
};
const unrankedModel = {
  findAll: jest.fn(),
};
const inventoryModel = {
  findByPk: jest.fn(),
};
const cityModel = {
  findByPk: jest.fn(),
};
const registerNativeInput = jest.fn();
const supersedeNativeInput = jest.fn();
const withdrawNativeInput = jest.fn();

const mockDb = {
  models: {
    NativeInputCatalog: catalogModel,
    HighImpactActionRanking: rankingModel,
    HighImpactActionRanked: rankedModel,
    UnrankedActionSelection: unrankedModel,
    Inventory: inventoryModel,
    City: cityModel,
    Project: {},
    Organization: {},
  },
};

jest.unstable_mockModule("@/models", () => ({ db: mockDb }));
jest.mock("@/models", () => ({ db: mockDb }));
jest.unstable_mockModule("@/backend/NativeInputCatalogService", () => ({
  registerNativeInput,
  supersedeNativeInput,
  withdrawNativeInput,
}));
jest.mock("@/backend/NativeInputCatalogService", () => ({
  registerNativeInput,
  supersedeNativeInput,
  withdrawNativeInput,
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));

let registerHIAPRanking: typeof import("@/backend/hiap/HiapNativeInputCatalogService").registerHIAPRanking;
let registerHIAPSelections: typeof import("@/backend/hiap/HiapNativeInputCatalogService").registerHIAPSelections;
let registerHIAPActionPlan: typeof import("@/backend/hiap/HiapNativeInputCatalogService").registerHIAPActionPlan;
let withdrawHIAPActionPlanCatalog: typeof import("@/backend/hiap/HiapNativeInputCatalogService").withdrawHIAPActionPlanCatalog;
let withdrawHIAPCatalogForCity: typeof import("@/backend/hiap/HiapNativeInputCatalogService").withdrawHIAPCatalogForCity;

beforeAll(async () => {
  ({
    registerHIAPRanking,
    registerHIAPSelections,
    registerHIAPActionPlan,
    withdrawHIAPActionPlanCatalog,
    withdrawHIAPCatalogForCity,
  } = await import("@/backend/hiap/HiapNativeInputCatalogService"));
});

beforeEach(() => {
  inventoryModel.findByPk.mockResolvedValue({
    inventoryId: "inventory-1",
    cityId: "city-1",
    city: {
      cityId: "city-1",
      projectId: "project-1",
      project: {
        projectId: "project-1",
        organizationId: "organization-1",
        organization: { organizationId: "organization-1" },
      },
    },
  });
  cityModel.findByPk.mockResolvedValue(null);
  catalogModel.findAll.mockResolvedValue([]);
  registerNativeInput.mockResolvedValue({
    catalog: { id: "catalog-new" },
    created: true,
  });
  supersedeNativeInput.mockResolvedValue({});
  withdrawNativeInput.mockResolvedValue({});
});

afterEach(() => {
  jest.clearAllMocks();
});

const ranking = {
  id: "ranking-1",
  inventoryId: "inventory-1",
  userId: "user-1",
  locode: "BR-SAO",
  type: "mitigation",
  langs: ["en", "pt"],
  status: "SUCCESS",
} as never;

describe("HiapNativeInputCatalogService", () => {
  it("registers only a successful persisted ranking and keeps content out of labels", async () => {
    rankedModel.findAll.mockResolvedValue([
      {
        actionId: "action-1",
        rank: 1,
        lang: "en",
        type: "mitigation",
        isSelected: false,
      },
    ]);

    await registerHIAPRanking(ranking);

    expect(registerNativeInput).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "hiap_ranking",
        owningModule: "hiap",
        sourceType: "hiap_ranking",
        sourceId: expect.stringMatching(/^ranking-1:/),
        inventoryId: "inventory-1",
        cityId: "city-1",
        projectId: "project-1",
        organizationId: "organization-1",
        contentDigest: expect.any(String),
        labels: expect.objectContaining({ actionCount: 1 }),
      }),
    );
    expect(registerNativeInput.mock.calls[0][0]).not.toHaveProperty(
      "rankedActions",
    );
  });

  it("does not register pending rankings or successful rankings without durable rows", async () => {
    await expect(
      registerHIAPRanking({ ...ranking, status: "PENDING" } as never),
    ).rejects.toThrow("Only successful HIAP rankings");

    rankedModel.findAll.mockResolvedValue([]);
    await expect(registerHIAPRanking(ranking)).rejects.toThrow(
      "Only persisted HIAP rankings",
    );
    expect(registerNativeInput).not.toHaveBeenCalled();
  });

  it("creates separate ranked and unranked selection artifacts and withdraws stale rows", async () => {
    rankingModel.findOne.mockResolvedValue(ranking);
    rankedModel.findAll.mockResolvedValue([
      { actionId: "ranked-1" },
      { actionId: "ranked-1" },
    ]);
    unrankedModel.findAll.mockResolvedValue([
      { actionId: "unranked-1" },
      { actionId: "unranked-1" },
    ]);
    catalogModel.findAll.mockResolvedValue([
      {
        id: "catalog-stale",
        sourceType: "hiap_unranked_selection",
        labels: { actionId: "old-action", actionType: "mitigation" },
      },
      {
        id: "catalog-other-type",
        sourceType: "hiap_unranked_selection",
        labels: { actionId: "adaptation-action", actionType: "adaptation" },
      },
    ]);

    await registerHIAPSelections({
      inventoryId: "inventory-1",
      actionType: "mitigation" as never,
      authorId: "user-1",
    });

    expect(registerNativeInput).toHaveBeenCalledTimes(2);
    expect(registerNativeInput).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "hiap_ranked_selection",
        sourceId: "ranking-1:ranked-1",
      }),
    );
    expect(registerNativeInput).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "hiap_unranked_selection",
        sourceId: "inventory-1:mitigation:unranked-1",
      }),
    );
    expect(withdrawNativeInput).toHaveBeenCalledWith("catalog-stale");
    expect(withdrawNativeInput).not.toHaveBeenCalledWith("catalog-other-type");
  });

  it("versions action plans by persisted content digest without copying plan content", async () => {
    catalogModel.findAll.mockResolvedValue([
      {
        id: "catalog-old-plan",
        availability: "active",
      },
    ]);
    const plan = {
      id: "plan-1",
      actionId: "action-1",
      highImpactActionRankedId: "ranked-1",
      cityLocode: "BR-SAO",
      cityId: "city-1",
      inventoryId: "inventory-1",
      actionName: "Action",
      language: "en",
      cityName: "São Paulo",
      subactions: [{ title: "Do this" }],
      createdBy: "user-1",
    } as never;

    await registerHIAPActionPlan(plan);

    expect(registerNativeInput).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "hiap_action_plan",
        sourceType: "action_plan",
        sourceId: expect.stringMatching(/^plan-1:/),
        contentDigest: expect.any(String),
        labels: expect.objectContaining({ actionPlanId: "plan-1" }),
      }),
    );
    expect(registerNativeInput.mock.calls[0][0]).not.toHaveProperty(
      "subactions",
    );
    expect(supersedeNativeInput).toHaveBeenCalledWith(
      "catalog-old-plan",
      expect.objectContaining({ sourceType: "action_plan" }),
    );
  });

  it("withdraws all active versions when an action plan is deleted", async () => {
    catalogModel.update.mockResolvedValue([2]);

    await expect(withdrawHIAPActionPlanCatalog("plan-1")).resolves.toBe(2);
    expect(catalogModel.update).toHaveBeenCalledWith(
      { availability: "withdrawn" },
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: "action_plan",
          availability: "active",
        }),
      }),
    );
  });

  it("withdraws active artifacts when a city is deleted", async () => {
    catalogModel.update.mockResolvedValue([3]);

    await expect(withdrawHIAPCatalogForCity("city-1")).resolves.toBe(3);
    expect(catalogModel.update).toHaveBeenCalledWith(
      { availability: "withdrawn" },
      expect.objectContaining({
        where: expect.objectContaining({
          owningModule: "hiap",
          cityId: "city-1",
          availability: "active",
        }),
      }),
    );
  });
});
