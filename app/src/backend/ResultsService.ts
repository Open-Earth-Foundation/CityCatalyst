import { db } from "@/models";
import { QueryTypes } from "sequelize";
import sumBy from "lodash/sumBy";

function calculatePercentage(co2eq: bigint, total: bigint): number {
  if (total <= 0n) {
    return 0;
  }
  const co2eqFloat = Number(co2eq);
  const totalFloat = Number(total);
  return Number(Number((co2eqFloat * 100 / totalFloat)).toFixed(0));
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

  const totalEmissionsBySector: {
    "co2eq": bigint,
    "sector_name": string
  }[] = await db.sequelize!.query(rawQuery, {
    replacements: { inventoryId: inventory },
    type: QueryTypes.SELECT
  });

  const sumOfEmissions = BigInt(sumBy(totalEmissionsBySector, e => Number(e.co2eq)));

  return totalEmissionsBySector.map(({ co2eq, sector_name }) => ({
    sectorName: sector_name,
    co2eq,
    percentage: calculatePercentage(co2eq, sumOfEmissions)
  }));
}

function getTopEmissions(inventoryId: string) {
  const rawQuery = `
      SELECT av.co2eq, sector_name, subsector_name 
        FROM "ActivityValue" av
        JOIN "InventoryValue" iv ON av.inventory_value_id = iv.id
        JOIN "Sector" s ON iv.sector_id = s.sector_id
        JOIN "SubSector" ss ON iv.sub_sector_id = ss.subsector_id
        WHERE inventory_id = :inventoryId
        ORDER BY av.co2eq DESC
        LIMIT 3; `;

  return db.sequelize!.query(rawQuery, {
    replacements: { inventoryId },
    type: QueryTypes.SELECT
  });
}

export async function getEmissionResults(inventoryId: string) {
  const [totalEmissionsWithPercentage, topSubSectorEmissions] = await Promise.all([
    getTotalEmissionsWithPercentage(inventoryId),
    getTopEmissions(inventoryId)
  ]);

  // @ts-ignore
  const topSubSectorEmissionsWithPercentage = topSubSectorEmissions.map(({ co2eq, sector_name, subsector_name }) => {
    const sectorTotal = totalEmissionsWithPercentage.find(e => e.sectorName === sector_name)?.co2eq;
    return {
      subsectorName: subsector_name,
      sectorName: sector_name,
      co2eq,
      percentage: sectorTotal ? calculatePercentage(co2eq, sectorTotal) : 0
    };
  });

  return { totalEmissionsBySector: totalEmissionsWithPercentage, topEmissionsBySubSector: topSubSectorEmissionsWithPercentage };
}