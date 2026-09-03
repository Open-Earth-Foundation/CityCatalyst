import { RunRankingRequest } from "@/app/api/v1/city/[city]/meed/rank/route";
import { db } from "@/models";
import PopulationService from "./PopulationService";
import createHttpError from "http-errors";
import { InventoryService } from "./InventoryService";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { logger } from "@/services/logger";
import { registerMEEDRanking } from "@/backend/meed/MeedNativeInputCatalogService";

const MEED_API_URL = process.env.HIAP_MEED_API_URL + "/v1/";

type RunRankingFullRequest = {
  requestedLanguages: string[];
  topN?: number;
  createExplanations: boolean;
  cityDataList: {
    excludedActionIds: string[];
    weightsOverride: Record<string, number>;
    cityStrategicPreferenceSectors: string[];
    cityStrategicPreferenceTimeframes: string[];
    cityStrategicPreferenceCoBenefitKeys: string[];

    // properties below are added from inventory data in database
    locode: string;
    countryCode: string;
    populationSize: number;
    cityEmissionsData: {
      inventoryYear: number;
      gpcData: Record<string, GpcDataEntry>;
    };
  }[];
};

type GpcDataEntry = {
  notationKey?: string;
  activities: GpcActivity[];
};

type GpcActivity = {
  activityType?: string;
  totalEmissions?: number;
  totalEmissionsUnit?: string;
  activityValue?: number;
  activityUnit?: string;
  dataSource?: string;
  notationKey?: string;
};

type MeedRankResponse = {
  results: {
    ranked_actions: MeedResponseActionRanked[];
    removed_actions: MeedResponseActionRemoved[];
    metadata: { weights: Record<string, number> };
  }[];
};

type MeedResponseActionRanked = {
  action_id: string;
  rank: number;
  final_score: number;
  impact_score: number;
  alignment_score: number;
  feasibility_score: number;
  evidence_summary: Record<string, object>;
  explanations: Record<string, string>;
};

