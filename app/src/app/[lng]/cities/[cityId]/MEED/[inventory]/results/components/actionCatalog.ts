/**
 * Minimal local view of the action-pathways catalog returned by
 * `useGetMeedActionsQuery` (typed `unknown` in the service layer — the full
 * catalog schema lives upstream in the Global API). Only the fields the
 * results screen reads are declared here.
 */
import type { TFunction } from "i18next";
import type { MeedLocalizedText } from "@/util/types/meed";
import type { MeedTone } from "../../../components/meedTones";
import { resolveLocalizedText } from "../../../localizedText";

export interface MeedCatalogCoBenefit {
  impact_relationship?: string | null;
  /**
   * Signed magnitude of the same fact. The prioritizer's own negativity test
   * is numeric (`impact_numeric < 0`); the catalog populates both fields.
   */
  impact_numeric?: number | null;
}

export interface MeedCatalogAction {
  actionId?: string;
  /**
   * Name and description in the language the index was built for (see
   * `buildActionIndex`), falling back to the catalog's English text.
   */
  actionName?: string;
  description?: string;
  /** The catalog's translation maps, e.g. `{ en, es, pt }`, when present. */
  nameI18n?: MeedLocalizedText | null;
  descriptionI18n?: MeedLocalizedText | null;
  /**
   * GPC sector tag, derived from `emissions` at index-build time — the catalog
   * has no sector field of its own. Never read a raw `sector` here: doing so is
   * what made every action render as "Cross-sector".
   */
  sectorTag?: string | null;
  /**
   * Pre-resolved sector label for catalogs whose sectors are not GPC sectors —
   * the Brazil adaptation track ranks on AdaptaBrasil sectors, which have no
   * `sector-*` key here. When present it wins over `sectorTag` lookup.
   */
  sectorLabel?: string | null;
  /** Raw catalog value, e.g. "<5 years". */
  timelineForImplementation?: string | null;
  /** Keyed by co-benefit key, e.g. `air_quality`. */
  coBenefits?: Record<string, MeedCatalogCoBenefit> | null;
  emissions?: {
    impact_text?: string | null;
    impact_numeric?: number | null;
    /** GPC roman numeral, e.g. "IV". */
    sector_number?: string | null;
    subsector_number?: number[] | null;
    /** e.g. ["IV.1"]. */
    gpc_reference_number?: string[] | null;
  } | null;
}

export type MeedActionIndex = Map<string, MeedCatalogAction>;

/**
 * Normalise the `emissions` block to snake_case.
 *
 * The Global API returns it camelCase (`impactNumeric`, `sectorNumber`); the
 * hiap-meed reference-data contract returns the same fields snake_case. Reading
 * only one casing is what left `reductionLevel` returning 0 ("Unknown") for
 * every action — the same defect class as the sector bug. Accept both so this
 * survives the migration to hiap-meed without a second fix.
 */
function normalizeEmissions(raw: unknown): MeedCatalogAction["emissions"] {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const pick = <T>(snake: string, camel: string): T | null =>
    (e[snake] ?? e[camel] ?? null) as T | null;
  return {
    impact_text: pick<string>("impact_text", "impactText"),
    impact_numeric: pick<number>("impact_numeric", "impactNumeric"),
    sector_number: pick<string>("sector_number", "sectorNumber"),
    subsector_number: pick<number[]>("subsector_number", "subsectorNumber"),
    gpc_reference_number: pick<string[]>(
      "gpc_reference_number",
      "gpcReferenceNumber",
    ),
  };
}

/**
 * Build an action_id → catalog record index from the raw (unknown) catalog
 * payload. Tolerates both a bare array and an `{ actions: [...] }` envelope,
 * and both camelCase (`actionId`) and PascalCase (`ActionID`) field casings.
 *
 * The catalog carries `nameI18n` / `descriptionI18n` maps (en, es, pt) next
 * to its English `actionName` / `description`. Pass the page language and
 * the index resolves them once, so every consumer — table, cards, drawer,
 * CSV, legal and policy screens — shows the user's language without each
 * one knowing about the maps. Without a language the English text is kept.
 */
function localizedMap(raw: unknown): MeedLocalizedText | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as MeedLocalizedText)
    : null;
}

