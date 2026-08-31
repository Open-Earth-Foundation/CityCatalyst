/**
 * Co-benefits shown on the results overview.
 *
 * The prioritizer may report the co-benefits it scored an action on inside
 * `evidence_summary`; the action-pathways catalog carries the canonical
 * `coBenefits` map. Both are read here, evidence first — and an explicitly
 * negative relationship is a trade-off, not a benefit, so the two lists are
 * split apart rather than lumped together.
 *
 * When neither source carries co-benefit data the strip renders nothing at all:
 * this section must never invent benefits an action was not scored on.
 */
import type { IconType } from "react-icons";
import {
  LuBike,
  LuCircleCheck,
  LuDroplet,
  LuHandshake,
  LuHouse,
  LuLeaf,
  LuWallet,
  LuWind,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import type { MeedActionIndex } from "./actionCatalog";

/**
 * Canonical (snake_case) co-benefit key → icon.
 *
 * These seven are the whole vocabulary the live catalog uses across all 102
 * actions. Anything else falls through to `humanizeKey` + `LuCircleCheck`, so a
 * new key from upstream still renders — but do not pre-populate this map with
 * guesses: an icon here without its `cobenefit-*` label in meed-results.json
 * (or the reverse) is how the two lists drift apart.
 */
const CO_BENEFIT_ICONS: Record<string, IconType> = {
  air_quality: LuWind,
  cost_of_living: LuWallet,
  habitat: LuLeaf,
  housing: LuHouse,
  mobility: LuBike,
  stakeholder_engagement: LuHandshake,
  water_quality: LuDroplet,
};

export function coBenefitIcon(key: string): IconType {
  return CO_BENEFIT_ICONS[normalizeKey(key)] ?? LuCircleCheck;
}

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const LABEL_STOP_WORDS = new Set([
  "of",
  "and",
  "to",
  "the",
  "in",
  "for",
  "a",
  "an",
  "or",
]);

/** Last-resort label for a co-benefit key with no translation of its own. */
function humanizeKey(key: string): string {
  return normalizeKey(key)
    .split("_")
    .map((word, i) =>
      i > 0 && LABEL_STOP_WORDS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export function coBenefitLabel(key: string, t: TFunction): string {
  const normalized = normalizeKey(key);
  return t(`cobenefit-${normalized.replace(/_/g, "-")}`, {
    defaultValue: humanizeKey(normalized),
  });
}

type CoBenefitRelationship = "positive" | "negative" | "unknown";

/**
 * How a co-benefit entry relates to the action.
 *
 * Only an explicit "negative" is a trade-off; only an explicit "positive" is a
 * confirmed benefit. Everything else — a missing field, a null, a value the
 * upstream catalog has not standardised — is `unknown`, and callers decide what
 * to do with it. The earlier `isPositive` asserted an absent field *as* a
 * delivered benefit, which is a claim the data never made.
 */
function relationshipOf(value: unknown): CoBenefitRelationship {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized === "negative") return "negative";
  if (normalized === "positive") return "positive";
  return "unknown";
}

interface CoBenefitEntry {
  key: string;
  relationship: CoBenefitRelationship;
}

function entryRelationship(value: unknown): CoBenefitRelationship {
  if (!value || typeof value !== "object") return "unknown";
  return relationshipOf(
    (value as { impact_relationship?: unknown }).impact_relationship,
  );
}

/**
 * Co-benefit entries reported in the ranking's evidence, or null when it
 * carries none — null is the signal to fall through to the catalog, so an
 * action whose evidence lists only trade-offs is not quietly topped up with
 * catalog benefits.
 */
function evidenceEntries(
  action: MeedRankedActionResult,
): CoBenefitEntry[] | null {
  const evidence = action.evidence_summary as Record<string, unknown> | null;
  const raw =
    evidence?.co_benefits ?? evidence?.coBenefits ?? evidence?.cobenefits;

  // A bare array names keys with no relationship to read: all unknown.
  if (Array.isArray(raw)) {
    const entries = raw
      .filter((entry): entry is string => typeof entry === "string")
      .map((key) => ({
        key: normalizeKey(key),
        relationship: "unknown" as const,
      }));
    return entries.length > 0 ? entries : null;
  }
  if (raw && typeof raw === "object") {
    const entries = Object.entries(raw as Record<string, unknown>).map(
      ([key, value]) => ({
        key: normalizeKey(key),
        relationship: entryRelationship(value),
      }),
    );
    return entries.length > 0 ? entries : null;
  }
  return null;
}

function catalogEntries(
  action: MeedRankedActionResult,
  index: MeedActionIndex,
): CoBenefitEntry[] {
  const catalog = index.get(action.action_id)?.coBenefits;
  if (!catalog) return [];
  return Object.entries(catalog).map(([key, value]) => ({
    key: normalizeKey(key),
    relationship: relationshipOf(value?.impact_relationship),
  }));
}

/** Every co-benefit entry for one action, evidence first, catalog second. */
function coBenefitEntries(
  action: MeedRankedActionResult,
  index: MeedActionIndex,
): CoBenefitEntry[] {
  return evidenceEntries(action) ?? catalogEntries(action, index);
}

/**
 * Co-benefit keys the action delivers.
 *
 * `unknown` counts as a benefit on purpose: the live catalog carries no
 * negative relationships at all, so this shows exactly what it showed before
 * relationships were read at all. Only an explicit `negative` is withheld.
 */
export function actionCoBenefits(
  action: MeedRankedActionResult,
  index: MeedActionIndex,
): string[] {
  return coBenefitEntries(action, index)
    .filter((entry) => entry.relationship !== "negative")
    .map((entry) => entry.key);
}

/**
 * Co-benefit keys the action explicitly scores *negatively* on — its trade-offs.
 * Empty for every action in the live catalog today; the section that renders it
 * hides itself when so.
 */
export function actionTradeOffs(
  action: MeedRankedActionResult,
  index: MeedActionIndex,
): string[] {
  return coBenefitEntries(action, index)
    .filter((entry) => entry.relationship === "negative")
    .map((entry) => entry.key);
}

export interface MeedCoBenefitTally {
  key: string;
  /** How many of the given actions deliver this co-benefit. */
  count: number;
}

/**
 * Co-benefits shared across a set of actions, most common first. Returns an
 * empty list when no action carries co-benefit data, which is the signal to
 * omit the whole section.
 */
export function tallyCoBenefits(
  actions: MeedRankedActionResult[],
  index: MeedActionIndex,
  limit = 6,
): MeedCoBenefitTally[] {
  const counts = new Map<string, number>();
  for (const action of actions) {
    for (const key of actionCoBenefits(action, index)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}
