import { db } from "@/models";
import { QueryTypes } from "sequelize";
import groupBy from "lodash/groupBy";
import { ActivityDataByScope } from "@/util/types";
import Decimal from "decimal.js";
import { bigIntToDecimal } from "@/util/big_int";
import createHttpError from "http-errors";
import GlobalAPIService from "./GlobalAPIService";
import { Inventory } from "@/models/Inventory";
import { logger } from "@/services/logger";
import { Op } from "sequelize";
import { ActivityValue } from "@/models/ActivityValue";

function multiplyBigIntByFraction(
  stringValue: string,
  fraction: number,
): string {
  const decimalValue = new Decimal(stringValue);
  const result = decimalValue.times(fraction);
  return result.toFixed(0); // Convert back to bigint, rounding if necessary
}

/**
 * Percentage of gross emissions `co2eq` represents out of `grossTotal` (the sum of
 * non-negative co2eq values for the same scope). Returns null for removals (negative
 * co2eq) since "% of emissions" isn't a meaningful figure for a removal - see CC-749.
 */
function calculatePercentage(co2eq: Decimal, grossTotal: Decimal): number | null {
  if (co2eq.isNegative()) {
    return null;
  }
  if (grossTotal.lessThanOrEqualTo(0)) {
    return 0;
  }
  return co2eq.times(100).div(grossTotal).round().toNumber();
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
  /** net (emissions + removals) */
  sumOfEmissions: Decimal;
  /** sum of non-negative (emissions-only) co2eq across sectors, used as the % denominator */
  sumOfGrossEmissions: Decimal;
  /** sum of negative (removal) co2eq across sectors, kept negative */
  sumOfRemovals: Decimal;
  totalEmissionsBySector: {
    sectorName: SectorNamesInDB;
    /** net co2eq for this sector (emissions + removals) */
    co2eq: Decimal;
    grossCo2eq: Decimal;
    removalsCo2eq: Decimal;
    percentage: number;
  }[];
}

interface TopEmission {
  inventoryId: string;
  co2eq: Decimal;
  sectorName: SectorNamesInDB;
  subsectorName: string;
  scopeName: string;
  /** null when co2eq is a removal - % of emissions isn't meaningful there */
  percentage: number | null;
}

interface EmissionResults {
  [inventoryId: string]: {
    totalEmissions: {
      sumOfEmissions: Decimal;
      sumOfGrossEmissions: Decimal;
      sumOfRemovals: Decimal;
      totalEmissionsBySector: {
        sectorName: SectorNamesInFE;
        co2eq: Decimal;
        grossCo2eq: Decimal;
        removalsCo2eq: Decimal;
        percentage: number;
      }[];
    };
    topEmissionsBySubSector: TopEmission[];
  };
}

interface GroupedActivityResult {
  byScope: ActivityDataByScope[];
}

/** we get this names for the sectors in the query from the FE */
export type SectorNamesInFE =
  "stationary-energy" | "transportation" | "waste" | "ippu" | "afolu";

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

interface TotalEmissionsBySectorAndSubsector {
  co2eq: bigint;
  inventory_id: string;
  reference_number: string;
  subsector_name: string;
  ss_reference_number: string;
}

export interface EmissionsBySector {
  co2eq: bigint;
  gross_co2eq: bigint;
  removals_co2eq: bigint;
  inventory_id: string;
  sector_name: SectorNamesInDB;
  reference_number: string;
}

export async function getTotalEmissionsBySector(inventoryIds: string[]) {
  const rawQuery = `
    SELECT iv.inventory_id,
           SUM(iv.co2eq) AS co2eq,
           SUM(CASE WHEN iv.co2eq >= 0 THEN iv.co2eq ELSE 0 END) AS gross_co2eq,
           SUM(CASE WHEN iv.co2eq < 0 THEN iv.co2eq ELSE 0 END) AS removals_co2eq,
           s.sector_name, s.reference_number
    FROM "InventoryValue" iv
           JOIN "Sector" s ON iv.sector_id = s.sector_id
    WHERE iv.inventory_id IN (:inventoryIds)
    GROUP BY iv.inventory_id, s.sector_name, s.reference_number
    ORDER BY iv.inventory_id, SUM(iv.co2eq) DESC
  `;

  return (await db.sequelize!.query(rawQuery, {
    replacements: { inventoryIds },
    type: QueryTypes.SELECT,
  })) as EmissionsBySector[];
}

