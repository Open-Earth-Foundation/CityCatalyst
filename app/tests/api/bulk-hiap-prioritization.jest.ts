import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { AppSession, Auth } from "@/lib/auth";
import {
  Roles,
  ACTION_TYPES,
  HighImpactActionRankingStatus,
  LANGUAGES,
} from "@/util/types";
import { db } from "@/models";
import { randomUUID } from "node:crypto";
import { POST } from "@/app/api/v1/admin/bulk-hiap-prioritization/route";
import * as HiapApiService from "@/backend/hiap/HiapApiService";
import { BulkHiapPrioritizationService } from "@/backend/hiap/BulkHiapPrioritizationService";
import {
  checkBulkActionRankingJob,
  hiapServiceWrapper,
} from "@/backend/hiap/HiapService";
import { NextRequest } from "next/server";
import GlobalAPIService from "@/backend/GlobalAPIService";
import {
  createTestData,
  cleanupTestData,
  TestData,
} from "../helpers/testDataCreationHelper";
import { setupTests, mockRequest } from "../helpers";

describe("Bulk HIAP Prioritization API", () => {
  let testData: TestData;
  let projectId: string;
  let inventoryIds: string[] = [];
  let cityIds: string[] = [];
  let mockAdminSession: AppSession;
  let mockUserSession: AppSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    // Set BATCH_SIZE to 2 for testing multi-batch scenarios
    BulkHiapPrioritizationService.BATCH_SIZE = 2;

    // Create test data with proper relationships
    testData = await createTestData({
      cityName: "Bulk HIAP Test City 1",
      organizationName: "Bulk HIAP Test Org",
      projectName: "Bulk HIAP Test Project",
    });

    projectId = testData.projectId;

    // Create multiple test cities and inventories
    for (let i = 1; i <= 3; i++) {
      const city = await db.models.City.create({
        cityId: randomUUID(),
        locode: `XX-TST-${i}`,
        name: `Test City ${i}`,
        projectId,
      });
      cityIds.push(city.cityId);

      const inventory = await db.models.Inventory.create({
        inventoryId: randomUUID(),
        cityId: city.cityId,
        year: 2024,
      });
      inventoryIds.push(inventory.inventoryId);
    }

    // Setup mock sessions
    mockAdminSession = {
      user: { id: testData.userId, role: Roles.Admin },
      expires: "1h",
    };

    mockUserSession = {
      user: { id: testData.userId, role: Roles.User },
      expires: "1h",
    };
  });

  beforeEach(() => {
    // Mock authentication
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockAdminSession);

    // Mock hiapServiceWrapper.getCityContextAndEmissionsData
    jest
      .spyOn(hiapServiceWrapper, "getCityContextAndEmissionsData")
      .mockResolvedValue({
        cityContextData: {
          locode: "XX-TST-1",
          location: "Test City",
          inventoryYear: "2024",
          populationYear: "",
          population: "",
          region: "",
          area: "",
          gdp: "",
          summary: "",
          resources: [],
          hazards: [],
        },
        emissionsData: {},
      } as any);

    // Mock HIAP API wrapper functions - these are the actual external API calls
    jest
      .spyOn(HiapApiService.hiapApiWrapper, "startBulkPrioritization")
      .mockResolvedValue({
        taskId: "mock-bulk-task-id",
      });

    jest
      .spyOn(HiapApiService.hiapApiWrapper, "checkBulkPrioritizationProgress")
      .mockResolvedValue({
        status: "completed",
      });

    jest
      .spyOn(HiapApiService.hiapApiWrapper, "getBulkPrioritizationResult")
      .mockResolvedValue({
        prioritizerResponseList: [
          {
            metadata: {
              locode: "XX-TST-1",
              rankedDate: new Date().toISOString(),
            },
            rankedActionsMitigation: [
              {
                actionId: "test-action-1",
                rank: 1,
                explanation: {
                  explanations: {
                    en: "Test explanation for mitigation",
                    pt: "Explicação de teste para mitigação",
                  },
                },
              },
            ],
            rankedActionsAdaptation: [],
          },
          {
            metadata: {
              locode: "XX-TST-2",
              rankedDate: new Date().toISOString(),
            },
            rankedActionsMitigation: [
              {
                actionId: "test-action-2",
                rank: 1,
                explanation: {
                  explanations: {
                    en: "Test explanation for mitigation",
                    pt: "Explicação de teste para mitigação",
                  },
                },
              },
            ],
            rankedActionsAdaptation: [],
          },
          {
            metadata: {
              locode: "XX-TST-3",
              rankedDate: new Date().toISOString(),
            },
            rankedActionsMitigation: [
              {
                actionId: "test-action-3",
                rank: 1,
                explanation: {
                  explanations: {
                    en: "Test explanation for mitigation",
                    pt: "Explicação de teste para mitigação",
                  },
                },
              },
            ],
            rankedActionsAdaptation: [],
          },
        ],
      } as any);

    // Mock GlobalAPIService.fetchAllClimateActions to return test climate action data
    jest.spyOn(GlobalAPIService, "fetchAllClimateActions").mockResolvedValue([
      {
        ActionID: "test-action-1",
        ActionName: "Test Mitigation Action 1",
        ActionType: [ACTION_TYPES.Mitigation],
        Hazard: null,
        Sector: ["Energy"],
        Subsector: ["Electricity"],
        PrimaryPurpose: ["Reduce emissions"],
        Description: "Test description for action 1",
        CoBenefits: {},
        EquityAndInclusionConsiderations: "Test equity considerations",
        GHGReductionPotential: {},
        AdaptationEffectiveness: null,
        CostInvestmentNeeded: "low",
        TimelineForImplementation: "<5 years",
        Dependencies: [],
        KeyPerformanceIndicators: [],
        PowersAndMandates: null,
        AdaptationEffectivenessPerHazard: {},
        biome: null,
      },
      {
        ActionID: "test-action-2",
        ActionName: "Test Mitigation Action 2",
        ActionType: [ACTION_TYPES.Mitigation],
        Hazard: null,
        Sector: ["Transport"],
        Subsector: ["Public Transit"],
        PrimaryPurpose: ["Reduce emissions"],
        Description: "Test description for action 2",
        CoBenefits: {},
        EquityAndInclusionConsiderations: "Test equity considerations",
        GHGReductionPotential: {},
        AdaptationEffectiveness: null,
        CostInvestmentNeeded: "medium",
        TimelineForImplementation: "5-10 years",
        Dependencies: [],
        KeyPerformanceIndicators: [],
        PowersAndMandates: null,
        AdaptationEffectivenessPerHazard: {},
        biome: null,
      },
      {
        ActionID: "test-action-3",
        ActionName: "Test Mitigation Action 3",
        ActionType: [ACTION_TYPES.Mitigation],
        Hazard: null,
        Sector: ["Buildings"],
        Subsector: ["Residential"],
        PrimaryPurpose: ["Reduce emissions"],
        Description: "Test description for action 3",
        CoBenefits: {},
        EquityAndInclusionConsiderations: "Test equity considerations",
        GHGReductionPotential: {},
        AdaptationEffectiveness: null,
        CostInvestmentNeeded: "high",
        TimelineForImplementation: ">10 years",
        Dependencies: [],
        KeyPerformanceIndicators: [],
        PowersAndMandates: null,
        AdaptationEffectivenessPerHazard: {},
        biome: null,
      },
    ] as any);
  });

  afterEach(async () => {
    // Clean up rankings created during tests to prevent pollution
    await db.models.HighImpactActionRanked.destroy({
      where: {},
      truncate: false,
    });
    await db.models.HighImpactActionRanking.destroy({
      where: { inventoryId: inventoryIds },
    });

    // Reset all mocks to ensure clean state
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Reset BATCH_SIZE to default
    BulkHiapPrioritizationService.BATCH_SIZE = 100;

    // Cleanup test data
    if (inventoryIds.length > 0) {
      // Delete rankings and ranked actions
      const rankings = await db.models.HighImpactActionRanking.findAll({
        where: { inventoryId: inventoryIds },
      });

      for (const ranking of rankings) {
        await db.models.HighImpactActionRanked.destroy({
          where: { hiaRankingId: ranking.id },
        });
      }

      await db.models.HighImpactActionRanking.destroy({
        where: { inventoryId: inventoryIds },
      });

      // Delete inventories
      await db.models.Inventory.destroy({
        where: { inventoryId: inventoryIds },
      });
    }

    // Delete cities
    if (cityIds.length > 0) {
      await db.models.City.destroy({ where: { cityId: cityIds } });
    }

    // Cleanup test data created by helper
    await cleanupTestData(testData);

    if (db.sequelize) await db.sequelize.close();
  });

  describe("POST /api/v1/admin/bulk-hiap-prioritization", () => {
    it("returns 401 when user is not authenticated", async () => {
      jest.spyOn(Auth, "getServerSession").mockResolvedValue(null);

      const req = mockRequest({
        projectId,
        year: 2024,
        actionType: ACTION_TYPES.Mitigation,
        languages: [LANGUAGES.en],
      });

      const res = await POST(req, { params: Promise.resolve({}) });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toContain("Unauthorized");
    });

    it("returns 403 when user is not an admin", async () => {
      jest.spyOn(Auth, "getServerSession").mockResolvedValue(mockUserSession);

      const req = mockRequest({
        projectId,
        year: 2024,
        actionType: ACTION_TYPES.Mitigation,
        languages: [LANGUAGES.en],
      });

      const res = await POST(req, { params: Promise.resolve({}) });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.message).toContain("Forbidden");
    });

    it("returns 400 when required parameters are missing", async () => {
      const req = mockRequest({
        projectId,
        // Missing year, actionType, language
      });

      const res = await POST(req, { params: Promise.resolve({}) });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });

    it("returns 400 when actionType is invalid", async () => {
      const req = mockRequest({
        projectId,
        year: 2024,
        actionType: "invalid-type",
        languages: [LANGUAGES.en],
      });

      const res = await POST(req, { params: Promise.resolve({}) });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.issues).toBeDefined();
      expect(body.error.issues[0].path).toContain("actionType");
    });

    it("returns 400 when language is invalid", async () => {
      const req = mockRequest({
        projectId,
        year: 2024,
        actionType: ACTION_TYPES.Mitigation,
        languages: ["invalid-lang"],
      });

      const res = await POST(req, { params: Promise.resolve({}) });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.issues).toBeDefined();
      expect(body.error.issues[0].path).toContain("languages");
    });

    it("returns immediately with job info when prioritization starts successfully", async () => {
      const req = mockRequest({
        projectId,
        year: 2024,
        actionType: ACTION_TYPES.Mitigation,
        languages: [LANGUAGES.en],
      });

      const res = await POST(req, { params: Promise.resolve({}) });

      expect(res.status).toBe(200);
      const body = await res.json();

      // Should return immediately with summary
      expect(body.data.totalCities).toBe(3); // 3 cities created in beforeAll
      expect(body.data.firstBatchSize).toBe(2); // First batch has 2 cities (BATCH_SIZE=2)
      expect(body.data.message).toContain("Cron");

      // Verify ranking records were created and first batch started
      const rankings = await db.models.HighImpactActionRanking.findAll({
        where: {
          inventoryId: inventoryIds,
          type: ACTION_TYPES.Mitigation,
        },
      });

      expect(rankings.length).toBe(3);

      // Check counts: 2 PENDING (first batch), 1 TO_DO (waiting for next batch)
      const pendingRankings = rankings.filter(
        (r) => r.status === HighImpactActionRankingStatus.PENDING,
      );
      const todoRankings = rankings.filter(
        (r) => r.status === HighImpactActionRankingStatus.TO_DO,
      );

      expect(pendingRankings.length).toBe(2);
      expect(todoRankings.length).toBe(1);

      // Verify PENDING rankings have the correct jobId
      pendingRankings.forEach((ranking) => {
        expect(ranking.jobId).toBe("mock-bulk-task-id");
      });

      // Verify TO_DO ranking has no jobId
      todoRankings.forEach((ranking) => {
        expect(ranking.jobId).toBeNull();
      });
    });

    it("handles empty project gracefully", async () => {
      // Use the existing project but query for a year with no inventories
      const req = mockRequest({
        projectId,
        year: 2023, // Different year than the test inventories (2024)
        actionType: ACTION_TYPES.Mitigation,
        languages: [LANGUAGES.en],
      });

      const res = await POST(req, { params: Promise.resolve({}) });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.totalCities).toBe(0);
      expect(body.data.firstBatchSize).toBe(0);
    });

    it("handles adaptation action type correctly", async () => {
      const req = mockRequest({
        projectId,
        year: 2024,
        actionType: ACTION_TYPES.Adaptation,
        languages: [LANGUAGES.pt],
      });

      const res = await POST(req, { params: Promise.resolve({}) });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.totalCities).toBeGreaterThan(0);

      // Verify rankings were created with correct type
      const rankings = await db.models.HighImpactActionRanking.findAll({
        where: {
          inventoryId: inventoryIds,
          type: ACTION_TYPES.Adaptation,
        },
      });

      expect(rankings.length).toBeGreaterThan(0);
      rankings.forEach((ranking) => {
        expect(ranking.type).toBe(ACTION_TYPES.Adaptation);
      });
    });
  });

  describe("BulkHiapPrioritizationService", () => {
    describe("createRankingRecords", () => {
      it("creates ranking records for all cities", async () => {
        const citiesData = [
          {
            cityId: cityIds[0],
            inventoryId: inventoryIds[0],
            locode: "XX-TST-1",
            cityName: "Test City 1",
          },
        ];

        await (BulkHiapPrioritizationService as any).createRankingRecords(
          citiesData,
          ACTION_TYPES.Mitigation,
          [LANGUAGES.en],
        );

        const ranking = await db.models.HighImpactActionRanking.findOne({
          where: {
            inventoryId: inventoryIds[0],
            type: ACTION_TYPES.Mitigation,
          },
        });

        expect(ranking).toBeTruthy();
        expect(ranking?.locode).toBe("XX-TST-1");
        expect(ranking?.status).toBe(HighImpactActionRankingStatus.TO_DO);
        expect(ranking?.jobId).toBeNull();
      });

      it("handles duplicate rankings gracefully (upsert)", async () => {
        const citiesData = [
          {
            cityId: cityIds[0],
            inventoryId: inventoryIds[0],
            locode: "XX-TST-1",
            cityName: "Test City 1",
          },
        ];

        // Create first time
        await (BulkHiapPrioritizationService as any).createRankingRecords(
          citiesData,
          ACTION_TYPES.Mitigation,
          [LANGUAGES.en],
        );

        // Create again (should upsert)
        await (BulkHiapPrioritizationService as any).createRankingRecords(
          citiesData,
          ACTION_TYPES.Mitigation,
          [LANGUAGES.en],
        );

        const rankings = await db.models.HighImpactActionRanking.findAll({
          where: {
            inventoryId: inventoryIds[0],
            type: ACTION_TYPES.Mitigation,
          },
        });

        // Should still have only one ranking (upserted, not duplicated)
        expect(rankings.length).toBe(1);
      });
    });

    describe("fetchCitiesWithInventories", () => {
      it("fetches cities with inventories for a project and year", async () => {
        const cities = await (
          BulkHiapPrioritizationService as any
        ).fetchCitiesWithInventories(projectId, 2024);

        expect(cities.length).toBeGreaterThan(0);
        cities.forEach((city: any) => {
          expect(city.cityId).toBeTruthy();
          expect(city.inventoryId).toBeTruthy();
          expect(city.locode).toBeTruthy();
          expect(city.cityName).toBeTruthy();
        });
      });

      it("returns empty array for non-existent project", async () => {
        const cities = await (
          BulkHiapPrioritizationService as any
        ).fetchCitiesWithInventories(randomUUID(), 2024);

        expect(cities.length).toBe(0);
      });

      it("returns empty array for year with no inventories", async () => {
        const cities = await (
          BulkHiapPrioritizationService as any
        ).fetchCitiesWithInventories(projectId, 1900);

        expect(cities.length).toBe(0);
      });
    });

    describe("markBatchRankingsAsFailed", () => {
      it("updates ranking status and stores error message", async () => {
        // Create a test ranking
        const ranking = await db.models.HighImpactActionRanking.create({
          id: randomUUID(),
          inventoryId: inventoryIds[0],
          locode: "XX-TST-1",
          type: ACTION_TYPES.Mitigation,
          langs: [LANGUAGES.en],
          status: HighImpactActionRankingStatus.PENDING,
        });

        const citiesData = [
          {
            cityId: cityIds[0],
            inventoryId: inventoryIds[0],
            locode: "XX-TST-1",
            cityName: "Test City 1",
          },
        ];

        const errorMessage = "Test error: API timeout";

        await (BulkHiapPrioritizationService as any).markBatchRankingsAsFailed(
          citiesData,
          ACTION_TYPES.Mitigation,
          errorMessage,
        );

        // Verify the ranking was updated
        const updatedRanking = await db.models.HighImpactActionRanking.findByPk(
          ranking.id,
        );

        expect(updatedRanking?.status).toBe(
          HighImpactActionRankingStatus.FAILURE,
        );
        expect(updatedRanking?.errorMessage).toBe(errorMessage);
      });
    });

    describe("processBatch", () => {
      it("starts a batch and updates ranking statuses to PENDING", async () => {
        // Create rankings with TO_DO status
        const rankings = await Promise.all(
          inventoryIds.slice(0, 2).map((invId, idx) =>
            db.models.HighImpactActionRanking.create({
              id: randomUUID(),
              inventoryId: invId,
              locode: `XX-TST-${idx + 1}`,
              type: ACTION_TYPES.Mitigation,
              langs: [LANGUAGES.en],
              status: HighImpactActionRankingStatus.TO_DO,
              jobId: null,
            }),
          ),
        );

        const citiesData = cityIds.slice(0, 2).map((cid, idx) => ({
          cityId: cid,
          inventoryId: inventoryIds[idx],
          locode: `XX-TST-${idx + 1}`,
          cityName: `Test City ${idx + 1}`,
        }));

        const result = await (
          BulkHiapPrioritizationService as any
        ).processBatch(citiesData, ACTION_TYPES.Mitigation, [LANGUAGES.en], 1);

        // Verify taskId was returned
        expect(result.taskId).toBe("mock-bulk-task-id");

        // Verify rankings were updated to PENDING (not SUCCESS - cron will do that)
        const updatedRankings = await db.models.HighImpactActionRanking.findAll(
          {
            where: {
              id: rankings.map((r) => r.id),
            },
          },
        );

        updatedRankings.forEach((ranking) => {
          expect(ranking.jobId).toBe("mock-bulk-task-id");
          expect(ranking.status).toBe(HighImpactActionRankingStatus.PENDING);
        });
      });

      it("handles partial batch failure when some cities fail context data fetch", async () => {
        // Mock getCityContextAndEmissionsData to fail for specific inventory
        const mockGetContext = jest.spyOn(
          hiapServiceWrapper,
          "getCityContextAndEmissionsData",
        );

        // Make it fail for the first city but succeed for the second
        mockGetContext.mockImplementation(async (inventoryId: string) => {
          if (inventoryId === inventoryIds[0]) {
            throw new Error("Failed to fetch context data");
          }
          return {
            cityContextData: {
              locode: "XX-TST-2",
              populationSize: 100000,
            },
            cityEmissionsData: {
              stationaryEnergyEmissions: 1000,
              transportationEmissions: 2000,
              wasteEmissions: 500,
              ippuEmissions: 300,
              afoluEmissions: 200,
            },
          };
        });

        // Create rankings with TO_DO status
        await Promise.all(
          inventoryIds.slice(0, 2).map((invId, idx) =>
            db.models.HighImpactActionRanking.create({
              id: randomUUID(),
              inventoryId: invId,
              locode: `XX-TST-${idx + 1}`,
              type: ACTION_TYPES.Mitigation,
              langs: [LANGUAGES.en],
              status: HighImpactActionRankingStatus.TO_DO,
              jobId: null,
            }),
          ),
        );

        const citiesData = cityIds.slice(0, 2).map((cid, idx) => ({
          cityId: cid,
          inventoryId: inventoryIds[idx],
          locode: `XX-TST-${idx + 1}`,
          cityName: `Test City ${idx + 1}`,
        }));

        try {
          await (BulkHiapPrioritizationService as any).processBatch(
            citiesData,
            ACTION_TYPES.Mitigation,
            [LANGUAGES.en],
            1,
          );

          // Verify first city failed
          const failedRanking = await db.models.HighImpactActionRanking.findOne(
            {
              where: {
                inventoryId: inventoryIds[0],
                type: ACTION_TYPES.Mitigation,
              },
            },
          );
          expect(failedRanking?.status).toBe(
            HighImpactActionRankingStatus.FAILURE,
          );
          expect(failedRanking?.errorMessage).toContain(
            "Failed to fetch city context data",
          );

          // Verify second city is PENDING (cron will mark SUCCESS later)
          const successRanking =
            await db.models.HighImpactActionRanking.findOne({
              where: {
                inventoryId: inventoryIds[1],
                type: ACTION_TYPES.Mitigation,
              },
            });
          expect(successRanking?.status).toBe(
            HighImpactActionRankingStatus.PENDING,
          );
          expect(successRanking?.jobId).toBe("mock-bulk-task-id");
        } finally {
          mockGetContext.mockRestore();
        }
      });

      it("throws error when all cities in batch fail context data fetch", async () => {
        // Mock getCityContextAndEmissionsData to fail for all cities
        const mockGetContext = jest.spyOn(
          hiapServiceWrapper,
          "getCityContextAndEmissionsData",
        );
        mockGetContext.mockRejectedValue(
          new Error("Failed to fetch context data"),
        );

        const citiesData = [
          {
            cityId: cityIds[0],
            inventoryId: inventoryIds[0],
            locode: "XX-TST-1",
            cityName: "Test City 1",
          },
        ];

        await expect(
          (BulkHiapPrioritizationService as any).processBatch(
            citiesData,
            ACTION_TYPES.Mitigation,
            [LANGUAGES.en],
            1,
          ),
        ).rejects.toThrow("Failed to get context data for all cities in batch");

        mockGetContext.mockRestore();
      });
    });

    describe("startNextBatch", () => {
      it("starts next batch when TO_DO rankings exist", async () => {
        // Create TO_DO rankings for the next batch
        const rankings = await Promise.all(
          inventoryIds.slice(0, 2).map((invId, idx) =>
            db.models.HighImpactActionRanking.create({
              id: randomUUID(),
              inventoryId: invId,
              locode: `XX-TST-${idx + 1}`,
              type: ACTION_TYPES.Mitigation,
              langs: [LANGUAGES.en],
              status: HighImpactActionRankingStatus.TO_DO,
              jobId: null,
            }),
          ),
        );

        const result = await BulkHiapPrioritizationService.startNextBatch(
          projectId,
          ACTION_TYPES.Mitigation,
        );

        expect(result.started).toBe(true);
        expect(result.batchSize).toBe(2);
        expect(result.taskId).toBe("mock-bulk-task-id");

        // Verify rankings were updated to PENDING
        const updatedRankings = await db.models.HighImpactActionRanking.findAll(
          {
            where: {
              id: rankings.map((r) => r.id),
            },
          },
        );

        updatedRankings.forEach((ranking) => {
          expect(ranking.status).toBe(HighImpactActionRankingStatus.PENDING);
          expect(ranking.jobId).toBe("mock-bulk-task-id");
        });
      });

      it("returns false when no TO_DO rankings exist", async () => {
        // Ensure no TO_DO rankings exist
        await db.models.HighImpactActionRanking.update(
          { status: HighImpactActionRankingStatus.SUCCESS },
          { where: { status: HighImpactActionRankingStatus.TO_DO } },
        );

        const result = await BulkHiapPrioritizationService.startNextBatch(
          projectId,
          ACTION_TYPES.Mitigation,
        );

        expect(result.started).toBe(false);
        expect(result.batchSize).toBe(0);
        expect(result.taskId).toBeUndefined();
      });

      it("respects BATCH_SIZE limit", async () => {
        // Clean up any existing TO_DO rankings first
        await db.models.HighImpactActionRanking.update(
          { status: HighImpactActionRankingStatus.SUCCESS },
          { where: { status: HighImpactActionRankingStatus.TO_DO } },
        );

        // Create additional inventories and rankings (more than BATCH_SIZE)
        const extraInventories = await Promise.all(
          Array.from({ length: 5 }, async (_, idx) => {
            const inventory = await db.models.Inventory.create({
              inventoryId: randomUUID(),
              cityId: cityIds[0], // Reuse existing city
              year: 2025, // Different year to avoid conflicts
            });
            return inventory;
          }),
        );

        // Create rankings for these new inventories
        const extraRankings = await Promise.all(
          extraInventories.map((inventory, idx) =>
            db.models.HighImpactActionRanking.create({
              id: randomUUID(),
              inventoryId: inventory.inventoryId,
              locode: `XX-TST-1`, // Use same locode as city
              type: ACTION_TYPES.Mitigation,
              langs: [LANGUAGES.en],
              status: HighImpactActionRankingStatus.TO_DO,
              jobId: null,
            }),
          ),
        );

        const result = await BulkHiapPrioritizationService.startNextBatch(
          projectId,
          ACTION_TYPES.Mitigation,
        );

        expect(result.started).toBe(true);
        expect(result.batchSize).toBe(2); // Only 2 rankings processed (BATCH_SIZE limit of 2)
        expect(result.taskId).toBe("mock-bulk-task-id");

        // Verify only 2 rankings were updated to PENDING
        const pendingRankings = await db.models.HighImpactActionRanking.findAll(
          {
            where: {
              id: extraRankings.map((r) => r.id),
              status: HighImpactActionRankingStatus.PENDING,
            },
          },
        );
        expect(pendingRankings.length).toBe(2);

        // Verify 3 rankings are still TO_DO
        const todoRankings = await db.models.HighImpactActionRanking.findAll({
          where: {
            id: extraRankings.map((r) => r.id),
            status: HighImpactActionRankingStatus.TO_DO,
          },
        });
        expect(todoRankings.length).toBe(3);

        // Clean up extra rankings and inventories
        await db.models.HighImpactActionRanking.destroy({
          where: { id: extraRankings.map((r) => r.id) },
        });
        await db.models.Inventory.destroy({
          where: { inventoryId: extraInventories.map((i) => i.inventoryId) },
        });
      });
    });
  });

  describe("Success flow: PENDING → SUCCESS", () => {
    it("completes successfully and saves ranked actions", async () => {
      // Setup: Create a PENDING ranking with jobId
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId: inventoryIds[0],
        locode: "XX-TST-1",
        type: ACTION_TYPES.Mitigation,
        langs: [LANGUAGES.en],
        jobId: "test-success-job-id",
        status: HighImpactActionRankingStatus.PENDING,
      });

      // Mock HIAP API to return successful completion
      jest
        .spyOn(HiapApiService.hiapApiWrapper, "checkBulkPrioritizationProgress")
        .mockResolvedValue({
          status: "completed",
        });

      jest
        .spyOn(HiapApiService.hiapApiWrapper, "getBulkPrioritizationResult")
        .mockResolvedValue({
          prioritizerResponseList: [
            {
              metadata: {
                locode: "XX-TST-1",
                rankedDate: new Date().toISOString(),
              },
              rankedActionsMitigation: [
                {
                  actionId: "test-action-1",
                  rank: 1,
                  explanation: {
                    explanations: {
                      en: "This action is highly recommended because...",
                      pt: "Esta ação é altamente recomendada porque...",
                    },
                  },
                },
                {
                  actionId: "test-action-2",
                  rank: 2,
                  explanation: {
                    explanations: {
                      en: "Second best action for your city",
                      pt: "Segunda melhor ação para sua cidade",
                    },
                  },
                },
              ],
              rankedActionsAdaptation: [],
            },
          ],
        } as any);

      // Call checkBulkActionRankingJob
      const isComplete = await checkBulkActionRankingJob(
        "test-success-job-id",
        LANGUAGES.en,
        ACTION_TYPES.Mitigation,
      );

      // Verify it returns true (completed)
      expect(isComplete).toBe(true);

      // Verify ranking status updated to SUCCESS
      const updatedRanking = await db.models.HighImpactActionRanking.findByPk(
        ranking.id,
      );
      expect(updatedRanking?.status).toBe(
        HighImpactActionRankingStatus.SUCCESS,
      );

      // Verify ranked actions were saved
      const rankedActions = await db.models.HighImpactActionRanked.findAll({
        where: { hiaRankingId: ranking.id },
        order: [["rank", "ASC"]],
      });

      expect(rankedActions.length).toBe(2);

      // Verify first ranked action
      expect(rankedActions[0].actionId).toBe("test-action-1");
      expect(rankedActions[0].rank).toBe(1);
      expect(rankedActions[0].type).toBe(ACTION_TYPES.Mitigation);
      expect((rankedActions[0].explanation as any).en).toContain(
        "highly recommended",
      );
      expect(rankedActions[0].lang).toBe(LANGUAGES.en);

      // Verify second ranked action
      expect(rankedActions[1].actionId).toBe("test-action-2");
      expect(rankedActions[1].rank).toBe(2);

      // Cleanup
      await db.models.HighImpactActionRanked.destroy({
        where: { hiaRankingId: ranking.id },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });

    it("saves ranked actions for both mitigation and adaptation", async () => {
      // Create PENDING ranking
      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId: inventoryIds[0],
        locode: "XX-TST-1",
        type: ACTION_TYPES.Mitigation,
        langs: [LANGUAGES.en],
        jobId: "test-mixed-actions-job",
        status: HighImpactActionRankingStatus.PENDING,
      });

      // Mock result with both mitigation and adaptation actions
      jest
        .spyOn(HiapApiService.hiapApiWrapper, "getBulkPrioritizationResult")
        .mockResolvedValue({
          prioritizerResponseList: [
            {
              metadata: {
                locode: "XX-TST-1",
                rankedDate: new Date().toISOString(),
              },
              rankedActionsMitigation: [
                {
                  actionId: "mitigation-action-1",
                  rank: 1,
                  explanation: {
                    explanations: {
                      en: "Top mitigation action",
                    },
                  },
                },
              ],
              rankedActionsAdaptation: [
                {
                  actionId: "adaptation-action-1",
                  rank: 1,
                  explanation: {
                    explanations: {
                      en: "Top adaptation action",
                    },
                  },
                },
              ],
            },
          ],
        } as any);

      // Process the job
      await checkBulkActionRankingJob(
        "test-mixed-actions-job",
        LANGUAGES.en,
        ACTION_TYPES.Mitigation,
      );

      // Verify both types of actions were saved
      const mitigationActions = await db.models.HighImpactActionRanked.findAll({
        where: {
          hiaRankingId: ranking.id,
          type: ACTION_TYPES.Mitigation,
        },
      });

      const adaptationActions = await db.models.HighImpactActionRanked.findAll({
        where: {
          hiaRankingId: ranking.id,
          type: ACTION_TYPES.Adaptation,
        },
      });

      expect(mitigationActions.length).toBe(1);
      expect(mitigationActions[0].actionId).toBe("mitigation-action-1");

      expect(adaptationActions.length).toBe(1);
      expect(adaptationActions[0].actionId).toBe("adaptation-action-1");

      // Cleanup
      await db.models.HighImpactActionRanked.destroy({
        where: { hiaRankingId: ranking.id },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: ranking.id },
      });
    });

    it("processes multiple rankings in same batch (same jobId)", async () => {
      // Create 3 PENDING rankings with same jobId (simulating a batch)
      const rankings = await Promise.all([
        db.models.HighImpactActionRanking.create({
          id: randomUUID(),
          inventoryId: inventoryIds[0],
          locode: "XX-TST-1",
          type: ACTION_TYPES.Mitigation,
          langs: [LANGUAGES.en],
          jobId: "test-batch-job",
          status: HighImpactActionRankingStatus.PENDING,
        }),
        db.models.HighImpactActionRanking.create({
          id: randomUUID(),
          inventoryId: inventoryIds[1],
          locode: "XX-TST-2",
          type: ACTION_TYPES.Mitigation,
          langs: [LANGUAGES.en],
          jobId: "test-batch-job",
          status: HighImpactActionRankingStatus.PENDING,
        }),
        db.models.HighImpactActionRanking.create({
          id: randomUUID(),
          inventoryId: inventoryIds[2],
          locode: "XX-TST-3",
          type: ACTION_TYPES.Mitigation,
          langs: [LANGUAGES.en],
          jobId: "test-batch-job",
          status: HighImpactActionRankingStatus.PENDING,
        }),
      ]);

      // Mock result with all 3 cities
      jest
        .spyOn(HiapApiService.hiapApiWrapper, "getBulkPrioritizationResult")
        .mockResolvedValue({
          prioritizerResponseList: [
            {
              metadata: {
                locode: "XX-TST-1",
                rankedDate: new Date().toISOString(),
              },
              rankedActionsMitigation: [
                {
                  actionId: "action-1",
                  rank: 1,
                  explanation: { explanations: { en: "Test" } },
                },
              ],
              rankedActionsAdaptation: [],
            },
            {
              metadata: {
                locode: "XX-TST-2",
                rankedDate: new Date().toISOString(),
              },
              rankedActionsMitigation: [
                {
                  actionId: "action-2",
                  rank: 1,
                  explanation: { explanations: { en: "Test" } },
                },
              ],
              rankedActionsAdaptation: [],
            },
            {
              metadata: {
                locode: "XX-TST-3",
                rankedDate: new Date().toISOString(),
              },
              rankedActionsMitigation: [
                {
                  actionId: "action-3",
                  rank: 1,
                  explanation: { explanations: { en: "Test" } },
                },
              ],
              rankedActionsAdaptation: [],
            },
          ],
        } as any);

      // Process the batch
      await checkBulkActionRankingJob(
        "test-batch-job",
        LANGUAGES.en,
        ACTION_TYPES.Mitigation,
      );

      // Verify all 3 rankings updated to SUCCESS
      const updatedRankings = await db.models.HighImpactActionRanking.findAll({
        where: { jobId: "test-batch-job" },
      });

      expect(updatedRankings.length).toBe(3);
      updatedRankings.forEach((ranking) => {
        expect(ranking.status).toBe(HighImpactActionRankingStatus.SUCCESS);
      });

      // Verify all 3 have ranked actions
      for (const ranking of rankings) {
        const actions = await db.models.HighImpactActionRanked.findAll({
          where: { hiaRankingId: ranking.id },
        });
        expect(actions.length).toBeGreaterThan(0);
      }

      // Cleanup
      await db.models.HighImpactActionRanked.destroy({
        where: { hiaRankingId: rankings.map((r) => r.id) },
      });
      await db.models.HighImpactActionRanking.destroy({
        where: { id: rankings.map((r) => r.id) },
      });
    });
  });

  describe("Error handling", () => {
    it("handles error when HIAP API call fails during background processing", async () => {
      // This test verifies the API endpoint handles the initial request correctly
      // even if background processing will fail
      const req = mockRequest({
        projectId,
        year: 2024,
        actionType: ACTION_TYPES.Mitigation,
        languages: [LANGUAGES.en],
      });

      const res = await POST(req, { params: Promise.resolve({}) });

      // API should still return 200 since it responds immediately
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.totalCities).toBeGreaterThan(0);

      // Note: Background processing would handle the actual failure asynchronously
      // The markBatchRankingsAsFailed service method would store the error message
    });

    it("stores error message when job status check returns failed", async () => {
      jest
        .spyOn(HiapApiService.hiapApiWrapper, "checkBulkPrioritizationProgress")
        .mockResolvedValue({
          status: "failed",
          error: "HIAP processing failed",
        });

      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId: inventoryIds[0],
        locode: "XX-TST-1",
        type: ACTION_TYPES.Mitigation,
        langs: [LANGUAGES.en],
        jobId: "test-failed-job-id",
        status: HighImpactActionRankingStatus.PENDING,
      });

      // Call checkBulkActionRankingJob directly
      const isComplete = await checkBulkActionRankingJob(
        "test-failed-job-id",
        LANGUAGES.en,
        ACTION_TYPES.Mitigation,
      );

      // Should return true for completed (failed) jobs
      expect(isComplete).toBe(true);

      // Verify ranking was updated with error message
      const updatedRanking = await db.models.HighImpactActionRanking.findByPk(
        ranking.id,
      );

      expect(updatedRanking?.status).toBe(
        HighImpactActionRankingStatus.FAILURE,
      );
      expect(updatedRanking?.errorMessage).toBeTruthy();
    });

    it("stores error message when no result found for city locode", async () => {
      // Mock result with missing city
      jest
        .spyOn(HiapApiService.hiapApiWrapper, "getBulkPrioritizationResult")
        .mockResolvedValue({
          prioritizerResponseList: [
            // Only return result for XX-TST-2, missing XX-TST-1
            {
              metadata: {
                locode: "XX-TST-2",
                rankedDate: new Date().toISOString(),
              },
              rankedActionsMitigation: [],
              rankedActionsAdaptation: [],
            },
          ],
        } as any);

      const ranking = await db.models.HighImpactActionRanking.create({
        id: randomUUID(),
        inventoryId: inventoryIds[0],
        locode: "XX-TST-1",
        type: ACTION_TYPES.Mitigation,
        langs: [LANGUAGES.en],
        jobId: "test-missing-city-job-id",
        status: HighImpactActionRankingStatus.PENDING,
      });

      // Call checkBulkActionRankingJob
      const isComplete = await checkBulkActionRankingJob(
        "test-missing-city-job-id",
        LANGUAGES.en,
        ACTION_TYPES.Mitigation,
      );

      // Should return true for completed jobs
      expect(isComplete).toBe(true);

      // Verify ranking was marked as failed with appropriate error message
      const updatedRanking = await db.models.HighImpactActionRanking.findByPk(
        ranking.id,
      );
      expect(updatedRanking?.status).toBe(
        HighImpactActionRankingStatus.FAILURE,
      );
      expect(updatedRanking?.errorMessage).toContain("XX-TST-1");
      expect(updatedRanking?.errorMessage).toContain(
        "No prioritization result",
      );
    });
  });
});
