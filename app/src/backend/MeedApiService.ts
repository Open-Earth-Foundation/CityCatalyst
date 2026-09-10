import { RunRankingRequest } from "@/app/api/v1/city/[city]/meed/rank/route";
import { db } from "@/models";
import PopulationService from "./PopulationService";
import createHttpError from "http-errors";
import { InventoryService } from "./InventoryService";
import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import { logger } from "@/services/logger";

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

type ExclusionsPreviewRequest = {
  cityDataList: {
    locode: string;
    excludedSectorTags: string[];
    excludedCoBenefitKeys: string[];
    excludedActionsFreeText: string;
  }[];
};

export default class MeedApiService {
  public static async runRanking(
    inventoryId: string,
    requestBody: RunRankingRequest,
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
    const fullRequest = requestBody as RunRankingFullRequest;
    fullRequest.cityDataList = requestBody.cityDataList.map((cityData) => {
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
    });

    // make API request to MEED API
    const requestId = randomUUID(); // to be able to save it to snapshot later
    const result: MeedRankResponse = await this.makeRequest(
      "prioritize",
      fullRequest,
      requestId,
    );

    const rankedActionsRaw: MeedResponseActionRanked[] =
      result.results[0].ranked_actions;
    const removedActionsRaw: MeedResponseActionRemoved[] =
      result.results[0].removed_actions;
    const weights = result.results[0].metadata.weights;

    // save result to database
    const data = await db.sequelize?.transaction(async (transaction) => {
      // delete previous data if it's present
      await db.models.MeedActionRanked.destroy({
        where: { inventoryId },
        transaction,
      });
      await db.models.MeedActionRemoved.destroy({
        where: { inventoryId },
        transaction,
      });

      // delete existing rank snapshots so there's only one per inventory
      await db.models.MeedRankSnapshot.destroy({
        where: { inventoryId },
        transaction,
      });

      // store snapshot of ranking request and response so it can be used to generate a report
      await db.models.MeedRankSnapshot.create(
        {
          id: randomUUID(),
          inventoryId,
          request: {
            meta: { requestId },
            requestData: fullRequest,
          },
          response: result,
        },
        { transaction },
      );

      const rankedActions = await db.models.MeedActionRanked.bulkCreate(
        rankedActionsRaw.map((action) => ({
          id: randomUUID(),
          inventoryId,
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
      return { rankedActions, removedActions };
    });

    return data;
  }

  public static async getRanking(inventoryId: string) {
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

  public static async getExclusionsPreview(data: ExclusionsPreviewRequest) {
    const result = await this.makeRequest(
      "prioritize/exclusions/preview",
      data,
    );
    return result.results;
  }

  public static async getFeasibilityScores(cityId: string) {
    const city = await db.models.City.findOne({ where: { cityId } });
    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }
    const cityLocode = city.locode;
    const countryLocode = city.countryLocode;
    const result = await this.makeRequest(
      `cities/${cityLocode}/action-mitigation-feasibility-scores?country_code=${countryLocode}`,
    );
    return result;
  }

  public static async translateExplanations(
    inventoryId: string,
    sourceLanguage: string,
    targetLanguages: string[],
    rankedActionIds: string[],
  ) {
    const actions = await db.models.MeedActionRanked.findAll({
      where: { inventoryId, actionId: { [Op.in]: rankedActionIds } },
    });
    const rankedActions = actions
      .map((action) => {
        const canonicalExplanation = action.explanations?.[sourceLanguage];
        if (!canonicalExplanation) {
          logger.error(
            {
              id: action.id,
              inventoryId: action.inventoryId,
              actionId: action.actionId,
              sourceLanguage,
            },
            "MEED: Explanation missing in source language for translation, skipping translation",
          );
        }
        return {
          actionId: action.actionId,
          canonicalExplanation,
        };
      })
      .filter((rankedAction) => !!rankedAction.canonicalExplanation);

    if (rankedActions.length === 0) {
      throw new createHttpError.BadRequest(
        "Missing action explanations in source language",
      );
    }

    const result = await this.makeRequest("explanations/translate", {
      sourceLanguage,
      targetLanguages,
      rankedActions,
    });

    if (!result.translations) {
      logger.error(
        {
          inventoryId,
          sourceLanguage,
          result,
        },
        "MEED: Translation failed",
      );
      return null;
    }

    // save to database
    await db.sequelize?.transaction(async (transaction) => {
      for (const translation of result.translations) {
        const action = actions.find(
          (action) => action.actionId == translation.actionId,
        );
        if (!action) {
          logger.error(
            {
              inventoryId,
              sourceLanguage,
              result,
              actionId: translation.actionId,
            },
            "MEED: Failed to find action for translation result",
          );
          continue;
        }
        action.explanations = {
          ...action.explanations,
          ...translation.explanations,
        };
        await action.save({ transaction });
      }
    });

    return actions;
  }

  public static async generatePlan(
    inventoryId: string,
    languages: string[],
    actionId: string,
    debugContextOnly: boolean,
  ) {
    const inventory = await db.models.Inventory.findOne({
      where: { inventoryId },
      include: [{ model: db.models.City, as: "city" }],
    });
    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    const rankSnapshot = await db.models.MeedRankSnapshot.findOne({
      where: { inventoryId },
    });
    if (!rankSnapshot) {
      throw new createHttpError.NotFound(
        "Rank snapshot not found - run ranking first",
      );
    }

    const data = {
      locode: inventory.city.locode,
      actionId,
      language: languages,
      prioritizationSnapshot: {
        request: rankSnapshot.request,
        response: rankSnapshot.response,
      },
      debugContextOnly,
    };
    const result = await this.makeRequest("reports/output-plan", data);
    logger.info(
      { inventoryId, languages, actionId, result, data },
      "MEED output plan route finished",
    );

    // save result to database, update existing report if it exists
    let report = await db.models.MeedActionReport.findOne({
      where: { inventoryId, actionId: result.action_id },
    });
    if (report) {
      await report.update({
        inventoryId,
        actionId: result.action_id,
        languages: result.language,
        chapters: result.chapters,
      });
    } else {
      report = await db.models.MeedActionReport.create({
        id: randomUUID(),
        inventoryId,
        actionId: result.action_id,
        languages: result.language,
        chapters: result.chapters,
      });
    }

    return report;
  }

  public static async getPlan(inventoryId: string, actionId: string) {
    const plan = await db.models.MeedActionReport.findOne({
      where: {
        inventoryId,
        actionId,
      },
    });

    if (!plan) {
      throw new createHttpError.NotFound("Plan not found");
    }

    return plan;
  }

  private static async makeRequest(
    route: string,
    data: object | null = null,
    requestId: string | undefined = undefined,
  ) {
    const method = data == null ? "GET" : "POST";
    requestId = requestId ?? randomUUID();
    const body =
      data == null
        ? undefined
        : JSON.stringify({
            requestData: data,
            meta: {
              requestId,
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
