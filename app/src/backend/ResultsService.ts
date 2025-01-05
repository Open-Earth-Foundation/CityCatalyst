import { db } from "@/models";
import { QueryTypes } from "sequelize";
import { MANUAL_INPUT_HIERARCHY } from "@/util/form-schema";
import groupBy from "lodash/groupBy";
import mapValues from "lodash/mapValues";
import { toKebabCase } from "@/util/helpers";
import { ActivityDataByScope, GroupedActivity } from "@/util/types";
import Decimal from "decimal.js";
import { bigIntToDecimal } from "@/util/big_int";
import createHttpError from "http-errors";
import { getGrowthRatesFromOC } from "./OpenClimateService";
import { Inventory } from "@/models/Inventory";

function multiplyBigIntByFraction(
  stringValue: string,
  fraction: number,
): string {
  const decimalValue = new Decimal(stringValue);
  const result = decimalValue.times(fraction);
  return result.toFixed(0); // Convert back to bigint, rounding if necessary
}

function sumBigIntBy(array: any[], fieldName: string): bigint {
  return array.reduce((sum, item) => sum + BigInt(item[fieldName]), 0n);
}

function calculatePercentage(co2eq: Decimal, total: Decimal): number {
  if (total.lessThanOrEqualTo(0)) {
    return 0;
  }
  return co2eq.times(100).div(total).round().toNumber();
}

interface TotalEmissionsRecord {
  inventory_id: string;
  co2eq: bigint;
  sector_name: SectorNamesInDB;
}

interface TopEmissionRecord {
  inventory_id: string;
  co2eq: bigint;
  sector_name: SectorNamesInDB;
  subsector_name: string;
  scope_name: string;
}

interface TotalEmissionsResult {
  inventoryId: string;
  sumOfEmissions: Decimal;
  totalEmissionsBySector: {
    sectorName: SectorNamesInDB;
    co2eq: Decimal;
    percentage: number;
  }[];
}

interface TopEmission {
  inventoryId: string;
  co2eq: Decimal;
  sectorName: SectorNamesInDB;
  subsectorName: string;
  scopeName: string;
  percentage: number;
}

interface EmissionResults {
  [inventoryId: string]: {
    totalEmissions: {
      sumOfEmissions: Decimal;
      totalEmissionsBySector: {
        sectorName: SectorNamesInFE;
        co2eq: Decimal;
        percentage: number;
      }[];
    };
    topEmissionsBySubSector: TopEmission[];
  };
}

type ActivitiesForSectorBreakdownBulk = {
  [inventoryId: string]: {
    [sectorName in SectorNamesInDB]?: ActivityForSectorBreakdown[];
  };
};

interface GroupedActivityResult {
  // byActivity: ResponseWithoutTotals;
  byScope: ActivityDataByScope[];
}

interface ResponseWithoutTotals {
  [activity: string]: {
    [key: string]: {
      [units: string]: GroupedActivity;
    };
  };
}

interface ActivityForSectorBreakdown {
  reference_number: string;
  input_methodology: string;
  activity_data_jsonb: Record<string, any>;
  co2eq: Decimal;
  subsector_name: string;
  scope_name: string;
  sector_name: SectorNamesInDB;
}

type ActivityForSectorBreakdownRecords = ActivityForSectorBreakdown & {
  co2eq: bigint;
};

interface UngroupedActivityData {
  activityTitle: string;
  activityValue: Decimal | string;
  activityUnits: string;
  activityEmissions: Decimal;
  emissionsPercentage: number;
  subsectorName: string;
  scopeName: string;
}

/** we get this names for the sectors in the query from the FE */
export type SectorNamesInFE =
  | "stationary-energy"
  | "transportation"
  | "waste"
  | "ippu"
  | "afolu";

/** and we convert them to the names they have in the DB */
const SectorMappingsFromFEToDB = {
  "stationary-energy": "Stationary Energy",
  transportation: "Transportation",
  waste: "Waste",
  ippu: "Industrial Processes and Product Uses (IPPU)",
  afolu: "Agriculture, Forestry, and Other Land Use (AFOLU)",
};

export type SectorNamesInDB =
  | "Stationary Energy"
  | "Transportation"
  | "Waste"
  | "Industrial Processes and Product Uses (IPPU)"
  | "Agriculture, Forestry, and Other Land Use (AFOLU)";

