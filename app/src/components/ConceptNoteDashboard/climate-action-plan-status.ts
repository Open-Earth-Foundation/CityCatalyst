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
  if (
    plans.some((upload) => ["queued", "processing"].includes(upload.status))
  ) {
    return "processing";
  }
  const readyPlans = plans.filter((upload) => upload.status === "ready");
  if (readyPlans.length === 0 || bundle.status === "failed") return "failed";
  const included = readyPlans.every((upload) =>
    bundle.includedUploadIds?.includes(upload.uploadId),
  );
  if (bundle.status === "ready" && included) {
    return readyPlans.length === plans.length
      ? "included"
      : "included-with-failures";
  }
  return "processing";
}
