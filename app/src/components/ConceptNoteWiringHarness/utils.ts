import type { ConceptNoteUploadStatus } from "@/util/types";

export const CONCEPT_NOTE_PDF_MAX_BYTES = 20 * 1024 * 1024;

export type ConceptNotePdfValidationError =
  "invalid-pdf-type" | "empty-pdf" | "oversized-pdf" | "invalid-pdf-signature";

export function requireConceptNoteUploadIdentity(upload: {
  uploadId?: string;
  status?: ConceptNoteUploadStatus;
}): { uploadId: string; status: ConceptNoteUploadStatus } {
  if (!upload.uploadId || !upload.status) {
    throw new Error("Upload response is missing its durable identity.");
  }
  return { uploadId: upload.uploadId, status: upload.status };
}

export async function validateConceptNotePdf(
  file: File,
): Promise<ConceptNotePdfValidationError | null> {
  if (
    file.type !== "application/pdf" ||
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return "invalid-pdf-type";
  }
  if (file.size === 0) {
    return "empty-pdf";
  }
  if (file.size > CONCEPT_NOTE_PDF_MAX_BYTES) {
    return "oversized-pdf";
  }

  const signature = new TextDecoder("ascii").decode(
    await file.slice(0, 5).arrayBuffer(),
  );
  return signature === "%PDF-" ? null : "invalid-pdf-signature";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function uploadStatusTranslationKey(
  status: ConceptNoteUploadStatus | null,
): string {
  switch (status) {
    case "queued":
      return "status-queued";
    case "processing":
      return "status-converting";
    case "ready":
      return "status-ready";
    case "failed":
      return "status-failed";
    default:
      return "status-not-started";
  }
}

export function shouldPollConceptNoteUpload(
  status: ConceptNoteUploadStatus | null,
): boolean {
  return status === "queued" || status === "processing";
}
