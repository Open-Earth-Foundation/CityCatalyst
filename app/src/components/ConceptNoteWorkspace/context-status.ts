import {
  LuArrowRight,
  LuCircleAlert,
  LuDatabase,
  LuFilePlus2,
} from "react-icons/lu";

import type { useTranslation } from "@/i18n/client";
import type { ConceptNoteRun, ConceptNoteUploadResponse } from "@/util/types";
import type { ConceptNoteBundleProgress } from "../ConceptNoteDashboard/utils";

export type ConceptNoteContextState =
  "none" | "uploading" | "processing" | "preparing" | "failed" | "ready";

export function getConceptNoteContextState({
  bundle,
  uploads = [],
  activeUpload,
  initialUploadId,
  isUploading,
  isRetrying,
}: {
  bundle: ConceptNoteBundleProgress;
  uploads?: ConceptNoteRun["uploads"];
  activeUpload: ConceptNoteUploadResponse | null;
  initialUploadId?: string;
  isUploading: boolean;
  isRetrying: boolean;
}): ConceptNoteContextState {
  if (isUploading) return "uploading";
  if (isRetrying) return "processing";

  // Keep pending persisted uploads authoritative until the run poll catches up.
  const statuses = uploads.map((upload) => upload.status);
  if (activeUpload) statuses.push(activeUpload.status);
  if (statuses.includes("failed") || bundle.status === "failed")
    return "failed";
  if (
    statuses.some((status) => status === "queued" || status === "processing")
  ) {
    return "processing";
  }
  if (
    initialUploadId &&
    !uploads.some((upload) => upload.upload_id === initialUploadId)
  ) {
    return "processing";
  }

  // OCR readiness alone does not mean the evidence has reached Clima's context.
  const hasUploads = statuses.length > 0;
  const readyUploadIds = new Set(uploads.map((upload) => upload.upload_id));
  if (activeUpload) readyUploadIds.add(activeUpload.uploadId);
  if (
    hasUploads &&
    (bundle.status !== "ready" ||
      bundle.documentGrounding !== "uploaded_evidence" ||
      bundle.readySources < readyUploadIds.size)
  )
    return "processing";
  if (bundle.status === "building") return "preparing";
  if (
    !hasUploads &&
    (bundle.queuedSources > 0 || bundle.processingSources > 0)
  ) {
    return "processing";
  }
  if (!hasUploads && bundle.failedSources > 0) return "failed";
  return bundle.status === "ready" &&
    bundle.documentGrounding === "uploaded_evidence"
    ? "ready"
    : "none";
}

export function getConceptNoteContextPresentation(
  state: ConceptNoteContextState,
  bundle: ConceptNoteBundleProgress,
  t: ReturnType<typeof useTranslation>["t"],
) {
  const blocked = state !== "ready" && state !== "none";
  const failed = state === "failed";
  const ready = state === "ready";
  let description = t(
    blocked
      ? `clima-context-${state}-message`
      : ready
        ? "clima-context-ready-message"
        : "clima-no-uploaded-evidence-message",
  );
  if (failed && bundle.errorCode) {
    const reasons: Record<string, string> = {
      reader_section_count_mismatch: "context-error-incomplete-sections",
      markdown_partition_text_loss: "context-error-text-loss",
      source_partition_text_loss: "context-error-text-loss",
      source_tokenization_text_loss: "context-error-text-loss",
    };
    const reasonKey = reasons[bundle.errorReason ?? ""];
    if (reasonKey) description = t(reasonKey);
    description += ` ${t("context-error-code", { code: bundle.errorCode })}`;
  }
  return {
    state,
    blocked,
    busy: blocked && !failed,
    title: t(
      blocked
        ? `clima-context-${state}-title`
        : ready
          ? "source-context-assembled"
          : "uploaded-evidence-none",
    ),
    description,
    icon: ready ? LuDatabase : LuCircleAlert,
    color: failed
      ? "sentiment.negativeDefault"
      : ready
        ? "sentiment.positiveDefault"
        : "content.link",
    surface: failed
      ? "sentiment.negativeOverlay"
      : ready
        ? "sentiment.positiveOverlay"
        : "background.neutral",
    actionIcon: state === "none" ? LuFilePlus2 : LuArrowRight,
    actionLabel: t(
      state === "none" ? "add-recommended-source" : "review-context",
    ),
  };
}

export type ConceptNoteContextPresentation = ReturnType<
  typeof getConceptNoteContextPresentation
>;
