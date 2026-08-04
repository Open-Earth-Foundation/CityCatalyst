/**
 * Minimal local view of the action-pathways catalog returned by
 * `useGetMeedActionsQuery` (typed `unknown` in the service layer — the full
 * catalog schema lives upstream in the Global API). Only the fields the
 * results screen reads are declared here.
 */
import type { TFunction } from "i18next";

export interface MeedCatalogCoBenefit {
  impact_relationship?: string | null;
}

export interface MeedCatalogAction {
  actionId?: string;
  actionName?: string;
  description?: string;
  sector?: string[] | string | null;
  /** Raw catalog value, e.g. "<5 years". */
  timelineForImplementation?: string | null;
  /** Keyed by co-benefit key, e.g. `air_quality`. */
  coBenefits?: Record<string, MeedCatalogCoBenefit> | null;
  emissions?: {
    impact_text?: string | null;
    impact_numeric?: number | null;
  } | null;
}

export type MeedActionIndex = Map<string, MeedCatalogAction>;

/**
 * Build an action_id → catalog record index from the raw (unknown) catalog
 * payload. Tolerates both a bare array and an `{ actions: [...] }` envelope,
 * and both camelCase (`actionId`) and PascalCase (`ActionID`) field casings.
 */
export function buildActionIndex(data: unknown): MeedActionIndex {
  const index: MeedActionIndex = new Map();
  const rows: unknown[] = Array.isArray(data)
    ? data
    : data &&
        typeof data === "object" &&
        Array.isArray((data as { actions?: unknown[] }).actions)
      ? (data as { actions: unknown[] }).actions
      : [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id =
      (typeof record.actionId === "string" && record.actionId) ||
      (typeof record.ActionID === "string" && record.ActionID) ||
      null;
    if (!id) continue;
    index.set(id, {
      actionId: id,
      actionName:
        (typeof record.actionName === "string" && record.actionName) ||
        (typeof record.ActionName === "string" && record.ActionName) ||
        undefined,
      description:
        (typeof record.description === "string" && record.description) ||
        (typeof record.Description === "string" && record.Description) ||
        undefined,
      sector: (record.sector ?? record.Sector ?? null) as
        | string[]
        | string
        | null,
      timelineForImplementation:
        (typeof record.timelineForImplementation === "string" &&
          record.timelineForImplementation) ||
        (typeof record.TimelineForImplementation === "string" &&
          record.TimelineForImplementation) ||
        null,
      coBenefits: (record.coBenefits ??
        record.CoBenefits ??
        null) as MeedCatalogAction["coBenefits"],
      emissions: (record.emissions ?? null) as MeedCatalogAction["emissions"],
    });
  }
  return index;
}

export function actionName(
  index: MeedActionIndex,
  actionId: string,
  t: TFunction,
): string {
  return (
    index.get(actionId)?.actionName ??
    (index.size > 0 ? actionId : t("unknown-action"))
  );
}

export function actionDescription(
  index: MeedActionIndex,
  actionId: string,
): string | undefined {
  return index.get(actionId)?.description;
}

// ─── Timeline display ────────────────────────────────────────────────────────
// The catalog stores implementation timelines as raw bucket strings ("<5
// years"). They are data, not copy, so they are mapped to i18n keys here rather
// than rendered verbatim.

const TIMELINE_KEYS: Record<string, string> = {
  "<5 years": "timeline-short",
  "<5years": "timeline-short",
  short: "timeline-short",
  "5-10 years": "timeline-medium",
  "5–10 years": "timeline-medium",
  medium: "timeline-medium",
  ">10 years": "timeline-long",
  ">10years": "timeline-long",
  long: "timeline-long",
};

export function timelineLabel(
  index: MeedActionIndex,
  actionId: string,
  t: TFunction,
): string {
  const raw = index.get(actionId)?.timelineForImplementation;
  if (!raw) return t("timeline-unknown");
  return t(TIMELINE_KEYS[raw.toLowerCase().trim()] ?? "timeline-unknown");
}

// ─── Sector display ──────────────────────────────────────────────────────────

const SECTOR_KEYS: Record<string, string> = {
  stationary_energy: "sector-stationary-energy",
  transportation: "sector-transportation",
  waste: "sector-waste",
  ippu: "sector-ippu",
  afolu: "sector-afolu",
  cross_sector: "sector-cross-sector",
};

export function sectorLabel(
  index: MeedActionIndex,
  actionId: string,
  t: TFunction,
): string {
  const raw = index.get(actionId)?.sector;
  const tag = Array.isArray(raw) ? raw[0] : raw;
  if (!tag) return t("sector-cross-sector");
  const key = SECTOR_KEYS[tag.toLowerCase().replace(/-/g, "_")];
  return key ? t(key) : tag.replace(/_/g, " ");
}

// ─── Reduction-potential scale (5 levels) ─────────────────────────────────────
// Driven by the catalog action's emissions impact fields, not the ranking
// score. Level 1 = very low … 5 = very high; 0 = unknown.

export const REDUCTION_SEGMENTS = 5;

const IMPACT_TEXT_TO_LEVEL: Record<string, number> = {
  "very low": 1,
  low: 2,
  medium: 3,
  moderate: 3,
  high: 4,
  "very high": 5,
};

export function reductionLevel(
  index: MeedActionIndex,
  actionId: string,
): number {
  const emissions = index.get(actionId)?.emissions;
  const numeric = emissions?.impact_numeric;
  if (typeof numeric === "number" && numeric >= 1) {
    return Math.min(5, Math.max(1, Math.round(numeric)));
  }
  const text = (emissions?.impact_text ?? "").toLowerCase().trim();
  return IMPACT_TEXT_TO_LEVEL[text] ?? 0;
}

const LEVEL_LABEL_KEYS = [
  "reduction-unknown",
  "reduction-very-low",
  "reduction-low",
  "reduction-medium",
  "reduction-high",
  "reduction-very-high",
];

export function reductionLevelLabelKey(level: number): string {
  return LEVEL_LABEL_KEYS[level] ?? LEVEL_LABEL_KEYS[0];
}

/** Semantic color token for a reduction level. */
export function reductionLevelColor(level: number): string {
  if (level >= 4) return "sentiment.positiveDefault";
  if (level >= 2) return "sentiment.warningDefault";
  return "content.tertiary";
}
