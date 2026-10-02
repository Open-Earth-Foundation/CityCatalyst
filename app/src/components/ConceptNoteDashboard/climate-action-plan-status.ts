import type { ConceptNoteUploadResponse } from "@/util/types";
import type { ConceptNoteBundleProgress } from "./utils";
import type { ContextSourceState } from "./context-source-status";

/** Resolve uploaded plan status identically for the note list and workspace. */
export function getClimateActionPlanState(
  uploads: ConceptNoteUploadResponse[],
  bundle: ConceptNoteBundleProgress,
): ContextSourceState | null {
  const plans = uploads.filter(
    (upload) => upload.sourceRole === "climate_action_plan",
  );
  if (plans.length === 0) return null;
  if (plans.some((upload) => upload.status === "failed")) return "failed";
  if (plans.some((upload) => upload.status !== "ready")) return "processing";
  const included = plans.every((upload) =>
    bundle.includedUploadIds?.includes(upload.uploadId),
  );
  if (bundle.status === "ready" && included) return "included";
  return bundle.status === "failed" ? "failed" : "processing";
}
