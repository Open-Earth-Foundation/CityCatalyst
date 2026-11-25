/**
 * @jest-environment node
 */
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const inventoryModel = {
  count: jest.fn(),
  findAll: jest.fn(),
};
const cityModel = { findByPk: jest.fn() };

const mockDb = {
  initialized: true,
  initialize: jest.fn(),
  models: {
    Inventory: inventoryModel,
    City: cityModel,
    Project: {},
    Organization: {},
    Theme: {},
  },
};

jest.unstable_mockModule("@/models", () => ({ db: mockDb }));
jest.mock("@/models", () => ({ db: mockDb }));

const getMostRecentPopulationDataForCity = jest.fn();
jest.unstable_mockModule("@/backend/PopulationService", () => ({
  __esModule: true,
  default: { getMostRecentPopulationDataForCity },
}));
jest.mock("@/backend/PopulationService", () => ({
  __esModule: true,
  default: { getMostRecentPopulationDataForCity },
}));

const canAccessInventory = jest.fn();
jest.unstable_mockModule("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessInventory },
}));
jest.mock("@/backend/permissions/PermissionService", () => ({
  PermissionService: { canAccessInventory },
}));

const getGHGIDashboardData = jest.fn();
const getHIAPDashboardData = jest.fn();
const getCCRADashboardData = jest.fn();
jest.unstable_mockModule("@/backend/ModuleDashboardService", () => ({
  ModuleDashboardService: {
    getGHGIDashboardData,
    getHIAPDashboardData,
    getCCRADashboardData,
  },
}));
jest.mock("@/backend/ModuleDashboardService", () => ({
  ModuleDashboardService: {
    getGHGIDashboardData,
    getHIAPDashboardData,
    getCCRADashboardData,
  },
}));

jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));

let PublicDashboardService: typeof import("@/backend/PublicDashboardService").PublicDashboardService;

beforeAll(async () => {
  ({ PublicDashboardService } =
    await import("@/backend/PublicDashboardService"));
});

afterEach(() => {
  jest.clearAllMocks();
  mockDb.initialized = true;
});

const cityId = "11111111-1111-4111-8111-111111111111";

describe("PublicDashboardService.getDashboardShell", () => {
  it("returns not-found when the city has zero public inventories", async () => {
    inventoryModel.count.mockResolvedValue(0);

    const result = await PublicDashboardService.getDashboardShell(cityId);

    expect(result).toEqual({ status: "not-found" });
    expect(cityModel.findByPk).not.toHaveBeenCalled();
  });

  it("returns not-found when the city doesn't exist", async () => {
    inventoryModel.count.mockResolvedValue(1);
    cityModel.findByPk.mockResolvedValue(null);

    const result = await PublicDashboardService.getDashboardShell(cityId);

    expect(result).toEqual({ status: "not-found" });
  });

  it("returns not-found when a year is requested with no matching inventory", async () => {
    inventoryModel.count.mockResolvedValue(1);
    cityModel.findByPk.mockResolvedValue({
      toJSON: () => ({ cityId, name: "Test City" }),
    });
    inventoryModel.findAll.mockResolvedValue([
      { toJSON: () => ({ inventoryId: "inv-2023", cityId, year: 2023 }) },
    ]);
    getMostRecentPopulationDataForCity.mockResolvedValue({
      cityId,
      year: null,
      population: null,
    });

    const result = await PublicDashboardService.getDashboardShell(cityId, 1999);

    expect(result).toEqual({ status: "not-found" });
  });

  it("returns plain, JSON-safe data on the happy path", async () => {
    inventoryModel.count.mockResolvedValue(1);
    cityModel.findByPk.mockResolvedValue({
      toJSON: () => ({ cityId, name: "Test City" }),
    });
    inventoryModel.findAll.mockResolvedValue([
      { toJSON: () => ({ inventoryId: "inv-2023", cityId, year: 2023 }) },
    ]);
    getMostRecentPopulationDataForCity.mockResolvedValue({
      cityId,
      year: 2023,
      population: 123456,
    });

    const result = await PublicDashboardService.getDashboardShell(cityId);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.city).toEqual({ cityId, name: "Test City" });
    expect(typeof (result.city as Record<string, unknown>).toJSON).toBe(
      "undefined",
    );
    expect(result.latestInventory).toEqual({
      inventoryId: "inv-2023",
      cityId,
      year: 2023,
    });
    expect(result.population).toEqual({
      cityId,
      year: 2023,
      population: 123456,
    });
  });
});

