import type { ConceptNoteDraftState } from "@/util/types";

import { isChapterValidationCurrent } from "../ConceptNoteWorkspace/chapter-validation";

export type RunStatusTone =
  "positive" | "warning" | "info" | "negative" | "neutral";

export interface RunStatusPresentation {
  tone: RunStatusTone;
  translationKey: string;
}

interface CityPopulationSummary {
  population?: number | string | null;
  year?: number | string | null;
}

const statusPresentations: Record<string, RunStatusPresentation> = {
  active: { tone: "warning", translationKey: "status-in-progress" },
  completed: { tone: "positive", translationKey: "status-completed" },
  created: { tone: "info", translationKey: "status-draft" },
  draft: { tone: "info", translationKey: "status-draft" },
  error: { tone: "negative", translationKey: "status-failed" },
  exported: { tone: "positive", translationKey: "status-exported" },
  failed: { tone: "negative", translationKey: "status-failed" },
  paused: { tone: "warning", translationKey: "status-paused" },
  pending: { tone: "warning", translationKey: "status-in-progress" },
  ready: { tone: "positive", translationKey: "status-ready" },
  running: { tone: "warning", translationKey: "status-in-progress" },
  succeeded: { tone: "positive", translationKey: "status-completed" },
};

const reviewStatusPresentations = {
  needsFixes: {
    tone: "negative",
    translationKey: "status-needs-fixes",
  },
  ready: { tone: "positive", translationKey: "status-ready" },
  reviewed: { tone: "warning", translationKey: "status-reviewed" },
  stale: { tone: "warning", translationKey: "status-review-stale" },
} satisfies Record<string, RunStatusPresentation>;

const terminalRunStatuses = new Set([
  "completed",
  "error",
  "exported",
  "failed",
  "succeeded",
]);

const workflowStepTranslationKeys: Record<string, string> = {
  assembling_context: "workflow-assembling-context",
  draft: "workflow-draft",
  drafting_document: "workflow-drafting-document",
  editing_document: "workflow-editing-document",
  interviewing: "workflow-interviewing",
};

const contextSourceStatusTranslationKeys: Record<string, string> = {
  available: "bundle-source-available",
  failed: "bundle-source-failed",
  included: "bundle-source-included",
  missing: "bundle-source-missing",
  partial: "bundle-source-partial",
  pending: "bundle-source-pending",
  unavailable: "bundle-source-unavailable",
};

export function normalizePopulationData(
  population: CityPopulationSummary | null | undefined,
): { population: number; year: number } | null {
  if (population?.population == null || population.year == null) {
    return null;
  }

  const populationValue = Number(population.population);
  const yearValue = Number(population.year);

  return Number.isFinite(populationValue) && Number.isFinite(yearValue)
    ? { population: populationValue, year: yearValue }
    : null;
}

function normalizeLifecycleValue(value: string): string {
  return value.trim().toLowerCase();
}

export function getRunStatusPresentation(
  status: string,
): RunStatusPresentation {
  return (
    statusPresentations[normalizeLifecycleValue(status)] ?? {
      tone: "neutral",
      translationKey: "status-unknown",
    }
  );
}

export function getConceptNoteReviewStatusPresentation(
  draft: ConceptNoteDraftState | null | undefined,
): RunStatusPresentation | null {
  if (draft?.status !== "complete" || draft.chapters.length === 0) {
    return null;
  }

  const validations = draft.chapters.flatMap((chapter) =>
    chapter.validation ? [chapter.validation] : [],
  );
  if (validations.length !== draft.chapters.length) {
    return null;
  }

  if (draft.chapters.some((chapter) => !isChapterValidationCurrent(chapter))) {
    return reviewStatusPresentations.stale;
  }

  if (
    draft.chapters.some((chapter) => chapter.missing_information.length > 0) ||
    validations.some(
      (validation) =>
        validation.status === "incomplete" ||
        validation.findings.some((finding) => finding.severity === "blocking"),
    )
  ) {
    return reviewStatusPresentations.needsFixes;
  }
  if (
    validations.some(
      (validation) =>
        validation.status === "needs_review" ||
        validation.findings.some((finding) => finding.severity === "warning"),
    )
  ) {
    return reviewStatusPresentations.reviewed;
  }
  return reviewStatusPresentations.ready;
}

export function getConceptNoteStatusPresentation(
  runStatus: string,
  draft: ConceptNoteDraftState | null | undefined,
): RunStatusPresentation {
  const normalizedStatus = normalizeLifecycleValue(runStatus);
  if (!terminalRunStatuses.has(normalizedStatus)) {
    const reviewStatus = getConceptNoteReviewStatusPresentation(draft);
    if (reviewStatus) {
      return reviewStatus;
    }
  }
  return getRunStatusPresentation(runStatus);
}