const SectorMappingsFromDBToFE = {
  "Stationary Energy": "stationary-energy",
  Transportation: "transportation",
  Waste: "waste",
  "Industrial Processes and Product Uses (IPPU)": "ippu",
  "Agriculture, Forestry, and Other Land Use (AFOLU)": "afolu",
};

export async function getTotalEmissionsBySector(inventoryIds: string[]) {
  const rawQuery = `
      SELECT iv.inventory_id, SUM(iv.co2eq) AS co2eq, s.sector_name, s.reference_number
      FROM "InventoryValue" iv
               JOIN "Sector" s ON iv.sector_id = s.sector_id
      WHERE iv.inventory_id IN (:inventoryIds)
      GROUP BY iv.inventory_id, s.sector_name, s.reference_number
      ORDER BY iv.inventory_id, SUM(iv.co2eq) DESC
  `;

  return (await db.sequelize!.query(rawQuery, {
    replacements: { inventoryIds },
    type: QueryTypes.SELECT,
  })) as {
    co2eq: bigint;
    inventory_id: string;
    sector_name: SectorNamesInDB;
    reference_number: string;
  }[];
}

async function fetchTotalEmissionsBulk(
  inventoryIds: string[],
): Promise<TotalEmissionsResult[]> {
  const totalEmissionsRaw = await getTotalEmissionsBySector(inventoryIds);

  // Group by inventory_id
  const grouped = groupBy(totalEmissionsRaw, "inventory_id");

  // Process each inventory's emissions
  return Object.entries(grouped).map(([inventoryId, records]) => {
    const emissions = records.map(({ co2eq, sector_name }) => ({
      sectorName: sector_name,
      co2eq: bigIntToDecimal(co2eq || 0n),
    }));

    const sumOfEmissions = emissions.reduce(
      (sum, { co2eq }) => sum.plus(co2eq),
      new Decimal(0),
    );

    const totalEmissionsBySector = emissions.map(({ sectorName, co2eq }) => ({
      sectorName,
      co2eq,
      percentage: calculatePercentage(co2eq, sumOfEmissions),
    }));

    return {
      inventoryId,
      sumOfEmissions,
      totalEmissionsBySector,
    };
  });
}

// b. Fetch Top Emissions by Subsector (Bulk)
async function fetchTopEmissionsBulk(
  inventoryIds: string[],
): Promise<{ [inventoryId: string]: TopEmission[] }> {
  const rawQuery = `
      SELECT iv.inventory_id, iv.co2eq, s.sector_name, ss.subsector_name, scope.scope_name
      FROM "InventoryValue" iv
               JOIN "Sector" s ON iv.sector_id = s.sector_id
               JOIN "SubSector" ss ON iv.sub_sector_id = ss.subsector_id
               LEFT JOIN "SubCategory" sc ON iv.sub_category_id = sc.subcategory_id
               JOIN "Scope" scope ON scope.scope_id = sc.scope_id OR ss.scope_id = scope.scope_id
      WHERE iv.inventory_id IN (:inventoryIds)
        AND iv.co2eq IS NOT NULL
      ORDER BY iv.inventory_id, iv.co2eq DESC
  `;

  const topEmissionsRaw: TopEmissionRecord[] = await db.sequelize!.query(
    rawQuery,
    {
      replacements: { inventoryIds },
      type: QueryTypes.SELECT,
    },
  );

  // Group by inventory_id
  const grouped = groupBy(topEmissionsRaw, "inventory_id");

  const topEmissions: { [inventoryId: string]: TopEmission[] } = {};

  for (const [inventoryId, records] of Object.entries(grouped)) {
    topEmissions[inventoryId] = records
      .slice(0, 3)
      .map(({ co2eq, sector_name, subsector_name, scope_name }) => ({
        inventoryId,
        co2eq: bigIntToDecimal(co2eq || 0n),
        sectorName: sector_name,
        subsectorName: subsector_name,
        scopeName: scope_name,
        percentage: 0, // To be calculated later
      }));
  }

  return topEmissions;
}

