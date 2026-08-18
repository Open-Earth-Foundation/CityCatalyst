import { RunRankingRequest } from "@/app/api/v1/city/[city]/meed/rank/route";
import { db } from "@/models";
import PopulationService from "./PopulationService";
import createHttpError from "http-errors";
import { InventoryService } from "./InventoryService";
import { randomUUID } from "node:crypto";

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
  legal: {
    verdict_category?: string;
    ownership_category?: string;
    restrictions_category?: string;
    // TODO use this once MEED API returns translation objects
    /* ownership_description?: Record<string, string>;
    restrictions_description?: Record<string, string>;
    legal_justification?: Record<string, string>; */
    ownership_description?: string;
    ownership_description_es?: string;
    restrictions_description?: string;
    restrictions_description_es?: string;
    legal_justification_en?: string;
    legal_justification?: string;
    legal_references?: string[];
  };
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

              return {
                ...acc,
                [inventoryValue.gpcReferenceNumber ?? ""]: {
                  notationKey,
                  activities: inventoryValue.activityValues.map((activity) => {
                    const fields = InventoryService.extractActivityFields(
                      activity,
                      inventoryValue,
                    );
                    return fields as GpcActivity;
                  }),
                },
              };
            },
            {} as Record<string, GpcDataEntry>,
          ),
        },
      };
    });

    // make API request to MEED API
    const response = await fetch(MEED_API_URL + "prioritize", {
      method: "POST",
      body: JSON.stringify({
        requestData: fullRequest,
        meta: {
          requestId: randomUUID(),
          generatedAtUtc: new Date().toISOString(),
          backendConsumer: "CityCatalyst",
          upstreamProvider: "CityCatalyst",
          apiContext: { endpoint: "/v1/prioritize" },
          totalRecords: 1,
        },
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();
    const resultString = JSON.stringify(result, null, 2);

    if (response.status != 200 || result.detail) {
      throw new createHttpError.BadRequest("MEED API error: " + resultString);
    }

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
            verdictCategory: action.legal.verdict_category,
            ownershipCategory: action.legal.ownership_category,
            restrictionsCategory: action.legal.restrictions_category,
            // TODO adjust once the MEED API returns translation objects for these
            ownershipDescription: {
              en: action.legal.ownership_description,
              es: action.legal.ownership_description_es,
            },
            restrictionsDescription: {
              en: action.legal.restrictions_description,
              es: action.legal.restrictions_description_es,
            },
            legalJustification: {
              en: action.legal.legal_justification_en,
              es: action.legal.legal_justification,
            },
            legalReferences: action.legal.legal_references,
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
}
