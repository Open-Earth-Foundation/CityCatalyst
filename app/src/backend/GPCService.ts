import { db } from "@/models";
import createHttpError from "http-errors";
import { QueryTypes } from "sequelize";

type IDsFromReferenceNumberResult = {
  sectorId: string;
  subSectorId: string;
  subCategoryId: string | null;
};

export default class GPCService {
  public static async getIDsFromReferenceNumber(
    gpcReferenceNumber: string,
  ): Promise<IDsFromReferenceNumberResult> {
    const subcategory = await db.models.SubCategory.findOne({
      where: { referenceNumber: gpcReferenceNumber },
      attributes: ["subcategoryId"],
      include: [
        {
          model: db.models.SubSector,
          as: "subsector",
          attributes: ["subsectorId"],
          include: [
            {
              model: db.models.Sector,
              as: "sector",
              attributes: ["sectorId"],
            },
          ],
        },
      ],
    });
    if (subcategory) {
      return {
        sectorId: subcategory.subsector.sector.sectorId,
        subSectorId: subcategory.subsector.subsectorId,
        subCategoryId: subcategory.subcategoryId,
      };
    }
    const subsector = await db.models.SubSector.findOne({
      where: { referenceNumber: gpcReferenceNumber },
      attributes: ["subsectorId"],
      include: [
        {
          model: db.models.Sector,
          as: "sector",
          attributes: ["sectorId"],
        },
      ],
    });
    if (subsector) {
      return {
        sectorId: subsector.sector.sectorId,
        subSectorId: subsector.subsectorId,
        subCategoryId: null,
      };
    }
    throw new createHttpError.BadRequest(
      "Couldn't find sector/ subsector/ subcategory for given GPC reference number",
    );
  }

  public static async getRequiredScopes(sectorId: string) {
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
  }
}
