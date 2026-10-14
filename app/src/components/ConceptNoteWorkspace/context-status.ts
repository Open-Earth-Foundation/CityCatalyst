import {
  LuArrowRight,
  LuCircleAlert,
  LuDatabase,
  LuFilePlus2,
} from "react-icons/lu";

import type { useTranslation } from "@/i18n/client";
import type {
  ConceptNoteRun,
  ConceptNoteUploadResponse,
  ConceptNoteUploadStatus,
} from "@/util/types";
import type { ConceptNoteBundleProgress } from "../ConceptNoteDashboard/utils";
import { uploadStatusTranslationKey } from "../ConceptNoteWiringHarness/utils";
import type { ContextTone } from "./context-status-badge";

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

  // Refresh the selected upload in place; an older failure is superseded by
  // the current upload, but other pending uploads still need to finish.
  const uploadStatuses = new Map(
    uploads.map((upload) => [upload.upload_id, upload.status]),
  );
  if (activeUpload)
    uploadStatuses.set(activeUpload.uploadId, activeUpload.status);
  const statuses = [...uploadStatuses.values()];
  const currentStatus = activeUpload?.status ?? uploads[0]?.status;
  if (currentStatus === "failed" || bundle.status === "failed") return "failed";
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
  const readyUploadCount = statuses.filter(
    (status) => status === "ready",
  ).length;
  if (
    hasUploads &&
    (bundle.status !== "ready" ||
      bundle.documentGrounding !== "uploaded_evidence" ||
      bundle.readySources < readyUploadCount)
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

/**
 * Label and tone for one uploaded file. A converted file only counts as ready
 * once the context bundle holds every converted upload.
 */
export function getConceptNoteUploadRowPresentation(
  status: ConceptNoteUploadStatus,
  bundle: ConceptNoteBundleProgress,
  readyUploadCount: number,
): { labelKey: string; tone: ContextTone } {
  if (status !== "ready") {
    return {
      labelKey: uploadStatusTranslationKey(status),
      tone: status === "failed" ? "warning" : "neutral",
    };
  }
  if (bundle.status === "failed") {
    return { labelKey: "status-failed", tone: "warning" };
  }
  if (
    bundle.status !== "ready" ||
    bundle.documentGrounding !== "uploaded_evidence" ||
    bundle.readySources < readyUploadCount
  ) {
    return { labelKey: "status-processing", tone: "neutral" };
  }
  return { labelKey: "status-ready", tone: "positive" };
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