describe("PublicDashboardService.getStreamableWidgetData", () => {
  const latestInventory = { inventoryId: "inv-2023", cityId, year: 2023 };

  it("resolves all three widget promises to null when there is no latest inventory", async () => {
    const { ghgi, hiap, ccra } = PublicDashboardService.getStreamableWidgetData(
      cityId,
      null,
      "en",
    );

    await expect(ghgi).resolves.toBeNull();
    await expect(hiap).resolves.toBeNull();
    await expect(ccra).resolves.toBeNull();
  });

  it("resolves to null, never rejects, when the underlying services throw", async () => {
    canAccessInventory.mockResolvedValue({
      resource: { cityId, inventoryId: latestInventory.inventoryId },
    });
    getGHGIDashboardData.mockRejectedValue(new Error("boom"));
    getHIAPDashboardData.mockRejectedValue(new Error("boom"));
    getCCRADashboardData.mockRejectedValue(new Error("boom"));

    const { ghgi, hiap, ccra } = PublicDashboardService.getStreamableWidgetData(
      cityId,
      latestInventory,
      "en",
    );

    await expect(ghgi).resolves.toBeNull();
    await expect(hiap).resolves.toBeNull();
    await expect(ccra).resolves.toBeNull();
  });

  it("resolves to null when the access check rejects the inventory", async () => {
    canAccessInventory.mockRejectedValue(new Error("forbidden"));

    const { ghgi, hiap, ccra } = PublicDashboardService.getStreamableWidgetData(
      cityId,
      latestInventory,
      "en",
    );

    await expect(ghgi).resolves.toBeNull();
    await expect(hiap).resolves.toBeNull();
    await expect(ccra).resolves.toBeNull();
    expect(getGHGIDashboardData).not.toHaveBeenCalled();
  });

  it("converts bigint totals and Sequelize instances to plain, Flight-safe values", async () => {
    canAccessInventory.mockResolvedValue({
      resource: { cityId, inventoryId: latestInventory.inventoryId },
    });
    getGHGIDashboardData.mockResolvedValue({
      inventory: {
        toJSON: () => ({ inventoryId: latestInventory.inventoryId }),
      },
      totalEmissions: { bySector: [], total: BigInt(42) },
      topEmissions: { bySubSector: [] },
      year: 2023,
    });
    getHIAPDashboardData.mockResolvedValue({
      mitigation: { id: "m", rankedActions: [], unrankedActions: [] },
      adaptation: { id: "a", rankedActions: [], unrankedActions: [] },
      inventoryId: latestInventory.inventoryId,
    });
    getCCRADashboardData.mockResolvedValue({
      topRisks: [],
      inventoryId: latestInventory.inventoryId,
    });

    const { ghgi } = PublicDashboardService.getStreamableWidgetData(
      cityId,
      latestInventory,
      "en",
    );

    const result = await ghgi;
    // BigInt has no JSON representation - the global BigInt.prototype.toJSON
    // patch (src/util/big_int_json.ts) stringifies it, same as it always has
    // for the HTTP API response; the point here is just that it's a plain
    // string and not a `bigint`, which Flight can't serialize at all.
    expect(result?.totalEmissions.total).toBe("42");
    expect(typeof result?.totalEmissions.total).not.toBe("bigint");
    expect(result?.inventory).toEqual({
      inventoryId: latestInventory.inventoryId,
    });
  });
});