export async function getTotalEmissionsBySectorAndSubsector(
  inventoryId: string,
) {
  const rawQuery = `
    SELECT iv.inventory_id, SUM(iv.co2eq) AS co2eq, s.reference_number, ss.reference_number as ss_reference_number
    FROM "InventoryValue" iv
           JOIN "Sector" s ON iv.sector_id = s.sector_id
           LEFT JOIN "SubSector" ss on iv.sub_sector_id = ss.subsector_id
    WHERE iv.inventory_id = :inventoryId
    AND iv.co2eq >= 0
    GROUP BY iv.inventory_id, s.reference_number, ss.reference_number
    ORDER BY iv.inventory_id, SUM(iv.co2eq) DESC;
  `;

  return (await db.sequelize!.query(rawQuery, {
    replacements: { inventoryId },
    type: QueryTypes.SELECT,
  })) as TotalEmissionsBySectorAndSubsector[];
}

async function fetchTotalEmissionsBulk(
  inventoryIds: string[],
): Promise<TotalEmissionsResult[]> {
  const totalEmissionsRaw = await getTotalEmissionsBySector(inventoryIds);

  // Group by inventory_id
  const grouped = groupBy(totalEmissionsRaw, "inventory_id");

  // Process each inventory's emissions
  return Object.entries(grouped).map(([inventoryId, records]) => {
    const emissions = records.map(
      ({ co2eq, gross_co2eq, removals_co2eq, sector_name }) => ({
        sectorName: sector_name,
        co2eq: bigIntToDecimal(co2eq || 0n),
        grossCo2eq: bigIntToDecimal(gross_co2eq || 0n),
        removalsCo2eq: bigIntToDecimal(removals_co2eq || 0n),
      }),
    );

    const sumOfEmissions = emissions.reduce(
      (sum, { co2eq }) => sum.plus(co2eq),
      new Decimal(0),
    );
    const sumOfGrossEmissions = emissions.reduce(
      (sum, { grossCo2eq }) => sum.plus(grossCo2eq),
      new Decimal(0),
    );
    const sumOfRemovals = emissions.reduce(
      (sum, { removalsCo2eq }) => sum.plus(removalsCo2eq),
      new Decimal(0),
    );

    const totalEmissionsBySector = emissions.map(
      ({ sectorName, co2eq, grossCo2eq, removalsCo2eq }) => ({
        sectorName,
        co2eq,
        grossCo2eq,
        removalsCo2eq,
        // grossCo2eq is never negative, so this is never null - see calculatePercentage
        percentage: calculatePercentage(grossCo2eq, sumOfGrossEmissions) ?? 0,
      }),
    );

    return {
      inventoryId,
      sumOfEmissions,
      sumOfGrossEmissions,
      sumOfRemovals,
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
    topEmissions[inventoryId] = records.map(
      ({ co2eq, sector_name, subsector_name, scope_name }) => ({
        inventoryId,
        co2eq: bigIntToDecimal(co2eq || 0n),
        sectorName: sector_name,
        subsectorName: subsector_name,
        scopeName: scope_name,
        percentage: 0, // To be calculated later
      }),
    );
  }

  return topEmissions;
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
    ({
      inventoryId,
      sumOfEmissions,
      sumOfGrossEmissions,
      sumOfRemovals,
      totalEmissionsBySector,
    }) => {
      emissionResults[inventoryId] = {
        totalEmissions: {
          sumOfEmissions,
          sumOfGrossEmissions,
          sumOfRemovals,
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

  // Map top emissions and calculate percentages (against gross emissions - see calculatePercentage)
  for (const [inventoryId, topEmissions] of Object.entries(
    topEmissionsResults,
  )) {
    if (emissionResults[inventoryId]) {
      const { sumOfGrossEmissions } =
        emissionResults[inventoryId].totalEmissions;
      emissionResults[inventoryId].topEmissionsBySubSector = topEmissions.map(
        (emission) => ({
          ...emission,
          percentage: calculatePercentage(emission.co2eq, sumOfGrossEmissions),
        }),
      );
    }
  }

  return emissionResults;
}

// Type for raw query result from InventoryValue join query
interface InventoryValueQueryResult {
  co2eq: bigint;
  subsector_name: string;
  scope_name: string;
  datasource_id: string;
  datasource_name: string;
  inventory_value_id: string;
}

interface InventoryValuesBySector {
  sector_name?: SectorNamesInDB;
  subsector_name: string;
  scope_name: string;
  co2eq: bigint;
  datasource_name: string;
  datasource_id: string;
  inventory_value_id: string;
  activities: ActivityValue[];
}

const fetchInventoryValuesBySector = async (
  inventoryId: string,
  sectorName: SectorNamesInFE,
) => {
  // Get individual inventory values with their activities
  const rawQuery = `
    SELECT
      iv.co2eq,
      ss.subsector_name,
      scope.scope_name,
      iv.datasource_id,
      ds.datasource_name,
      iv.id as inventory_value_id
    FROM "InventoryValue" iv
           JOIN "Sector" s ON iv.sector_id = s.sector_id
           JOIN "SubSector" ss ON iv.sub_sector_id = ss.subsector_id
           LEFT JOIN "SubCategory" sc ON iv.sub_category_id = sc.subcategory_id
           JOIN "Scope" scope ON scope.scope_id = sc.scope_id OR ss.scope_id = scope.scope_id
           LEFT JOIN "DataSourceI18n" ds ON iv.datasource_id = ds.datasource_id
    WHERE iv.inventory_id = (:inventoryId)
      and iv.co2eq IS NOT NULL
      AND (s.sector_name) = (:sectorName)
  `;
  const sectorNameDB = SectorMappingsFromFEToDB[sectorName as SectorNamesInFE];

  const inventoryValues = (await db.sequelize!.query(rawQuery, {
    replacements: {
      inventoryId,
      sectorName: sectorNameDB,
    },
    type: QueryTypes.SELECT,
  })) as InventoryValueQueryResult[];

  // Get all relevant InventoryValue IDs
  const inventoryValueIds = inventoryValues.map(
    (row) => row.inventory_value_id,
  );

  let activityInstances: ActivityValue[] = [];
  if (inventoryValueIds.length > 0) {
    activityInstances = await ActivityValue.findAll({
      where: {
        inventoryValueId: { [Op.in]: inventoryValueIds },
      },
    });
  }
  const activitiesGrouped: Record<string, ActivityValue[]> = groupBy(
    activityInstances,
    "inventoryValueId",
  );

  // Attach activities to each inventory value
  const inventoryValuesWithActivities: InventoryValuesBySector[] =
    inventoryValues.map((iv) => ({
      ...iv,
      activities: activitiesGrouped[iv.inventory_value_id] || [],
    }));

  return inventoryValuesWithActivities;
};

/** Sum of an InventoryValue's activities' co2eq, or its own co2eq when it has no activities */
function sumItemCo2eq(item: InventoryValuesBySector): Decimal {
  if (item.activities.length > 0) {
    return item.activities.reduce(
      (sum, activity) => sum.plus(bigIntToDecimal(activity.co2eq ?? 0n)),
      new Decimal(0),
    );
  }
  return bigIntToDecimal(item.co2eq ?? 0n);
}

export const getEmissionsBreakdownBatch = async (
  inventoryId: string,
  sectorName: SectorNamesInFE,
): Promise<
  GroupedActivityResult & {
    byScope: ActivityDataByScope[];
    grossTotalEmissions: Decimal;
  }
> => {
  try {
    const emissionsForSector = await fetchInventoryValuesBySector(
      inventoryId,
      sectorName,
    );

    const bySubSectorAndDataSource = groupBy(
      emissionsForSector,
      (e) => `${e.subsector_name}-${e.datasource_id}`,
    );

    // Sector total used as the % denominator: only non-negative (emissions, not removals)
    // items count, so a removal-heavy sector can't push another sub-sector's % over 100 -
    // see CC-749.
    const grossTotalEmissions = emissionsForSector.reduce((sum, item) => {
      const itemSum = sumItemCo2eq(item);
      return itemSum.isNegative() ? sum : sum.plus(itemSum);
    }, new Decimal(0));

    const resultsByScope = Object.entries(bySubSectorAndDataSource).map(
      ([, scopeValues]) => {
        // Group by scope within this subsector/datasource combination
        const byScope = groupBy(scopeValues, "scope_name");

        const scopes: { [key: string]: Decimal } = {};
        let totalSubSectorEmissions = new Decimal(0);

        // Aggregate emissions by scope
        Object.entries(byScope).forEach(([scopeName, scopeItems]) => {
          // Sum the co2eq from all activities for this inventory value
          const scopeEmissions = scopeItems.reduce((sum, item) => {
            if (item.activities.length > 0) {
              // Sum the co2eq from all activities for this inventory value
              const activitySum = item.activities.reduce(
                (activitySum, activity) =>
                  activitySum.plus(bigIntToDecimal(activity.co2eq || 0n)),
                new Decimal(0),
              );
              return sum.plus(activitySum);
            } else {
              return sum.plus(bigIntToDecimal(item.co2eq || 0n));
            }
          }, new Decimal(0));
          scopes[scopeName] = scopeEmissions;
          totalSubSectorEmissions =
            totalSubSectorEmissions.plus(scopeEmissions);
          return scopeEmissions;
        });

        // Collect all activities from this subsector/datasource combination
        const activities = scopeValues.flatMap(
          (scopeValue) => scopeValue.activities,
        );

        const percentage = calculatePercentage(
          totalSubSectorEmissions,
          grossTotalEmissions,
        );

        return {
          activityTitle: scopeValues[0].subsector_name,
          scopes,
          totalEmissions: totalSubSectorEmissions,
          percentage,
          datasource_id: scopeValues[0].datasource_id,
          datasource_name: scopeValues[0].datasource_name,
          activities,
        };
      },
    );

    return { byScope: resultsByScope, grossTotalEmissions };
  } catch (error) {
    logger.error({ err: error }, "Error in getEmissionsBreakdownBatch:");
    throw error;
  }
};

/** entry point for results/[sectorName] */
export async function getEmissionsBreakdown(
  inventory: string,
  sectorName: SectorNamesInFE,
): Promise<{
  byScope: ActivityDataByScope[];
  grossTotalEmissions: Decimal;
}> {
  return getEmissionsBreakdownBatch(inventory, sectorName);
}

/** entry point for results */
export async function getEmissionResults(inventory: string): Promise<{
  /** net (emissions + removals) */
  totalEmissions: Decimal;
  grossEmissions: Decimal | undefined;
  removals: Decimal | undefined;
  totalEmissionsBySector:
    | {
        sectorName: SectorNamesInFE;
        co2eq: Decimal;
        grossCo2eq: Decimal;
        removalsCo2eq: Decimal;
        percentage: number;
      }[]
    | undefined;
  topEmissionsBySubSector: TopEmission[] | undefined;
}> {
  const EmissionResults = await getEmissionResultsBatch([inventory]);
  const inventoryEmissionResults = EmissionResults[inventory];
  return {
    totalEmissions: inventoryEmissionResults?.totalEmissions?.sumOfEmissions,
    grossEmissions:
      inventoryEmissionResults?.totalEmissions?.sumOfGrossEmissions,
    removals: inventoryEmissionResults?.totalEmissions?.sumOfRemovals,
    totalEmissionsBySector:
      inventoryEmissionResults?.totalEmissions?.totalEmissionsBySector,
    topEmissionsBySubSector: inventoryEmissionResults?.topEmissionsBySubSector,
  };
}

const prepareEmissionsData = async (inventoryId: string) => {
  const totalEmissionsBySector =
    await getTotalEmissionsBySectorAndSubsector(inventoryId);
  const out = totalEmissionsBySector.map((record) => ({
    ...record,
    reference_number:
      record.reference_number === "V"
        ? record.ss_reference_number
        : record.reference_number,
  }));
  const groupedEmissions = groupBy(out, "reference_number");

  return Object.entries(groupedEmissions).map(([referenceNumber, records]) => {
    const co2eqSum = records.reduce(
      (sum, record) => sum + BigInt(record.co2eq || 0),
      0n,
    );
    return {
      reference_number: referenceNumber,
      co2eq: co2eqSum,
      inventory_id: records[0].inventory_id,
      subsector_name: records[0].subsector_name,
      ss_reference_number: records[0].ss_reference_number,
    };
  });
};

export const getEmissionsForecasts = async (inventoryData: Inventory) => {
  const globalAPIResponse = await GlobalAPIService.fetchGrowthRates(
    inventoryData.city.locode!,
    inventoryData.year!,
  );
  if (!globalAPIResponse) {
    return {
      forecast: null,
      cluster: null,
      growthRates: null,
    };
  }
  const { growthRates, cluster } = globalAPIResponse;
  const totalEmissionsBySector = await prepareEmissionsData(
    inventoryData.inventoryId,
  );

  const projectedEmissions: { [year: string]: { [sector: string]: string } } =
    {};
  // Initialize projected emissions with the base year emissions
  const baseYear = inventoryData.year!.toString();
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
      const growthRate = growthRates?.[year]?.[referenceNumber];
      if (growthRate == null) {
        throw new createHttpError.InternalServerError(
          `Failed to find growth rate for sector ${referenceNumber} in year ${year} in city ${inventoryData.city.locode!}`,
        );
      }
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
