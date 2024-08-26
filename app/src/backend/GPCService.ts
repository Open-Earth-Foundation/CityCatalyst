import { db } from "@/models";
import createHttpError from "http-errors";
import { QueryTypes } from "sequelize";

type IDsFromReferenceNumberResult = {
  sectorId: string;
  subSectorId: string;
  subCategoryId: string;
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

    const subCategoryId = subcategory?.subcategoryId;
    const subSectorId = subcategory?.subsector?.subsectorId;
    const sectorId = subcategory?.subsector?.sector?.sectorId;

    if (!sectorId || !subSectorId || !subCategoryId) {
      throw new createHttpError.BadRequest(
        "Couldn't find sector/ subsector/ subcategory for given GPC reference number",
      );
    }

    return { sectorId, subSectorId, subCategoryId };
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
