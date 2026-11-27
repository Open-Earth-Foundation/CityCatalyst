import type { ConceptNoteUploadResponse } from "@/util/types";

export type PointDraftStage =
  "checking" | "upload" | "processing" | "matching" | "failed" | "ready";

/** Reading a file against the points finishes after upload/OCR ingestion. */
export function pointDraftStage(
  registered: boolean,
  hasReadFile: boolean | undefined,
  uploads: Pick<ConceptNoteUploadResponse, "status">[],
): PointDraftStage | undefined {
  if (!registered) return undefined;
  if (hasReadFile === undefined) return "checking";
  if (hasReadFile) return "ready";
  if (uploads.some((upload) => upload.status === "ready")) return "matching";
  if (uploads.some((upload) => upload.status !== "failed")) return "processing";
  return uploads.length ? "failed" : "upload";
}
