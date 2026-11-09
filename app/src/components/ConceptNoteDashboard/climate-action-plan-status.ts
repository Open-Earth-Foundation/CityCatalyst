import type { ConceptNoteRun, ConceptNoteUploadResponse } from "@/util/types";
import {
  getConceptNoteBundleProgress,
  type ConceptNoteBundleProgress,
} from "./utils";
import type { ContextSourceState } from "./context-source-status";

/** Resolve uploaded plan status identically for the note list and workspace. */
export function getClimateActionPlanState(
  uploads: Pick<
    ConceptNoteUploadResponse,
    "uploadId" | "sourceRole" | "status"
  >[],
  bundle: Pick<ConceptNoteBundleProgress, "status" | "includedUploadIds">,
): ContextSourceState | null {
  const plans = uploads.filter(
    (upload) => upload.sourceRole === "climate_action_plan",
  );
  if (plans.length === 0) return null;
  if (
    plans.some(
      (upload) => upload.status === "queued" || upload.status === "processing",
    )
  ) {
    return "processing";
  }
  const readyPlans = plans.filter((upload) => upload.status === "ready");
  if (readyPlans.length === 0) return "failed";
  // CA keeps the last completed membership while a rebuild runs or after it
  // fails, so an included plan stays included whatever the bundle status.
  const included = readyPlans.every((upload) =>
    bundle.includedUploadIds?.includes(upload.uploadId),
  );
  if (included) {
    return readyPlans.length === plans.length
      ? "included"
      : "included-with-failures";
  }
  return bundle.status === "failed" ? "failed" : "processing";
}

/** Plan state for a listed run, which carries snake_case uploads. */
export function getRunClimateActionPlanState(
  run: Pick<ConceptNoteRun, "uploads" | "progress_summary">,
): ContextSourceState | null {
  return getClimateActionPlanState(
    (run.uploads ?? []).map((upload) => ({
      uploadId: upload.upload_id,
      sourceRole: upload.source_role,
      status: upload.status,
    })),
    getConceptNoteBundleProgress(run.progress_summary),
  );
}
