import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { QueryTypes } from "sequelize";

const getRequiredScopes = async (sectorId: string) => {
  const results: { scope_name: string }[] = await db.sequelize!.query(
    `select distinct(scope_name) from "Sector" s
        join "SubSector" ss on s.sector_id = ss.sector_id
        join "SubCategory" sc on ss.subsector_id = sc.subsector_id
        join "Scope" on "Scope".scope_id = sc.scope_id
        where s.sector_id = :sectorId `,
    {
      replacements: { sectorId: sectorId },
      type: QueryTypes.SELECT,
    },
  );
  return { requiredScopes: results.map(({ scope_name }) => scope_name) };
};

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const sector = await db.models.Sector.findByPk(params.sectorId);
  if (!sector) {
    throw new createHttpError.NotFound("Sector not found");
  }
  const requiredScopes = await getRequiredScopes(params.sectorId);
  return NextResponse.json({ data: requiredScopes });
});
