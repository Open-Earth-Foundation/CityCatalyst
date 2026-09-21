import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { NextRequest } from "next/server";

const query = jest.fn();
const backfillMissingHIAPRankings = jest.fn();
const backfillMissingHIAPActionPlans = jest.fn();

jest.unstable_mockModule("@/models", () => ({
  db: {
    initialized: true,
    sequelize: { query },
    models: {
      HighImpactActionRanking: { update: jest.fn(), findOne: jest.fn() },
    },
  },
}));
jest.mock("@/models", () => ({
  db: {
    initialized: true,
    sequelize: { query },
    models: {
      HighImpactActionRanking: { update: jest.fn(), findOne: jest.fn() },
    },
  },
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));
jest.unstable_mockModule("@/backend/hiap/HiapService", () => ({
  checkBulkActionRankingJob: jest.fn(),
  checkSingleActionRankingJob: jest.fn(),
}));
jest.mock("@/backend/hiap/HiapService", () => ({
  checkBulkActionRankingJob: jest.fn(),
  checkSingleActionRankingJob: jest.fn(),
}));
jest.unstable_mockModule(
  "@/backend/hiap/BulkHiapPrioritizationService",
  () => ({
    BulkHiapPrioritizationService: { startNextBatch: jest.fn() },
  }),
);
jest.mock("@/backend/hiap/BulkHiapPrioritizationService", () => ({
  BulkHiapPrioritizationService: { startNextBatch: jest.fn() },
}));
jest.unstable_mockModule(
  "@/backend/hiap/HiapNativeInputCatalogService",
  () => ({
    backfillMissingHIAPRankings,
    backfillMissingHIAPActionPlans,
  }),
);
jest.mock("@/backend/hiap/HiapNativeInputCatalogService", () => ({
  backfillMissingHIAPRankings,
  backfillMissingHIAPActionPlans,
}));

let GET: typeof import("@/app/api/v1/cron/check-hiap-jobs/route").GET;

beforeAll(async () => {
  ({ GET } = await import("@/app/api/v1/cron/check-hiap-jobs/route"));
});

beforeEach(() => {
  process.env.CC_CRON_JOB_API_KEY = "test-cron-key";
  query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("check-hiap-jobs route", () => {
  it("keeps NativeInputCatalog backfills out of the Web polling request", async () => {
    const request = new NextRequest(
      "http://localhost/api/v1/cron/check-hiap-jobs",
      { headers: { Authorization: "Bearer test-cron-key" } },
    );

    const response = await GET(request);
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(backfillMissingHIAPRankings).not.toHaveBeenCalled();
    expect(backfillMissingHIAPActionPlans).not.toHaveBeenCalled();
    expect(responseBody).not.toHaveProperty("catalogBackfilled");
    expect(responseBody).not.toHaveProperty("actionPlansBackfilled");
  });
});