type MeedResponseActionRemoved = {
  action_id: string;
  action_name: string;
  removal_reason?: string;
  removal_source?: string;
  /**
   * Only populated for legal hard-filter removals. hiap-meed declares it
   * `RemovedActionLegalEvidence | None` with `default=None`, so an action
   * removed for any other reason — a user exclusion, for instance — arrives
   * with `legal: null`.
   */
  legal?: {
    verdict_category?: string;
    ownership_category?: string;
    restrictions_category?: string;
    legal_references?: string[];

    // these have a key for each requested language
    ownership_description?: Record<string, string>;
    restrictions_description?: Record<string, string>;
    legal_justification?: Record<string, string>;
  };
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export default class MeedApiService {
  public static async runRanking(
    inventoryId: string,
    requestBody: RunRankingRequest,
    userId?: string,
  ): Promise<unknown> {
    const inventory = await db.models.Inventory.findOne({
      where: { inventoryId },
      include: [
        {
          model: db.models.City,
          as: "city",
          include: [{ model: db.models.Population, as: "populations" }],
        },
      ],
    });

    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    if (!inventory.cityId || !inventory.year) {
      throw new createHttpError.BadRequest(
        "Inventory has no city or year assigned",
      );
    }

    const { population } = await PopulationService.getPopulationDataForCityYear(
      inventory.cityId,
      inventory.year,
    );
    const inventoryValues = await db.models.InventoryValue.findAll({
      where: { inventoryId },
      include: [
        {
          model: db.models.ActivityValue,
          as: "activityValues",
          include: [{ model: db.models.DataSource, as: "dataSource" }],
        },
      ],
    });

    // enrich frontend request with inventory data from database
    const fullRequest: RunRankingFullRequest = {
      ...requestBody,
      createExplanations: requestBody.createExplanations ?? false,
      cityDataList: requestBody.cityDataList.map((cityData) => {
      return {
        ...cityData,
        locode: inventory.city.locode ?? "",
        countryCode: inventory.city.countryLocode ?? "",
        populationSize: population ?? 0,
        cityEmissionsData: {
          inventoryYear: inventory.year ?? 0,
          gpcData: inventoryValues.reduce(
            (acc, inventoryValue) => {
              const notationKey =
                inventoryValue.unavailableReason &&
                inventoryValue.unavailableReason.length > 0
                  ? inventoryValue.unavailableReason
                  : undefined;
              let activities = inventoryValue.activityValues.map((activity) => {
                const fields = InventoryService.extractActivityFields(
                  activity,
                  inventoryValue,
                );
                return fields as GpcActivity;
              });

              // make sure direct measure data is represented even if there are no activities
              if (activities.length === 0 && (inventoryValue.co2eq ?? 0) > 0) {
                activities = [
                  {
                    activityType: "direct-measure",
                    totalEmissions: Number(inventoryValue.co2eq) ?? 0,
                    totalEmissionsUnit: "kg",
                    dataSource: inventoryValue.dataSource?.datasourceName,
                    notationKey: inventoryValue.unavailableReason ?? undefined,
                  },
                ];
              }

              // validation for duplicate or missing GPC reference numbers
              if (!inventoryValue.gpcReferenceNumber) {
                throw new createHttpError.BadRequest(
                  "Missing GPC reference number for InventoryValue " +
                    inventoryValue.id,
                );
              }
              if (acc.hasOwnProperty(inventoryValue.gpcReferenceNumber)) {
                throw new createHttpError.BadRequest(
                  "Duplicate GPC reference number in inventory: " +
                    inventoryValue.gpcReferenceNumber,
                );
              }

              return {
                ...acc,
                [inventoryValue.gpcReferenceNumber ?? ""]: {
                  notationKey,
                  activities,
                },
              };
            },
            {} as Record<string, GpcDataEntry>,
          ),
        },
      };
      }),
    };
    const inputDigest = digest(fullRequest);

    // make API request to MEED API
    const result: MeedRankResponse = await this.makeRequest(
      "prioritize",
      fullRequest,
    );

    const rankedActionsRaw: MeedResponseActionRanked[] =
      result.results?.[0]?.ranked_actions ?? [];
    const removedActionsRaw: MeedResponseActionRemoved[] =
      result.results?.[0]?.removed_actions ?? [];
    const weights = result.results?.[0]?.metadata?.weights ?? {};
    if (rankedActionsRaw.length + removedActionsRaw.length === 0) {
      throw new createHttpError.BadRequest(
        "MEED API returned an incomplete ranking",
      );
    }
    const contentDigest = digest({
      rankedActions: rankedActionsRaw,
      removedActions: removedActionsRaw,
      weights,
    });

    if (!db.sequelize) {
      throw new createHttpError.InternalServerError(
        "Database is not initialized",
      );
    }

    const data = await db.sequelize.transaction(async (transaction) => {
      const ranking = await db.models.MeedRanking.create(
        {
          id: randomUUID(),
          inventoryId,
          userId: userId ?? null,
          inputDigest,
          contentDigest,
          status: "completed",
          actionCount: rankedActionsRaw.length + removedActionsRaw.length,
          requestedLanguages: requestBody.requestedLanguages,
          topN: requestBody.topN ?? null,
        },
        { transaction },
      );

      const rankedActions = await db.models.MeedActionRanked.bulkCreate(
        rankedActionsRaw.map((action) => ({
          id: randomUUID(),
          inventoryId,
          rankingId: ranking.id,
          actionId: action.action_id,
          rank: action.rank,
          finalScore: action.final_score,
          impactScore: action.impact_score,
          alignmentScore: action.alignment_score,
          feasibilityScore: action.feasibility_score,
          explanations: action.explanations,
          evidenceSummary: action.evidence_summary,
          weights,
        })),
        { transaction },
      );
      const removedActions = await db.models.MeedActionRemoved.bulkCreate(
        removedActionsRaw.map(
          (action) => ({
          id: randomUUID(),
          inventoryId,
          rankingId: ranking.id,
            actionId: action.action_id,
            actionName: action.action_name,
            removalReason: action.removal_reason,
            removalSource: action.removal_source,
            verdictCategory: action.legal?.verdict_category,
            ownershipCategory: action.legal?.ownership_category,
            restrictionsCategory: action.legal?.restrictions_category,
            ownershipDescription: action.legal?.ownership_description,
            restrictionsDescription: action.legal?.restrictions_description,
            legalJustification: action.legal?.legal_justification,
            legalReferences: action.legal?.legal_references,
          }),
          { transaction },
        ),
      );
      return { ranking, rankedActions, removedActions };
    });

    try {
      await registerMEEDRanking(data.ranking.id);
    } catch (error) {
      logger.error(
        { error, rankingId: data.ranking.id, inventoryId },
        "Failed to register MEED ranking in NativeInputCatalog",
      );
    }

    return {
      rankedActions: data.rankedActions,
      removedActions: data.removedActions,
    };
  }

  public static async getRanking(inventoryId: string, _userId?: string) {
    const latestRanking = await db.models.MeedRanking.findOne({
      where: { inventoryId, status: "completed" },
      order: [["created", "DESC"]],
    });
    if (latestRanking) {
      const rankedActions = await db.models.MeedActionRanked.findAll({
        where: { rankingId: latestRanking.id },
        order: [["rank", "ASC"]],
      });
      const removedActions = await db.models.MeedActionRemoved.findAll({
        where: { rankingId: latestRanking.id },
      });
      return { rankedActions, removedActions };
    }

    const rankedActions = await db.models.MeedActionRanked.findAll({
      where: {
        inventoryId,
      },
    });
    const removedActions = await db.models.MeedActionRemoved.findAll({
      where: {
        inventoryId,
      },
    });

    return { rankedActions, removedActions };
  }

  public static async getActions() {
    const result = await this.makeRequest("action-pathways");
    return result;
  }

  public static async getCityAttributes(cityId: string) {
    const city = await db.models.City.findOne({ where: { cityId } });
    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }
    const locode = city.locode;
    const result = await this.makeRequest(`cities/${locode}/attributes`);
    return result;
  }

  public static async getPolicyScores(cityId: string) {
    const city = await db.models.City.findOne({ where: { cityId } });
    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }
    const locode = city.locode;
    const result = await this.makeRequest(
      `cities/${locode}/action-policy-scores`,
    );
    return result;
  }

  public static async getFinanceFeasibility(cityId: string) {
    const city = await db.models.City.findOne({ where: { cityId } });
    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }
    const locode = city.locode;
    const countryLocode = city.countryLocode;
    const result = await this.makeRequest(
      `cities/${locode}/climate-finance/feasibility?country_code=${countryLocode}`,
    );
    return result;
  }

  public static async getFinanceOpportunities(
    cityId: string,
    sector: string,
    financeRoute: string,
  ) {
    const city = await db.models.City.findOne({ where: { cityId } });
    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }
    const countryLocode = city.countryLocode;
    const result = await this.makeRequest(
      `climate-finance/opportunities?country_code=${countryLocode}&sector=${sector}&route=${financeRoute}`,
    );
    return result;
  }

  public static async getFinanceProjects(cityId: string, actionId: string) {
    const city = await db.models.City.findOne({ where: { cityId } });
    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }
    const countryLocode = city.countryLocode;
    const result = await this.makeRequest(
      `climate-finance/projects?country_code=${countryLocode}&action_id=${actionId}`,
    );
    return result;
  }

  private static async makeRequest(route: string, data: object | null = null) {
    const method = data == null ? "GET" : "POST";
    const body =
      data == null
        ? undefined
        : JSON.stringify({
            requestData: data,
            meta: {
              requestId: randomUUID(),
            },
          });
    const response = await fetch(MEED_API_URL + route, {
      method,
      body,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();

    if (response.status != 200 || result.detail) {
      const resultString = JSON.stringify(result, null, 2);
      throw new createHttpError.BadRequest("MEED API error: " + resultString);
    }

    return result;
  }
}