export function buildActionIndex(
  data: unknown,
  language?: string,
): MeedActionIndex {
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
    const nameI18n = localizedMap(record.nameI18n ?? record.name_i18n);
    const descriptionI18n = localizedMap(
      record.descriptionI18n ?? record.description_i18n,
    );
    const englishName =
      (typeof record.actionName === "string" && record.actionName) ||
      (typeof record.ActionName === "string" && record.ActionName) ||
      undefined;
    const englishDescription =
      (typeof record.description === "string" && record.description) ||
      (typeof record.Description === "string" && record.Description) ||
      undefined;
    index.set(id, {
      actionId: id,
      actionName:
        (language && resolveLocalizedText(nameI18n, language)) || englishName,
      description:
        (language && resolveLocalizedText(descriptionI18n, language)) ||
        englishDescription,
      nameI18n,
      descriptionI18n,
      sectorTag: sectorTagOf(normalizeEmissions(record.emissions)),
      timelineForImplementation:
        (typeof record.timelineForImplementation === "string" &&
          record.timelineForImplementation) ||
        (typeof record.TimelineForImplementation === "string" &&
          record.TimelineForImplementation) ||
        null,
      coBenefits: (record.coBenefits ??
        record.CoBenefits ??
        null) as MeedCatalogAction["coBenefits"],
      emissions: normalizeEmissions(record.emissions),
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

// The catalog has no top-level sector field — verified across all 102 live
// actions. It carries the GPC sector under `emissions`, so the tag is derived
// from the roman numeral, mirroring SECTOR_NUMBER_TO_TAG in
// hiap-meed/app/modules/prioritizer/utils/sector_mapping.py. That is the same
// map the prioritizer matches `cityStrategicPreferenceSectors` through, so the
// chip on screen and the filter the ranking applied are the same fact.

const SECTOR_NUMBER_TO_TAG: Record<string, string> = {
  I: "stationary_energy",
  II: "transportation",
  III: "waste",
  IV: "ippu",
  V: "afolu",
};

const SECTOR_KEYS: Record<string, string> = {
  stationary_energy: "sector-stationary-energy",
  transportation: "sector-transportation",
  waste: "sector-waste",
  ippu: "sector-ippu",
  afolu: "sector-afolu",
};

/**
 * GPC sector tag for a catalog action, or null when the catalog says nothing.
 * Primary source is `emissions.sector_number`; the first GPC reference number
 * is the fallback, since both encode the same roman numeral.
 */
export function sectorTagOf(
  emissions: MeedCatalogAction["emissions"],
): string | null {
  if (!emissions) return null;
  const direct = emissions.sector_number?.trim().toUpperCase();
  if (direct && SECTOR_NUMBER_TO_TAG[direct])
    return SECTOR_NUMBER_TO_TAG[direct];
  const ref = emissions.gpc_reference_number?.[0];
  const prefix = ref?.split(".")[0]?.trim().toUpperCase();
  return (prefix && SECTOR_NUMBER_TO_TAG[prefix]) || null;
}

/** Raw catalog sector tag of an action, for icons and lookups. */
export function actionSectorTag(
  index: MeedActionIndex,
  actionId: string,
): string | null {
  return index.get(actionId)?.sectorTag ?? null;
}

/** True when the tag has a label in `meed-results` (a GPC sector). */
export function isKnownSectorTag(tag: string | null | undefined): boolean {
  return !!tag && tag in SECTOR_KEYS;
}

export function sectorLabel(
  index: MeedActionIndex,
  actionId: string,
  t: TFunction,
): string {
  const action = index.get(actionId);
  return action?.sectorLabel ?? sectorTagLabel(action?.sectorTag, t);
}

/** Label for a raw catalog sector tag, e.g. "stationary_energy". */
export function sectorTagLabel(
  tag: string | null | undefined,
  t: TFunction,
): string {
  if (!tag) return t("sector-unknown");
  return t(SECTOR_KEYS[tag] ?? "sector-unknown");
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

/** Tone for a reduction level, for the dot-and-word `MeedLevel`. */
export function reductionLevelTone(level: number): MeedTone {
  if (level >= 4) return "positive";
  if (level >= 2) return "warning";
  return "neutral";
}

/** Semantic color token for a reduction level. */
export function reductionLevelColor(level: number): string {
  if (level >= 4) return "sentiment.positiveDefault";
  if (level >= 2) return "sentiment.warningDefault";
  return "content.tertiary";
}
