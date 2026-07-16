import UserService from "@/backend/UserService";
import { enqueueInventoryPdfOcr } from "@/backend/PdfOcrService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { ImportStatusEnum } from "@/util/enums";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

/** Queue-only endpoint; the Kubernetes CronJob performs OCR and row extraction. */
export const maxDuration = 30;

export const POST = apiHandler(async (_req, { session, params }) => {
  if (!session) throw new createHttpError.Unauthorized("Not signed in");

  const cityId = z.string().uuid().parse(params.city);
  const inventoryId = z.string().uuid().parse(params.inventory);
  const importedFileId = z.string().uuid().parse(params.importedFileId);
  await UserService.findUserInventory(inventoryId, session);

  const importedFile = await db.models.ImportedInventoryFile.findOne({
    where: {
      id: importedFileId,
      inventoryId,
      cityId,
      userId: session.user.id,
    },
  });
  if (!importedFile) {
    throw new createHttpError.NotFound(
      "Imported file not found or access denied",
    );
  }
  if (importedFile.fileType !== "pdf") {
    throw new createHttpError.BadRequest(
      "Extract is only supported for PDF files",
    );
  }

  const existingJob = await db.models.PdfOcrJob.findOne({
    where: { sourceType: "inventory_import", sourceId: importedFile.id },
  });
  const mayResumeStoredMarkdown =
    importedFile.importStatus === ImportStatusEnum.FAILED &&
    existingJob?.status === "succeeded";
  if (
    importedFile.importStatus !== ImportStatusEnum.PENDING_AI_EXTRACTION &&
    importedFile.importStatus !== ImportStatusEnum.EXTRACTING &&
    !mayResumeStoredMarkdown
  ) {
    throw new createHttpError.BadRequest(
      "File is not ready for PDF extraction",
    );
  }
  if (!importedFile.s3Key) {
    throw new createHttpError.ServiceUnavailable(
      "PDF OCR requires S3-backed file storage; please re-upload after S3 is configured",
    );
  }

  await enqueueInventoryPdfOcr(importedFile);
  return NextResponse.json(
    {
      data: {
        accepted: true,
        id: importedFileId,
        message:
          "Extraction queued; poll GET import status until importStatus is waiting_for_approval or failed.",
      },
    },
    { status: 202 },
  );
});
