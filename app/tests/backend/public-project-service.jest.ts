/** @jest-environment node */
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const projectModel = { findByPk: jest.fn() };
const cityModel = { findAll: jest.fn() };
const organizationModel = {};
const themeModel = {};
const inventoryModel = {};
const inventoryValueModel = {};
const dataSourceModel = {};
const sequelizeQuery = jest.fn();

const mockDb = {
  initialized: true,
  initialize: jest.fn(),
  sequelize: { query: sequelizeQuery },
  models: {
    Project: projectModel,
    City: cityModel,
    Organization: organizationModel,
    Theme: themeModel,
    Inventory: inventoryModel,
    InventoryValue: inventoryValueModel,
    DataSource: dataSourceModel,
  },
};

jest.unstable_mockModule("@/models", () => ({ db: mockDb }));
jest.mock("@/models", () => ({ db: mockDb }));
jest.unstable_mockModule("@/backend/CityBoundaryService", () => ({
  __esModule: true,
  default: { getCityBoundary: jest.fn() },
}));
jest.mock("@/backend/CityBoundaryService", () => ({
  __esModule: true,
  default: { getCityBoundary: jest.fn() },
}));
jest.unstable_mockModule("@/backend/PopulationService", () => ({
  __esModule: true,
  default: { getPopulationDataForCityYear: jest.fn() },
}));
jest.mock("@/backend/PopulationService", () => ({
  __esModule: true,
  default: { getPopulationDataForCityYear: jest.fn() },
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

let getCityBoundary: jest.Mock;
let getPopulationDataForCityYear: jest.Mock;
let PublicProjectService: typeof import("@/backend/PublicProjectService").PublicProjectService;

beforeAll(async () => {
  getCityBoundary = (await import("@/backend/CityBoundaryService")).default
    .getCityBoundary as jest.Mock;
  getPopulationDataForCityYear = (await import("@/backend/PopulationService"))
    .default.getPopulationDataForCityYear as jest.Mock;
  ({ PublicProjectService } = await import("@/backend/PublicProjectService"));
});

afterEach(() => {
  jest.clearAllMocks();
  mockDb.initialized = true;
});

describe("PublicProjectService.getProjectShell", () => {
  it("returns not-found when the project does not exist", async () => {
    projectModel.findByPk.mockResolvedValue(null);

    const result = await PublicProjectService.getProjectShell("missing");

    expect(result).toEqual({ status: "not-found" });
    expect(cityModel.findAll).not.toHaveBeenCalled();
  });

  it("returns plain branding and city data on the happy path", async () => {
    projectModel.findByPk.mockResolvedValue({
      projectId: "project-1",
      name: "CHAMP Brazil",
      organization: {
        organizationId: "org-1",
        name: "Open Earth Foundation",
        logoUrl: "https://example.com/logo.png",
        active: true,
        theme: { themeKey: "blue-theme" },
      },
    });
    cityModel.findAll.mockResolvedValue([
      {
        toJSON: () => ({
          cityId: "city-1",
          name: "Rio de Janeiro",
          locode: "BR RIO",
          country: "Brazil",
          region: "RJ",
          area: 1200,
        }),
      },
    ]);

    const result = await PublicProjectService.getProjectShell("project-1");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(typeof (result.project as { toJSON?: unknown }).toJSON).toBe(
      "undefined",
    );
    expect(result.project).toEqual({
      projectId: "project-1",
      name: "CHAMP Brazil",
    });
    expect(result.organization).toEqual({
      organizationId: "org-1",
      name: "Open Earth Foundation",
      logoUrl: "https://example.com/logo.png",
      active: true,
      theme: { themeKey: "blue-theme" },
    });
    expect(result.cities).toEqual([
      {
        cityId: "city-1",
        name: "Rio de Janeiro",
        locode: "BR RIO",
        country: "Brazil",
        region: "RJ",
        area: 1200,
      },
    ]);
  });

  it("still returns ok with an empty city list when no cities are public yet", async () => {
    projectModel.findByPk.mockResolvedValue({
      projectId: "project-1",
      name: "CHAMP Brazil",
      organization: null,
    });
    cityModel.findAll.mockResolvedValue([]);

    const result = await PublicProjectService.getProjectShell("project-1");

    expect(result).toMatchObject({ status: "ok", cities: [] });
  });
});

describe("PublicProjectService.getSummary", () => {
  it("returns null when the project does not exist", async () => {
    projectModel.findByPk.mockResolvedValue(null);

    const result = await PublicProjectService.getSummary("missing");

    expect(result).toBeNull();
  });

  it("aggregates emissions, population, and data sources on the happy path", async () => {
    projectModel.findByPk.mockResolvedValue({
      cities: [
        {
          cityId: "city-1",
          inventories: [
            {
              inventoryId: "inv-1",
              year: 2023,
              inventoryValues: [{ dataSource: { id: "ds-1" } }, {}],
            },
          ],
        },
      ],
    });
    sequelizeQuery.mockResolvedValue([{ sum: 100 }]);
    getPopulationDataForCityYear.mockResolvedValue({ population: 5000 });

    const result = await PublicProjectService.getSummary("project-1");

    expect(result).toEqual({
      totalCities: 1,
      totalEmissions: 100,
      totalPopulation: 5000,
      totalDataSources: 1,
    });
  });

  it("serializes a BigInt emissions sum to a plain value", async () => {
    projectModel.findByPk.mockResolvedValue({
      cities: [],
    });
    sequelizeQuery.mockResolvedValue([{ sum: BigInt(42) }]);

    const result = await PublicProjectService.getSummary("project-1");

    expect(result?.totalEmissions).toBe("42");
    expect(typeof result?.totalEmissions).not.toBe("bigint");
  });
});

describe("PublicProjectService.getBoundaries", () => {
  it("returns empty result/errors when the project does not exist", async () => {
    projectModel.findByPk.mockResolvedValue(null);

    const result = await PublicProjectService.getBoundaries("missing");

    expect(result).toEqual({ result: [], errors: [] });
  });

  it("resolves a partial result with an errors entry when one city's boundary lookup fails", async () => {
    projectModel.findByPk.mockResolvedValue({
      cities: [
        {
          cityId: "city-1",
          name: "Rio de Janeiro",
          locode: "BR RIO",
          inventories: [{ inventoryId: "inv-1", year: 2023 }],
        },
        {
          cityId: "city-2",
          name: "Broken City",
          locode: "BR BRK",
          inventories: [],
        },
      ],
    });
    getCityBoundary.mockImplementation(async (locode: string) => {
      if (locode === "BR BRK") {
        throw new Error("boundary unavailable");
      }
      return {
        data: { type: "Point", coordinates: [0, 0] },
        boundingBox: [0, 0, 1, 1],
        area: 10,
      };
    });

    const result = await PublicProjectService.getBoundaries("project-1");

    expect(result.result).toHaveLength(1);
    expect(result.result[0].city).toEqual({
      id: "city-1",
      name: "Rio de Janeiro",
      locode: "BR RIO",
      latestInventoryId: "inv-1",
    });
    expect(result.errors).toEqual([
      { locode: "BR BRK", error: "boundary unavailable" },
    ]);
  });
});