export function getWorkflowStepTranslationKey(value: string): string {
  return (
    workflowStepTranslationKeys[normalizeLifecycleValue(value)] ??
    "workflow-unknown"
  );
}

export function getContextSourceStatusTranslationKey(value: string): string {
  return (
    contextSourceStatusTranslationKeys[normalizeLifecycleValue(value)] ??
    "bundle-source-status-unknown"
  );
}

export function hasPrioritizedHiapActions(widget: unknown): boolean {
  const hiap = recordValue(widget);

  return [hiap.mitigation, hiap.adaptation].some((actionType) => {
    const rankedActions = recordValue(actionType).rankedActions;
    return Array.isArray(rankedActions) && rankedActions.length > 0;
  });
}

export function conceptNoteResumeHref(
  lng: string,
  cityId: string,
  runId: string,
): string {
  return `/${lng}/cities/${cityId}/concept-notes/${runId}`;
}

export interface ConceptNoteBundleProgress {
  status: string | null;
  documentGrounding: "none" | "uploaded_evidence" | null;
  availableContext: {
    city: boolean;
    project: boolean;
    ghgi: boolean;
    ccra: boolean;
    hiap: boolean;
    uploadedDocuments: boolean;
  };
  missingContext: string[];
  readySources: number;
  queuedSources: number;
  processingSources: number;
  failedSources: number;
  ghgiStatus: string | null;
  hiapStatus: string | null;
  retryable: boolean;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function countValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function documentGroundingValue(
  bundle: Record<string, unknown>,
): "none" | "uploaded_evidence" | null {
  if (
    bundle.document_grounding === "none" ||
    bundle.document_grounding === "uploaded_evidence"
  ) {
    return bundle.document_grounding;
  }
  if (bundle.context_mode === "thin") {
    return "none";
  }
  return bundle.context_mode === "grounded" ? "uploaded_evidence" : null;
}

export function getConceptNoteBundleProgress(
  summary: Record<string, unknown>,
): ConceptNoteBundleProgress {
  const bundle = recordValue(summary.context_bundle);
  const sourceCounts = recordValue(bundle.source_counts);
  const optionalSources = recordValue(bundle.optional_sources);
  const availableContext = recordValue(bundle.available_context);
  const documentGrounding = documentGroundingValue(bundle);

  return {
    status: stringValue(bundle.status),
    documentGrounding,
    availableContext: {
      city: availableContext.city === true,
      project: availableContext.project === true,
      ghgi: availableContext.ghgi === true,
      ccra: availableContext.ccra === true,
      hiap: availableContext.hiap === true,
      uploadedDocuments:
        availableContext.uploaded_documents === true ||
        (availableContext.uploaded_documents === undefined &&
          documentGrounding === "uploaded_evidence"),
    },
    missingContext: Array.isArray(bundle.missing_context)
      ? bundle.missing_context.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    readySources: countValue(sourceCounts.ready),
    queuedSources: countValue(sourceCounts.queued),
    processingSources: countValue(sourceCounts.processing),
    failedSources: countValue(sourceCounts.failed),
    ghgiStatus: stringValue(optionalSources.ghgi),
    hiapStatus: stringValue(optionalSources.hiap),
    retryable: bundle.retryable === true,
  };
}

export function getRunProgressPercent(
  status: string,
  workflowStep: string,
  summary: Record<string, unknown>,
): number {
  const normalizedStatus = status.trim().toLowerCase();
  if (["completed", "exported", "succeeded"].includes(normalizedStatus)) {
    return 100;
  }

  const bundle = getConceptNoteBundleProgress(summary);
  if (workflowStep === "interviewing" || bundle.status === "ready") {
    return 40;
  }
  if (bundle.status === "building") {
    return 28;
  }
  if (bundle.readySources > 0) {
    return 18;
  }
  if (bundle.processingSources > 0 || bundle.queuedSources > 0) {
    return 10;
  }
  return 4;
}

export function formatRelativeTime(
  value: string,
  locale: string,
  now: number = Date.now(),
): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const elapsedSeconds = Math.round((timestamp - now) / 1000);
  const divisions: Array<{
    amount: number;
    unit: Intl.RelativeTimeFormatUnit;
  }> = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.345, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ];

  let duration = elapsedSeconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
        Math.round(duration),
        division.unit,
      );
    }
    duration /= division.amount;
  }

  return "";
}
