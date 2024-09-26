import { db } from "@/models";
import { QueryTypes } from "sequelize";
import sumBy from "lodash/sumBy";

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
  })) as {co2eq: bigint, sector_name: string, subsector_name: string, scope_name: string}[];
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
