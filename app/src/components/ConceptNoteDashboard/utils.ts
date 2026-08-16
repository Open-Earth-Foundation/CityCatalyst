export type RunStatusTone =
  "positive" | "warning" | "info" | "negative" | "neutral";

interface RunStatusPresentation {
  tone: RunStatusTone;
  translationKey?: string;
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

export function getRunStatusPresentation(
  status: string,
): RunStatusPresentation {
  return (
    statusPresentations[status.trim().toLowerCase()] ?? { tone: "neutral" }
  );
}

export function humanizeLifecycleValue(value: string): string {
  const normalized = value.trim().replaceAll(/[_-]+/g, " ");
  if (!normalized) {
    return "";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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
  readySources: number;
  queuedSources: number;
  processingSources: number;
  failedSources: number;
  ghgiStatus: string | null;
  hiapStatus: string | null;
  retryable: boolean;
  warnings: string[];
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

export function getConceptNoteBundleProgress(
  summary: Record<string, unknown>,
): ConceptNoteBundleProgress {
  const bundle = recordValue(summary.context_bundle);
  const sourceCounts = recordValue(bundle.source_counts);
  const optionalSources = recordValue(bundle.optional_sources);

  return {
    status: stringValue(bundle.status),
    readySources: countValue(sourceCounts.ready),
    queuedSources: countValue(sourceCounts.queued),
    processingSources: countValue(sourceCounts.processing),
    failedSources: countValue(sourceCounts.failed),
    ghgiStatus: stringValue(optionalSources.ghgi),
    hiapStatus: stringValue(optionalSources.hiap),
    retryable: bundle.retryable === true,
    warnings: Array.isArray(bundle.warnings)
      ? bundle.warnings.filter(
          (warning): warning is string => typeof warning === "string",
        )
      : [],
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
