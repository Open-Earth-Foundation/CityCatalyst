import createHttpError from "http-errors";
import { z } from "zod";

import { loadConceptNoteUpload } from "@/backend/ConceptNoteUploadService";
import { SequelizeIngestDocumentPool } from "@/backend/ingest/IngestDocumentPoolService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import type { AppSession } from "@/lib/auth";
import { db } from "@/models";

const associationLabels = z.object({
  documentId: z.string().uuid(),
  runId: z.string().uuid().optional(),
});

/** Recheck catalog-backed source lifecycle for both original and reused artifacts. */
export async function assertReusedDocumentSourceAvailable(
  uploadId: string,
  session: AppSession,
): Promise<void> {
  const association = await db.models.NativeInputCatalog.findOne({
    where: { sourceType: "cnb_upload", sourceId: uploadId },
  });
  // Only genuinely pre-catalog uploads retain their existing legacy read path.
  if (!association) return;
  const labels = associationLabels.safeParse(association.labels);
  if (!labels.success || association.userId !== session.user.id) {
    throw new createHttpError.NotFound("Document source not found");
  }
  if (labels.data.runId) {
    await loadConceptNoteUpload({
      runId: labels.data.runId,
      uploadId,
      userId: session.user.id,
    });
  }
  const source = await new SequelizeIngestDocumentPool().get(
    labels.data.documentId,
  );
  if (
    !source ||
    !source.cityId ||
    (source.visibility !== "city" &&
      (labels.data.runId !== undefined || source.visibility !== "run")) ||
    source.availability !== "active" ||
    source.withdrawnAt ||
    source.bytesPurgedAt ||
    association.availability !== "active" ||
    source.cityId !== association.cityId ||
    (source.projectId ?? null) !== (association.projectId ?? null) ||
    (source.organizationId ?? null) !== (association.organizationId ?? null) ||
    source.contentHash !== association.contentDigest
  ) {
    throw new createHttpError.Conflict(
      "The document source is unavailable or changed",
    );
  }
  if (
    source.visibility === "run" &&
    source.uploadedByUserId !== session.user.id
  ) {
    throw new createHttpError.NotFound("Document source not found");
  }
  await PermissionService.canAccessCity(session, source.cityId, {
    includeResource: false,
  });
}
