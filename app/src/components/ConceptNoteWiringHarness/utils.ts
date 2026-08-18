import type { ConceptNoteUploadStatus } from "@/util/types";

export const CONCEPT_NOTE_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const markdownMimeTypes = new Set([
  "",
  "application/octet-stream",
  "text/markdown",
  "text/plain",
  "text/x-markdown",
]);

export type ConceptNoteSourceValidationError =
  | "invalid-source-type"
  | "empty-source-file"
  | "oversized-source-file"
  | "invalid-pdf-signature"
  | "invalid-markdown-utf8"
  | "empty-markdown-source"
  | "invalid-markdown-source";

export function requireConceptNoteUploadIdentity(upload: {
  uploadId?: string;
  status?: ConceptNoteUploadStatus;
}): { uploadId: string; status: ConceptNoteUploadStatus } {
  if (!upload.uploadId || !upload.status) {
    throw new Error("Upload response is missing its durable identity.");
  }
  return { uploadId: upload.uploadId, status: upload.status };
}

export async function validateConceptNoteSourceFile(
  file: File,
): Promise<ConceptNoteSourceValidationError | null> {
  const lowerName = file.name.toLowerCase();
  const isPdf = lowerName.endsWith(".pdf");
  const isMarkdown =
    lowerName.endsWith(".md") && markdownMimeTypes.has(file.type);

  if (!isPdf && !isMarkdown) {
    return "invalid-source-type";
  }
  if (file.size === 0) {
    return "empty-source-file";
  }
  if (file.size > CONCEPT_NOTE_SOURCE_MAX_BYTES) {
    return "oversized-source-file";
  }
  if (isMarkdown) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.includes(0)) {
      return "invalid-markdown-source";
    }
    let markdown: string;
    try {
      markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return "invalid-markdown-utf8";
    }
    const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    if (!normalized.trim()) {
      return "empty-markdown-source";
    }
    return null;
  }
  if (file.type !== "application/pdf") {
    return "invalid-source-type";
  }

  const signature = new TextDecoder("ascii").decode(
    await file.slice(0, 5).arrayBuffer(),
  );
  return signature === "%PDF-" ? null : "invalid-pdf-signature";
}

export function conceptNoteSourceLabel(filename: string): string {
  return filename.replace(/\.(pdf|md)$/i, "");
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