// c. Fetch Activities for Sector Breakdown (Bulk)
async function fetchActivitiesBulk(
  inventoryIds: string[],
  sectorNamesMap: { [inventoryId: string]: string[] },
): Promise<ActivitiesForSectorBreakdownBulk> {
  // Flatten sector names and ensure uniqueness
  const uniqueSectorNames = Array.from(
    new Set(
      Object.values(sectorNamesMap)
        .flat()
        .map((name) => name.toLowerCase().replace("-", " ")),
    ),
  );

  const rawQuery = `
      SELECT iv.inventory_id,
             av.activity_data_jsonb,
             sc.reference_number,
             iv.input_methodology,
             av.co2eq,
             s.sector_name,
             ss.subsector_name,
             scope.scope_name
      FROM "ActivityValue" av
               JOIN "InventoryValue" iv ON av.inventory_value_id = iv.id
               JOIN "Sector" s ON iv.sector_id = s.sector_id
               JOIN "SubSector" ss ON iv.sub_sector_id = ss.subsector_id
               LEFT JOIN "SubCategory" sc ON iv.sub_category_id = sc.subcategory_id
               JOIN "Scope" scope ON scope.scope_id = sc.scope_id OR ss.scope_id = scope.scope_id
      WHERE iv.inventory_id IN (:inventoryIds)
        AND LOWER(s.sector_name) IN (:sectorNames)
  `;

  const activitiesRaw: ActivityForSectorBreakdownRecords[] =
    await db.sequelize!.query(rawQuery, {
      replacements: { inventoryIds, sectorNames: uniqueSectorNames },
      type: QueryTypes.SELECT,
    });

  // Group by inventory_id and sector_name
  const grouped = groupBy(activitiesRaw, "inventory_id");

  const activitiesByInventory: ActivitiesForSectorBreakdownBulk = {};

  for (const [inventoryId, records] of Object.entries(grouped)) {
    activitiesByInventory[inventoryId] = {};

    const sectors = (sectorNamesMap[inventoryId] as SectorNamesInDB[]) || [];

    sectors.forEach((sectorName) => {
      const normalizedSectorName = sectorName.toLowerCase().replace("-", " ");
      const filteredActivities = records.filter(
        (record) =>
          (record.sector_name as string).toLowerCase() === normalizedSectorName,
      );

      activitiesByInventory[inventoryId][sectorName] = filteredActivities.map(
        (record) => ({
          ...record,
          co2eq: bigIntToDecimal(record.co2eq || 0n),
        }),
      );
    });
  }

  return activitiesByInventory;
}

// Core Emission Results Function
export async function getEmissionResultsBatch(
  inventoryIds: string[],
): Promise<EmissionResults> {
  const [totalEmissionsResults, topEmissionsResults] = await Promise.all([
    fetchTotalEmissionsBulk(inventoryIds),
    fetchTopEmissionsBulk(inventoryIds),
  ]);

  const emissionResults: EmissionResults = {};

  // Map total emissions
  totalEmissionsResults.forEach(
    ({ inventoryId, sumOfEmissions, totalEmissionsBySector }) => {
      emissionResults[inventoryId] = {
        totalEmissions: {
          sumOfEmissions,
          totalEmissionsBySector: totalEmissionsBySector.map((e) => {
            return {
              ...e,
              sectorName: SectorMappingsFromDBToFE[
                e.sectorName as unknown as SectorNamesInDB
              ] as SectorNamesInFE,
            };
          }),
        },
        topEmissionsBySubSector: [], // To be filled next
      };
    },
  );

  // Map top emissions and calculate percentages
  for (const [inventoryId, topEmissions] of Object.entries(
    topEmissionsResults,
  )) {
    if (emissionResults[inventoryId]) {
      emissionResults[inventoryId].topEmissionsBySubSector = topEmissions.map(
        (emission) => ({
          ...emission,
          percentage: emissionResults[inventoryId].totalEmissions.sumOfEmissions
            ? calculatePercentage(
                emission.co2eq,
                emissionResults[inventoryId].totalEmissions.sumOfEmissions,
              )
            : 0,
        }),
      );
    }
  }

  return emissionResults;
}

const fetchInventoryValuesBySector = async (
  inventoryId: string,
  sectorName: SectorNamesInFE,
) => {
  const rawQuery = `
      SELECT sum(iv.co2eq) as co2eq,
             ss.subsector_name,
             scope.scope_name
      FROM "InventoryValue" iv
               LEFT JOIN "ActivityValue" av ON av.inventory_value_id = iv.id
               JOIN "Sector" s ON iv.sector_id = s.sector_id
               JOIN "SubSector" ss ON iv.sub_sector_id = ss.subsector_id
               LEFT JOIN "SubCategory" sc ON iv.sub_category_id = sc.subcategory_id
               JOIN "Scope" scope ON scope.scope_id = sc.scope_id OR ss.scope_id = scope.scope_id
      WHERE iv.inventory_id = (:inventoryId)
        and iv.co2eq IS NOT NULL
        AND (s.sector_name) = (:sectorName)
      GROUP BY ss.subsector_name, scope.scope_name
  `;
  const activitiesRaw: ActivityForSectorBreakdownRecords[] =
    await db.sequelize!.query(rawQuery, {
      replacements: {
        inventoryId,
        sectorName: SectorMappingsFromFEToDB[sectorName as SectorNamesInFE],
      },
      type: QueryTypes.SELECT,
    });
  return activitiesRaw as InventoryValuesBySector[];
};

