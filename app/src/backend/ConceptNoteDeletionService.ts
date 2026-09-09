import createHttpError from "http-errors";
import { Op } from "sequelize";
import { db } from "@/models";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";

/** CA supplies only source identities no remaining Concept Note references. */
export async function deleteConceptNoteSources(
  uploadIds: string[],
): Promise<void> {
  await db.sequelize!.transaction(async (transaction) => {
    const where = {
      sourceType: "concept_note_upload",
      sourceId: { [Op.in]: uploadIds },
    };
    const jobs = await db.models.PdfOcrJob.findAll({
      where,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      jobs.some(
        (job) =>
          job.status === "running" || job.deliveryStatus === "delivering",
      )
    ) {
      throw new createHttpError.Conflict(
        "Wait for source processing to finish before deleting this note",
      );
    }
    for (const uploadId of uploadIds) {
      await InventoryFileStorageService.deleteConceptNoteSource(uploadId);
    }
    await db.models.PdfOcrJob.destroy({ where, transaction });
  });
}
