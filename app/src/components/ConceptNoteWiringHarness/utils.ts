export const CONCEPT_NOTE_PDF_MAX_BYTES = 20 * 1024 * 1024;

export type ConceptNoteUploadStatus =
  "queued" | "processing" | "ready" | "failed";

export async function validateConceptNotePdf(
  file: File,
): Promise<string | null> {
  if (
    file.type !== "application/pdf" ||
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return "Choose a PDF file.";
  }
  if (file.size === 0) {
    return "The PDF is empty.";
  }
  if (file.size > CONCEPT_NOTE_PDF_MAX_BYTES) {
    return "The PDF is larger than 20 MiB.";
  }

  const signature = new TextDecoder("ascii").decode(
    await file.slice(0, 5).arrayBuffer(),
  );
  return signature === "%PDF-"
    ? null
    : "The selected file does not have a valid PDF signature.";
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

export function uploadStatusLabel(
  status: ConceptNoteUploadStatus | null,
): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Converting";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return "Not started";
  }
}