interface InventoryValuesBySector {
  sector_name: SectorNamesInDB;
  scope_name: string;
  co2eq: bigint;
}

type InventoryValuesBySectorByScope = {
  [sectorName in SectorNamesInDB]: InventoryValuesBySector[];
};

/** Core Emissions Breakdown Function
 * Simplified version with only data by sector, not by activity. works for data inputted manually and from 3rd parties.
 * [ON-3126] restore byActivity:  bring back changes from commit 9584504412c2da47eeba2a8e3eaaa15c739e05bc*/
export const getEmissionsBreakdownBatch = async (
  inventoryId: string,
  sectorName: SectorNamesInFE,
): Promise<GroupedActivityResult> => {
  try {
    const emissionsForSector = await fetchInventoryValuesBySector(
      inventoryId,
      sectorName,
    );

    const bySubSector: InventoryValuesBySectorByScope = groupBy(
      emissionsForSector,
      "subsector_name",
    ) as InventoryValuesBySectorByScope;

    const totalEmissions = bigIntToDecimal(
      sumBigIntBy(emissionsForSector, "co2eq"),
    );

    const resultsByScope = Object.entries(bySubSector).map(
      ([sectorName, scopeValues]) => {
        const totalSectorEmissions = bigIntToDecimal(
          sumBigIntBy(scopeValues, "co2eq"),
        );
        const scopes: { [key: string]: Decimal } = {};

        scopeValues.forEach(
          ({ scope_name, co2eq }: { scope_name: string; co2eq: bigint }) => {
            scopes[scope_name] = bigIntToDecimal(co2eq || 0n);
          },
        );

        return {
          activityTitle: sectorName,
          scopes,
          totalEmissions: totalSectorEmissions,
          percentage: calculatePercentage(totalSectorEmissions, totalEmissions),
        };
      },
    );
    return { byScope: resultsByScope };
  } catch (error) {
    console.error("Error in getEmissionsBreakdownBatch:", error);
    throw error;
  }
};

// Existing Helper Functions (Unchanged)
const getActivityDataValues = (
  activity: ActivityForSectorBreakdown,
  sumOfEmissions: Decimal,
): UngroupedActivityData | null => {
  const {
    reference_number,
    input_methodology,
    activity_data_jsonb,
    co2eq,
    subsector_name,
    scope_name,
  } = activity;
  const manualInputHierarchyElement = MANUAL_INPUT_HIERARCHY[reference_number];
  const isDirectMeasure = input_methodology === "direct-measure";
  const methodologyFields = isDirectMeasure
    ? manualInputHierarchyElement.directMeasure
    : manualInputHierarchyElement.methodologies?.find(
        (m) => m.id === input_methodology,
      );

  if (!methodologyFields) {
    console.error(
      `Methodology fields not found for ${reference_number}, ${input_methodology}`,
    );
    return null;
  }

  const { activityTypeField, activityUnitsField } = methodologyFields;
  const activityPrefix = isDirectMeasure ? "" : "activity-";

  return {
    activityTitle: activityTypeField
      ? toKebabCase(activity_data_jsonb[activityTypeField])
      : "N/A",
    activityValue: activityUnitsField
      ? activity_data_jsonb[activityPrefix + activityUnitsField]
      : "N/A",
    activityUnits: activityUnitsField
      ? activity_data_jsonb[activityPrefix + activityUnitsField + "-unit"]
      : "N/A",
    activityEmissions: co2eq,
    emissionsPercentage: calculatePercentage(co2eq, sumOfEmissions),
    subsectorName: toKebabCase(subsector_name),
    scopeName: scope_name,
  };
};

