import { db } from "@/models";
import createHttpError from "http-errors";

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
          as: "subSector",
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
}
