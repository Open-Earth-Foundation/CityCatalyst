import { db } from "@/models";
import { QueryTypes } from "sequelize";
import sumBy from "lodash/sumBy";
import { MANUAL_INPUT_HIERARCHY } from "@/util/form-schema";
import groupBy from "lodash/groupBy";
import mapValues from "lodash/mapValues";
import { toKebabCase } from "@/util/helpers";
import { ActivityDataByScope, GroupedActivity } from "@/util/types";

function calculatePercentage(co2eq: bigint, total: bigint): number {
  if (total <= 0n) {
    return 0;
  }
  const co2eqFloat = Number(co2eq);
  const totalFloat = Number(total);
  return Number(Number((co2eqFloat * 100) / totalFloat).toFixed(0));
}

async function getTotalEmissionsWithPercentage(inventory: string) {
  const rawQuery = `
      SELECT SUM(iv.co2eq) AS co2eq, sector_name 
        FROM "InventoryValue" iv
        JOIN "Sector" s ON iv.sector_id = s.sector_id
        WHERE inventory_id = :inventoryId
        GROUP BY sector_name
        ORDER BY SUM(iv.co2eq) DESC`;

  const totalEmissions: {
    co2eq: bigint;
    sector_name: string;
  }[] = await db.sequelize!.query(rawQuery, {
    replacements: { inventoryId: inventory },
    type: QueryTypes.SELECT,
  });

  const sumOfEmissions = totalEmissions.reduce((sum, emission) => {
    return sum + BigInt(emission.co2eq);
  }, BigInt(0));

  const totalEmissionsBySector = totalEmissions.map(
    ({ co2eq, sector_name }) => ({
      sectorName: sector_name,
      co2eq,
      percentage: calculatePercentage(co2eq, sumOfEmissions),
    }),
  );
  return { sumOfEmissions, totalEmissionsBySector };
}

async function getTopEmissions(inventoryId: string) {
  const rawQuery = `
      SELECT iv.co2eq, sector_name, subsector_name, scope_name
        FROM "InventoryValue" iv
        JOIN "Sector" s ON iv.sector_id = s.sector_id
        JOIN "SubSector" ss ON iv.sub_sector_id = ss.subsector_id
        JOIN "SubCategory" sc on iv.sub_category_id = sc.subcategory_id
        JOIN "Scope" scope on scope.scope_id = sc.scope_id or ss.scope_id = scope.scope_id
        WHERE inventory_id = :inventoryId AND iv.co2eq IS NOT NULL
        ORDER BY iv.co2eq DESC
        LIMIT 3; `;

  return (await db.sequelize!.query(rawQuery, {
    replacements: { inventoryId },
    type: QueryTypes.SELECT,
  })) as {
    co2eq: bigint;
    sector_name: string;
    subsector_name: string;
    scope_name: string;
  }[];
}

export async function getEmissionResults(inventoryId: string) {
  const [{ sumOfEmissions, totalEmissionsBySector }, topSubSectorEmissions] =
    await Promise.all([
      getTotalEmissionsWithPercentage(inventoryId),
      getTopEmissions(inventoryId),
    ]);
  const topSubSectorEmissionsWithPercentage = topSubSectorEmissions.map(
    ({ co2eq, sector_name, subsector_name, scope_name }) => ({
      subsectorName: subsector_name,
      sectorName: sector_name,
      scopeName: scope_name,
      co2eq,
      percentage: sumOfEmissions
        ? calculatePercentage(co2eq, sumOfEmissions)
        : 0,
    }),
  );

  return {
    totalEmissions: sumOfEmissions,
    totalEmissionsBySector: totalEmissionsBySector,
    topEmissionsBySubSector: topSubSectorEmissionsWithPercentage,
  };
}

interface ActivityForSectorBreakdown {
  reference_number: string;
  input_methodology: string;
  activity_data_jsonb: Record<string, any>;
  co2eq: string;
  subsector_name: string;
  scope_name: string;
}

interface UngroupedActivityData {
  activityTitle: string;
  activityValue: string;
  activityUnits: string;
  activityEmissions: bigint;
  emissionsPercentage: number;
  subsectorName: string;
  scopeName: string;
}

interface ResponseWithoutTotals {
  [activity: string]: {
    [key: string]: {
      [units: string]: GroupedActivity;
    };
  };
}

const getActivitiesForSectorBreakdown = async (
  inventoryId: string,
  sectorName: string,
): Promise<ActivityForSectorBreakdown[]> => {
  const rawQuery = `
        SELECT av.activity_data_jsonb, sc.reference_number, input_methodology, av.co2eq, s.sector_name, ss.subsector_name, scope.scope_name
        FROM "ActivityValue" av
            JOIN "InventoryValue" iv ON av.inventory_value_id = iv.id
            JOIN "Sector" s ON iv.sector_id = s.sector_id
            JOIN "SubSector" ss ON iv.sub_sector_id = ss.subsector_id
            JOIN "SubCategory" sc ON iv.sub_category_id = sc.subcategory_id
            JOIN "Scope" scope ON scope.scope_id = sc.scope_id OR ss.scope_id = scope.scope_id
        WHERE inventory_id = :inventoryId
            AND s.sector_name ilike :sectorName
    `;

  try {
    return (await db.sequelize!.query(rawQuery, {
      replacements: { inventoryId, sectorName: sectorName.replace("-", " ") },
      type: QueryTypes.SELECT,
    })) as ActivityForSectorBreakdown[];
  } catch (e) {
    console.error("Error in getActivitiesForSectorBreakdown:", e);
    throw e;
  }
};