const fetch3rdPartyInventoryValues = (inventoryId: string) => {
  const rawQuery = `SELECT iv.id,
                           iv.co2eq,
                           scope.scope_name
                    FROM "InventoryValue" iv
                             JOIN "Sector" s ON iv.sector_id = s.sector_id
                             JOIN "SubSector" ss ON iv.sub_sector_id = ss.subsector_id
                             LEFT JOIN "SubCategory" sc ON iv.sub_category_id = sc.subcategory_id
                             JOIN "Scope" scope ON scope.scope_id = sc.scope_id OR ss.scope_id = scope.scope_id
                    WHERE iv.inventory_id = (:inventoryId)
                      and iv.datasource_id is not null;`;

  return db.sequelize!.query(rawQuery, {
    replacements: { inventoryId },
    type: QueryTypes.SELECT,
  }) as {} as Promise<
    {
      id: string;
      co2eq: bigint;
      scope_name: string;
    }[]
  >;
};

async function calculateThirdPartyEmissionsByScope(
  inventoryId: string,
): Promise<ActivityDataByScope[]> {
  const inventoryValues = await fetch3rdPartyInventoryValues(inventoryId);
  const scopes = inventoryValues.map((value) => {
    const scopeName = value.scope_name;

    if (!scopeName) {
      throw new createHttpError.InternalServerError(
        "Scope name not found for inventory value " + value.id,
      );
    }

    const co2eq = value.co2eq ?? 0n;
    const totalEmissions = bigIntToDecimal(co2eq || 0n);

    return {
      activityTitle: "mixed-activities",
      scopes: {
        [scopeName]: bigIntToDecimal(co2eq || 0n),
      },
      totalEmissions,
      percentage: 100,
    };
  });

  return scopes;
}

function calculateEmissionsByScope(
  activityValues: UngroupedActivityData[],
): ActivityDataByScope[] {
  const activities: { [key: string]: ActivityDataByScope } = {};
  let total = new Decimal(0);

  // First pass: sum up emissions by activity and scope
  activityValues.forEach((item) => {
    const emissions = item.activityEmissions;
    const { activityTitle, scopeName } = item;

    if (!activities[activityTitle]) {
      activities[activityTitle] = {
        activityTitle,
        scopes: {},
        totalEmissions: new Decimal(0),
        percentage: 0,
      };
    }

    if (!(scopeName in activities[activityTitle].scopes)) {
      activities[activityTitle].scopes[scopeName] = new Decimal(0);
    }

    activities[activityTitle].scopes[scopeName] =
      activities[activityTitle].scopes[scopeName].plus(emissions);
    activities[activityTitle].totalEmissions =
      activities[activityTitle].totalEmissions.plus(emissions);
    total = total.plus(emissions);
  });

  // Second pass: calculate percentages
  Object.values(activities).forEach((activity) => {
    activity.percentage = calculatePercentage(activity.totalEmissions, total);
  });

  // Convert the activities object to an array
  return Object.values(activities);
}

const groupActivities = (
  activitiesForSectorBreakdown: UngroupedActivityData[],
) => {
  const groupedBySubsector = groupBy(
    activitiesForSectorBreakdown,
    "subsectorName",
  );

  return mapValues(groupedBySubsector, (subsectorActivities) => {
    const groupedByActivity = groupBy(subsectorActivities, (e) =>
      toKebabCase(e.activityTitle),
    );

    return mapValues(groupedByActivity, (activityGroup) => {
      const groupedByUnit = groupBy(activityGroup, "activityUnits");

      return mapValues(groupedByUnit, (unitGroup) => {
        const isActivityValueNa = unitGroup.some(
          (e) => e.activityValue === "N/A",
        );
        return unitGroup.reduce<GroupedActivity>(
          (acc, current) => {
            const currentActivityValue =
              current.activityValue === "N/A"
                ? "N/A"
                : new Decimal(current.activityValue);
            const newActivityValue =
              isActivityValueNa ||
              acc.activityValue === "N/A" ||
              currentActivityValue === "N/A"
                ? "N/A"
                : Decimal.sum(acc.activityValue, currentActivityValue);
            return {
              activityValue: newActivityValue,
              activityUnits: current.activityUnits,
              totalActivityEmissions: (
                acc.totalActivityEmissions as Decimal
              ).plus(current.activityEmissions),
              totalEmissionsPercentage:
                acc.totalEmissionsPercentage + current.emissionsPercentage,
            };
          },
          {
            activityValue: isActivityValueNa ? "N/A" : new Decimal(0),
            activityUnits: "",
            totalActivityEmissions: new Decimal(0),
            totalEmissionsPercentage: 0,
          },
        );
      });
    });
  });
};

