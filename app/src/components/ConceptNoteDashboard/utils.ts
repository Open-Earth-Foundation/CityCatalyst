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
  const query = new URLSearchParams({ runId });
  return `/${lng}/cities/${cityId}/concept-notes/wiring?${query}`;
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
