import type { TFunction } from "i18next";

const DRAFT_RUN_STATUS_LABEL_KEYS = {
  resolving_scope: "artifact-draft-status-resolving-scope",
  loading_context: "artifact-draft-status-loading-context",
  generating: "artifact-draft-status-generating",
  ready: "artifact-draft-status-ready",
  reviewed: "artifact-draft-status-reviewed",
  saved: "artifact-draft-status-saved",
  partially_saved: "artifact-draft-status-partially-saved",
  partially_committed: "artifact-draft-status-partially-committed",
  no_changes: "artifact-draft-status-no-changes",
  failed: "artifact-draft-status-failed",
} as const;

export function draftRunStatusLabel(t: TFunction, status: string): string {
  const key =
    DRAFT_RUN_STATUS_LABEL_KEYS[
      status as keyof typeof DRAFT_RUN_STATUS_LABEL_KEYS
    ];
  return key ? t(key) : t("artifact-draft-status-unknown");
}

export function formatDraftRunUpdatedAt(
  t: TFunction,
  value: string,
  lng: string,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("drafts-panel-updated-at-unavailable");
  }
  return new Intl.DateTimeFormat(lng, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