function calculateActivityTotals(grouped: ResponseWithoutTotals) {
  const byActivity = grouped;
  for (const activity in byActivity) {
    const activityData: any = byActivity[activity];
    const totalActivityValueByUnit: any = {};
    let totalActivityEmissions = new Decimal(0);

    for (const fuelType in activityData) {
      if (fuelType === "totals") continue;

      const fuelTypeData = activityData[fuelType];

      for (const unit in fuelTypeData) {
        const data = fuelTypeData[unit];

        const activityValue = data.activityValue;
        const activityUnits = data.activityUnits;
        const activityEmissions = data.totalActivityEmissions;

        if (activityEmissions !== "N/A") {
          const emissionsToAdd =
            activityEmissions instanceof Decimal
              ? activityEmissions
              : new Decimal(activityEmissions);
          totalActivityEmissions = totalActivityEmissions.plus(emissionsToAdd);
        }

        if (!totalActivityValueByUnit[activityUnits]) {
          totalActivityValueByUnit[activityUnits] = {
            totalActivityValue: new Decimal(0),
            hasNA: false,
          };
        }

        if (activityValue === "N/A") {
          totalActivityValueByUnit[activityUnits].hasNA = true;
        } else {
          const decimalActivityValue =
            activityValue instanceof Decimal
              ? activityValue
              : new Decimal(activityValue);
          totalActivityValueByUnit[activityUnits].totalActivityValue =
            totalActivityValueByUnit[activityUnits].totalActivityValue.plus(
              decimalActivityValue,
            );
        }
      }
    }

    const totalActivityValueByUnitOutput: any = {};
    for (const unit in totalActivityValueByUnit) {
      const { totalActivityValue, hasNA } = totalActivityValueByUnit[unit];
      totalActivityValueByUnitOutput[unit] = hasNA ? "N/A" : totalActivityValue;
    }

    activityData.totals = {
      totalActivityValueByUnit: totalActivityValueByUnitOutput,
      totalActivityEmissions,
    };
  }

  return grouped;
}

/** entry point for results/[sectorName] */
export async function getEmissionsBreakdown(
  inventory: string,
  sectorName: SectorNamesInFE,
): Promise<{
  // byActivity: ResponseWithoutTotals;
  byScope: ActivityDataByScope[];
}> {
  return getEmissionsBreakdownBatch(inventory, sectorName);
}

/** entry point for results */
export async function getEmissionResults(inventory: string): Promise<{
  totalEmissions: Decimal;
  totalEmissionsBySector: any;
  topEmissionsBySubSector: any;
}> {
  const EmissionResults = await getEmissionResultsBatch([inventory]);
  const inventoryEmissionResults = EmissionResults[inventory];
  return {
    totalEmissions: inventoryEmissionResults.totalEmissions.sumOfEmissions,
    totalEmissionsBySector:
      inventoryEmissionResults.totalEmissions.totalEmissionsBySector,
    topEmissionsBySubSector: inventoryEmissionResults.topEmissionsBySubSector,
  };
}

export const getEmissionsForecasts = async (inventoryData: Inventory) => {
  const OCResponse = await getGrowthRatesFromOC(
    inventoryData.city.locode!,
    inventoryData.created!.getFullYear(),
  );
  if (!OCResponse) {
    return {
      forecast: null,
      cluster: null,
      growthRates: null,
    };
  }
  const { growthRates, cluster } = OCResponse;
  const totalEmissionsBySector = await getTotalEmissionsBySector([
    inventoryData.inventoryId,
  ]);
  const projectedEmissions: { [year: string]: { [sector: string]: string } } =
    {};
  // Initialize projected emissions with the base year emissions
  const baseYear = inventoryData.created!.getFullYear().toString();
  projectedEmissions[baseYear] = {};
  totalEmissionsBySector.forEach((sector) => {
    projectedEmissions[baseYear][sector.reference_number] =
      sector.co2eq.toString();
  });

  // Calculate projected emissions year over year
  for (let year = parseInt(baseYear) + 1; year <= 2050; year++) {
    projectedEmissions[year] = {};
    totalEmissionsBySector.forEach((emissionsInSector) => {
      const previousYear = year - 1;
      const referenceNumber = emissionsInSector.reference_number;
      const growthRate = growthRates[year][referenceNumber];
      projectedEmissions[year][referenceNumber] = multiplyBigIntByFraction(
        projectedEmissions[previousYear][referenceNumber],
        1 + growthRate,
      );
    });
  }
  return {
    forecast: projectedEmissions,
    cluster: cluster,
    growthRates: growthRates,
  };
};
