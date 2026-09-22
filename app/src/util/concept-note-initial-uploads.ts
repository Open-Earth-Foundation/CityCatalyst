import type { ConceptNoteRun, InitialConceptNoteUpload } from "@/util/types";

export function initialConceptNoteUploads(
  run?: ConceptNoteRun | null,
): InitialConceptNoteUpload[] {
  return (
    (run?.progress_summary?.initial_uploads as
      InitialConceptNoteUpload[] | undefined) ?? []
  );
}

export function hasIncompleteInitialUploads(
  run?: ConceptNoteRun | null,
): boolean {
  return initialConceptNoteUploads(run).some((source) => !source.accepted);
}

export async function sourceFileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function uploadWithRecovery<T>(
  upload: () => Promise<T>,
): Promise<T> {
  try {
    return await upload();
  } catch (error) {
    const status = (error as { status?: number | string })?.status;
    if (
      status !== "FETCH_ERROR" &&
      status !== "TIMEOUT_ERROR" &&
      status !== 408 &&
      status !== 429 &&
      !(typeof status === "number" && status >= 500)
    ) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
    return upload();
  }
}
