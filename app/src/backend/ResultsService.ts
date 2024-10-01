import { db } from "@/models";
import { QueryTypes } from "sequelize";
import sumBy from "lodash/sumBy";
import { MANUAL_INPUT_HIERARCHY } from "@/util/form-schema";
import groupBy from "lodash/groupBy";
import mapValues from "lodash/mapValues";
import { toKebabCase } from "@/util/helpers";

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
      SELECT SUM(av.co2eq) AS co2eq, sector_name 
        FROM "ActivityValue" av
        JOIN "InventoryValue" iv ON av.inventory_value_id = iv.id
        JOIN "Sector" s ON iv.sector_id = s.sector_id
        WHERE inventory_id = :inventoryId
        GROUP BY sector_name
        ORDER BY SUM(av.co2eq) DESC`;

  const totalEmissions: {
    co2eq: bigint;
    sector_name: string;
  }[] = await db.sequelize!.query(rawQuery, {
    replacements: { inventoryId: inventory },
    type: QueryTypes.SELECT,
  });

  const sumOfEmissions = BigInt(sumBy(totalEmissions, (e) => Number(e.co2eq)));

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
      SELECT av.co2eq, sector_name, subsector_name, scope_name
        FROM "ActivityValue" av
        JOIN "InventoryValue" iv ON av.inventory_value_id = iv.id
        JOIN "Sector" s ON iv.sector_id = s.sector_id
        JOIN "SubSector" ss ON iv.sub_sector_id = ss.subsector_id
        JOIN "SubCategory" sc on iv.sub_category_id = sc.subcategory_id
        JOIN "Scope" scope on scope.scope_id = sc.scope_id or ss.scope_id = scope.scope_id
        WHERE inventory_id = :inventoryId
        ORDER BY av.co2eq DESC
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

interface GroupedActivity {
  activityValue: string | bigint; // Using string to avoid jest's "Don't know how to serialize Bigint" error
  activityUnits: string;
  totalActivityEmissions: string | bigint; // Using string to avoid jest's "Don't know how to serialize Bigint" error
  totalEmissionsPercentage: number;
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

const groupActivitiesBy = (
  groupedBySubsector: Record<string, UngroupedActivityData[]>,
  groupingFn: (activity: UngroupedActivityData) => string,
): Record<string, Record<string, Record<string, GroupedActivity>>> =>
  mapValues(groupedBySubsector, (subsectorActivities) => {
    const groupedByActivity = groupBy(subsectorActivities, groupingFn);

    return mapValues(groupedByActivity, (activityGroup) => {
      const groupedByUnit = groupBy(activityGroup, "activityUnits");

      return mapValues(groupedByUnit, (unitGroup) => {
        const isActivityValueNa = unitGroup.some(
          (e) => e.activityValue === "N/A",
        );
        const output = unitGroup.reduce<GroupedActivity>(
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
                : (acc.activityValue as bigint) +
                  (currentActivityValue as bigint);

            return {
              activityValue: newActivityValue,
              activityUnits: current.activityUnits,
              totalActivityEmissions:
                BigInt(acc.totalActivityEmissions) +
                BigInt(current.activityEmissions),
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

        return {
          ...output,
          activityValue: output.activityValue.toString(),
          totalActivityEmissions: output.totalActivityEmissions.toString(),
        };
      });
    });
  });

const groupActivities = (
  activitiesForSectorBreakdown: UngroupedActivityData[],
): { byActivity: any; byScope: any } => {
  const groupedBySubsector = groupBy(
    activitiesForSectorBreakdown,
    "subsectorName",
  );
  return {
    byActivity: groupActivitiesBy(groupedBySubsector, (e) =>
      toKebabCase(e.activityTitle),
    ),
    byScope: groupActivitiesBy(groupedBySubsector, (e) => e.scopeName),
  };
};

export const getEmissionsBreakdown = async (
  inventory: string,
  sectorName: string,
) => {
  try {
    const activitiesForSectorBreakdown = await getActivitiesForSectorBreakdown(
      inventory,
      sectorName,
    );
    const sumOfEmissions = activitiesForSectorBreakdown.reduce(
      (sum, activity) => sum + BigInt(activity.co2eq || 0),
      0n,
    );

    const activityValues = activitiesForSectorBreakdown
      .map((activity) => getActivityDataValues(activity, sumOfEmissions))
      .filter(
        (activity): activity is UngroupedActivityData => activity !== null,
      );

    return groupActivities(activityValues);
  } catch (error) {
    console.error("Error in getEmissionsBreakdown:", error);
    throw error;
  }
};
