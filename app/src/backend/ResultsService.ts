import { db } from "@/models";
import { QueryTypes } from "sequelize";
import { MANUAL_INPUT_HIERARCHY } from "@/util/form-schema";
import groupBy from "lodash/groupBy";
import mapValues from "lodash/mapValues";
import { toKebabCase } from "@/util/helpers";
import { ActivityDataByScope, GroupedActivity } from "@/util/types";
import Decimal from "decimal.js";
import { bigIntToDecimal } from "@/util/big_int";

function calculatePercentage(co2eq: Decimal, total: Decimal): number {
  if (total.lessThanOrEqualTo(0)) {
    return 0;
  }
  return co2eq.times(100).div(total).round().toNumber();
}

interface TotalEmissionsRecord {
  inventory_id: string;
  co2eq: bigint;
  sector_name: string;
}

interface TopEmissionRecord {
  inventory_id: string;
  co2eq: bigint;
  sector_name: string;
  subsector_name: string;
  scope_name: string;
}

interface TotalEmissionsResult {
  inventoryId: string;
  sumOfEmissions: Decimal;
  totalEmissionsBySector: {
    sectorName: string;
    co2eq: Decimal;
    percentage: number;
  }[];
}

interface TopEmission {
  inventoryId: string;
  co2eq: Decimal;
  sectorName: string;
  subsectorName: string;
  scopeName: string;
  percentage: number;
}

interface EmissionResults {
  [inventoryId: string]: {
    totalEmissions: {
      sumOfEmissions: Decimal;
      totalEmissionsBySector: {
        sectorName: string;
        co2eq: Decimal;
        percentage: number;
      }[];
    };
    topEmissionsBySubSector: TopEmission[];
  };
}

interface ActivitiesForSectorBreakdownBulk {
  [inventoryId: string]: {
    [sectorName: string]: ActivityForSectorBreakdown[];
  };
}

interface GroupedActivityResult {
  byActivity: ResponseWithoutTotals;
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
  sector_name: string;
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

async function fetchTotalEmissionsBulk(
  inventoryIds: string[],
): Promise<TotalEmissionsResult[]> {
  const rawQuery = `
    SELECT iv.inventory_id, SUM(iv.co2eq) AS co2eq, s.sector_name 
    FROM "InventoryValue" iv
    JOIN "Sector" s ON iv.sector_id = s.sector_id
    WHERE iv.inventory_id IN (:inventoryIds)
    GROUP BY iv.inventory_id, s.sector_name
    ORDER BY iv.inventory_id, SUM(iv.co2eq) DESC
  `;

  const totalEmissionsRaw: TotalEmissionsRecord[] = await db.sequelize!.query(
    rawQuery,
    {
      replacements: { inventoryIds },
      type: QueryTypes.SELECT,
    },
  );

  // Group by inventory_id
  const grouped = groupBy(totalEmissionsRaw, "inventory_id");

  // Process each inventory's emissions
  return Object.entries(grouped).map(([inventoryId, records]) => {
    const emissions = records.map(({ co2eq, sector_name }) => ({
      sectorName: sector_name,
      co2eq: bigIntToDecimal(co2eq),
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
    WHERE iv.inventory_id IN (:inventoryIds) AND iv.co2eq IS NOT NULL
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
        co2eq: bigIntToDecimal(co2eq),
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
    SELECT iv.inventory_id, av.activity_data_jsonb, sc.reference_number, iv.input_methodology, av.co2eq, s.sector_name, ss.subsector_name, scope.scope_name
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

    const sectors = sectorNamesMap[inventoryId] || [];

    sectors.forEach((sectorName) => {
      const normalizedSectorName = sectorName.toLowerCase().replace("-", " ");
      const filteredActivities = records.filter(
        (record) => record.sector_name.toLowerCase() === normalizedSectorName,
      );

      activitiesByInventory[inventoryId][sectorName] = filteredActivities.map(
        (record) => ({
          ...record,
          co2eq: bigIntToDecimal(record.co2eq),
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
          totalEmissionsBySector,
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

// Core Emissions Breakdown Function
export const getEmissionsBreakdownBatch = async (
  inventoryIds: string[],
  sectorNamesMap: { [inventoryId: string]: string[] },
): Promise<{ [inventoryId: string]: GroupedActivityResult }> => {
  try {
    // Fetch emission results for all inventories
    const emissionResults = await getEmissionResultsBatch(inventoryIds);

    // Fetch activities for all inventories and sectors
    const activitiesForSectorBreakdown = await fetchActivitiesBulk(
      inventoryIds,
      sectorNamesMap,
    );

    const breakdownResults: { [inventoryId: string]: GroupedActivityResult } =
      {};

    // Iterate over each inventory
    for (const inventoryId of inventoryIds) {
      const emissionResult = emissionResults[inventoryId];
      const activitiesBySector =
        activitiesForSectorBreakdown[inventoryId] || {};

      if (!emissionResult) {
        console.warn(
          `No emission results found for inventoryId: ${inventoryId}`,
        );
        continue;
      }

      const activityValues: UngroupedActivityData[] = [];

      // Process activities per sector
      for (const [sectorName, activities] of Object.entries(
        activitiesBySector,
      )) {
        activities.forEach((activity) => {
          const activityData = getActivityDataValues(
            activity,
            emissionResult.totalEmissions.sumOfEmissions,
          );
          if (activityData) {
            activityValues.push(activityData);
          }
        });
      }

      // Group and calculate totals
      const grouped = groupActivities(activityValues);
      const byActivity = calculateActivityTotals(grouped);
      const byScope = calculateEmissionsByScope(activityValues);

      breakdownResults[inventoryId] = { byActivity, byScope };
    }

    return breakdownResults;
  } catch (error) {
    console.error("Error in getEmissionsBreakdownBulk:", error);
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

function convertEmissionsToStrings(
  input: ActivityDataByScope,
): ActivityDataByScope {
  return {
    activityTitle: input.activityTitle,
    scopes: input.scopes,
    totalEmissions: input.totalEmissions,
    percentage: input.percentage,
  };
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
  return Object.values(activities).map(convertEmissionsToStrings);
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

export async function getEmissionsBreakdown(
  inventory: string,
  sectorName: string,
): Promise<{
  byActivity: ResponseWithoutTotals;
  byScope: ActivityDataByScope[];
}> {
  const groupedActivityResults = await getEmissionsBreakdownBatch([inventory], {
    [inventory]: [sectorName],
  });

  return groupedActivityResults[inventory];
}

export async function getEmissionResults(inventory: string): Promise<{
  totalEmissions: Decimal;
  totalEmissionsBySector: any;
  topEmissionsBySubSector: any;
}> {
  const EmissionResults = await getEmissionResultsBatch([inventory]);
  const inventorEmissionResults = EmissionResults[inventory];
  return {
    totalEmissions: inventorEmissionResults.totalEmissions.sumOfEmissions,
    totalEmissionsBySector:
      inventorEmissionResults.totalEmissions.totalEmissionsBySector,
    topEmissionsBySubSector: inventorEmissionResults.topEmissionsBySubSector,
  };
}