const getActivityDataValues = (
  activity: ActivityForSectorBreakdown,
  sumOfEmissions: bigint,
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
    activityEmissions: BigInt(co2eq),
    emissionsPercentage: calculatePercentage(BigInt(co2eq), sumOfEmissions),
    subsectorName: toKebabCase(subsector_name),
    scopeName: scope_name,
  };
};

function convertEmissionsToStrings(
  input: ActivityDataByScope,
): ActivityDataByScope {
  return {
    activityTitle: input.activityTitle,
    scopes: Object.entries(input.scopes).reduce(
      (acc, [key, value]) => {
        acc[key] = value.toString();
        return acc;
      },
      {} as { [key: string]: string },
    ),
    totalEmissions: input.totalEmissions.toString(),
    percentage: input.percentage,
  };
}

function calculateEmissionsByScope(
  activityValues: UngroupedActivityData[],
): ActivityDataByScope[] {
  const activities: { [key: string]: ActivityDataByScope } = {};
  let total = 0n;

  // First pass: sum up emissions by activity and scope
  activityValues.forEach((item) => {
    const emissions = BigInt(item.activityEmissions);
    const { activityTitle, scopeName } = item;

    if (!activities[activityTitle]) {
      activities[activityTitle] = {
        activityTitle,
        scopes: {},
        totalEmissions: 0n,
        percentage: 0,
      };
    }

    if (!(scopeName in activities[activityTitle].scopes)) {
      activities[activityTitle].scopes[scopeName] = 0n;
    }

    activities[activityTitle].scopes[scopeName] =
      BigInt(activities[activityTitle].scopes[scopeName]) + BigInt(emissions);
    activities[activityTitle].totalEmissions =
      BigInt(activities[activityTitle].totalEmissions) + BigInt(emissions);
    total += BigInt(emissions);
  });

  // Second pass: calculate percentages
  Object.values(activities).forEach((activity) => {
    activity.percentage = Number(
      (BigInt(activity.totalEmissions) * 100n) / BigInt(total),
    );
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
                : BigInt(current.activityValue);
            const newActivityValue =
              isActivityValueNa ||
              acc.activityValue === "N/A" ||
              currentActivityValue === "N/A"
                ? "N/A"
                : (
                    BigInt(acc.activityValue) + (currentActivityValue as bigint)
                  ).toString();

            return {
              activityValue: newActivityValue,
              activityUnits: current.activityUnits,
              totalActivityEmissions: (
                BigInt(acc.totalActivityEmissions) +
                BigInt(current.activityEmissions)
              ).toString(),
              totalEmissionsPercentage:
                acc.totalEmissionsPercentage + current.emissionsPercentage,
            };
          },
          {
            activityValue: isActivityValueNa ? "N/A" : 0n,
            activityUnits: "",
            totalActivityEmissions: 0n,
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
    let totalActivityEmissions = BigInt(0);

    for (const fuelType in activityData) {
      // Skip 'totals' key if it exists
      if (fuelType === "totals") continue;

      const fuelTypeData = activityData[fuelType];

      for (const unit in fuelTypeData) {
        const data = fuelTypeData[unit];

        const activityValueStr = data.activityValue;
        const activityUnits = data.activityUnits;
        const totalActivityEmissionsStr = data.totalActivityEmissions;

        let activityEmissions = BigInt(0);

        // Handle totalActivityEmissions
        if (totalActivityEmissionsStr !== "N/A") {
          activityEmissions = BigInt(totalActivityEmissionsStr);
        }
        totalActivityEmissions += activityEmissions;

        // Handle activityValue by unit
        if (!totalActivityValueByUnit[activityUnits]) {
          totalActivityValueByUnit[activityUnits] = {
            totalActivityValue: BigInt(0),
            hasNA: false,
          };
        }

        if (activityValueStr === "N/A") {
          totalActivityValueByUnit[activityUnits].hasNA = true;
        } else {
          const activityValue = BigInt(activityValueStr);
          totalActivityValueByUnit[activityUnits].totalActivityValue +=
            activityValue;
        }
      }
    }

    // Prepare totalActivityValueByUnit for output
    const totalActivityValueByUnitOutput: any = {};
    for (const unit in totalActivityValueByUnit) {
      const { totalActivityValue, hasNA } = totalActivityValueByUnit[unit];
      totalActivityValueByUnitOutput[unit] = hasNA
        ? "N/A"
        : totalActivityValue.toString();
    }

    // Add totals to activityData
    activityData.totals = {
      totalActivityValueByUnit: totalActivityValueByUnitOutput,
      totalActivityEmissions: totalActivityEmissions.toString(),
    };
  }

  return grouped;
}

export const getEmissionsBreakdown = async (
  inventory: string,
  sectorName: string,
) => {
  try {
    const activitiesForSectorBreakdown = await getActivitiesForSectorBreakdown(
      inventory,
      sectorName,
    );
    const bySubsector = groupBy(activitiesForSectorBreakdown, "subsector_name");
    const emissionsBySubSector: any = {};
    Object.entries(bySubsector).forEach(([subsectorName, values]) => {
      emissionsBySubSector[subsectorName] = values.reduce(
        (sum, activity) => sum + BigInt(activity.co2eq || 0),
        0n,
      );
    });

    const activityValues = activitiesForSectorBreakdown
      .map((activity) =>
        getActivityDataValues(
          activity,
          emissionsBySubSector[activity.subsector_name],
        ),
      )
      .filter(
        (activity): activity is UngroupedActivityData => activity !== null,
      );
    const grouped = groupActivities(activityValues);
    const byActivity = calculateActivityTotals(grouped);
    const byScope = calculateEmissionsByScope(activityValues);
    return { byActivity, byScope };
  } catch (error) {
    console.error("Error in getEmissionsBreakdown:", error);
    throw error;
  }
};
