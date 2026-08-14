import { RunRankingRequest } from "@/app/api/v1/city/[city]/meed/rank/route";
import { db } from "@/models";
import PopulationService from "./PopulationService";
import createHttpError from "http-errors";

const MEED_API_URL = process.env.HIAP_MEED_BACKEND_URL + "/v1/";

type RunRankingFullRequest = {
  requestedLanguages: string[];
  topN?: number;
  createExplanations: boolean;
  cityDataList: {
    excludedActionIds: string[];
    weightsOverride: Record<string, number>;
    cityStrategicPreferencesSectors: string[];
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
              return {
                ...acc,
                [inventoryValue.gpcReferenceNumber ?? ""]: {
                  notationKey: inventoryValue.unavailableReason ?? undefined,
                  activities: inventoryValue.activityValues.map((activity) => {
                    return {
                      activityType: activity.activityData?.activityType, // TODO?
                      totalEmissions: activity.co2eq,
                      totalEmissionsUnit: "kg",
                      activityValue: activity.activityData?.activityValue, // TODO?
                      activityUnit: activity.activityData?.activityUnit, // TODO?
                      dataSource: activity.dataSource.datasourceName, // TODO is this what we need here
                      notationKey: undefined, // not tracked at this level, it's on the InventoryValue level
                    } as GpcActivity;
                  }),
                },
              };
            },
            {} as Record<string, GpcDataEntry>,
          ),
        },
      };
    });

    const result = await fetch(MEED_API_URL + "prioritize", {
      method: "POST",
      body: JSON.stringify(fullRequest),
      headers: {
        "Content-Type": "application/json",
      },
    });

    // TODO save result to database

    return result.json();
  }
}
