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
  if (total <= new Decimal(0)) {
    return 0;
  }
  return co2eq.times(100).div(total).round().toNumber();
}

async function getTotalEmissionsWithPercentage(inventory: string) {
  const rawQuery = `
      SELECT SUM(iv.co2eq) AS co2eq, sector_name 
        FROM "InventoryValue" iv
        JOIN "Sector" s ON iv.sector_id = s.sector_id
        WHERE inventory_id = :inventoryId
        GROUP BY sector_name
        ORDER BY SUM(iv.co2eq) DESC`;

  const totalEmissionsBigInt: {
    co2eq: bigint;
    sector_name: string;
  }[] = await db.sequelize!.query(rawQuery, {
    replacements: { inventoryId: inventory },
    type: QueryTypes.SELECT,
  });

  const totalEmissions = totalEmissionsBigInt.map(({ co2eq, ...rest }) => ({
    ...rest,
    co2eq: bigIntToDecimal(co2eq),
  }));
  const sumOfEmissions = totalEmissions.reduce((sum, emission) => {
    return sum.plus(emission.co2eq);
  }, new Decimal(0));

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

  const resultBigInt = (await db.sequelize!.query(rawQuery, {
    replacements: { inventoryId },
    type: QueryTypes.SELECT,
  })) as {
    co2eq: bigint;
    sector_name: string;
    subsector_name: string;
    scope_name: string;
  }[];

  return resultBigInt.map(({ co2eq, ...rest }) => ({
    ...rest,
    co2eq: bigIntToDecimal(co2eq),
  }));
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
  co2eq: Decimal;
  subsector_name: string;
  scope_name: string;
}

interface UngroupedActivityData {
  activityTitle: string;
  activityValue: Decimal | string;
  activityUnits: string;
  activityEmissions: Decimal;
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

// type ActivityForSectorBreakdownBigInt =
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
    const activitiesForSectorBreakdownBigint = (await db.sequelize!.query(
      rawQuery,
      {
        replacements: { inventoryId, sectorName: sectorName.replace("-", " ") },
        type: QueryTypes.SELECT,
      },
    )) as Omit<ActivityForSectorBreakdown, "co2eq"> & { co2eq: bigint }[];
    return activitiesForSectorBreakdownBigint.map(({ co2eq, ...rest }) => ({
      ...rest,
      co2eq: bigIntToDecimal(co2eq),
    })) as unknown as ActivityForSectorBreakdown[];
  } catch (e) {
    console.error("Error in getActivitiesForSectorBreakdown:", e);
    throw e;
  }
};

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
        (sum, activity) => new Decimal(activity.co2eq || 0).plus(sum),
        new Decimal(0),
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
