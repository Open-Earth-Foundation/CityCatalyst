/**
 * Co-benefits shown on the results overview.
 *
 * The prioritizer may report the co-benefits it scored an action on inside
 * `evidence_summary`; the action-pathways catalog carries the canonical
 * `coBenefits` map. Both are read here, evidence first, and only *positive*
 * relationships count — a negative relationship is a trade-off, not a benefit.
 *
 * When neither source carries co-benefit data the strip renders nothing at all:
 * this section must never invent benefits an action was not scored on.
 */
import type { IconType } from "react-icons";
import {
  LuBatteryCharging,
  LuBike,
  LuBird,
  LuBrain,
  LuBuilding2,
  LuCircleCheck,
  LuDroplet,
  LuGlobe,
  LuGraduationCap,
  LuHandshake,
  LuHardHat,
  LuHeartHandshake,
  LuHeartPulse,
  LuHouse,
  LuLeaf,
  LuLightbulb,
  LuMountain,
  LuRecycle,
  LuSun,
  LuTrees,
  LuTrendingUp,
  LuUsers,
  LuVolumeX,
  LuWallet,
  LuWaves,
  LuWheat,
  LuWind,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import type { MeedActionIndex } from "./actionCatalog";

/** Canonical (snake_case) co-benefit key → icon. */
const CO_BENEFIT_ICONS: Record<string, IconType> = {
  air_quality: LuWind,
  public_health: LuHeartPulse,
  biodiversity: LuBird,
  habitat: LuLeaf,
  employment: LuHardHat,
  economic_development: LuTrendingUp,
  social_equity: LuHeartHandshake,
  energy_security: LuBatteryCharging,
  water_management: LuWaves,
  water_quality: LuDroplet,
  noise_reduction: LuVolumeX,
  urban_heat: LuSun,
  food_security: LuWheat,
  resilience: LuMountain,
  climate_resilience: LuGlobe,
  gender_equity: LuUsers,
  education: LuGraduationCap,
  innovation: LuLightbulb,
  community_wellbeing: LuBuilding2,
  housing: LuHouse,
  cost_of_living: LuWallet,
  stakeholder_engagement: LuHandshake,
  mobility: LuBike,
  green_spaces: LuTrees,
  mental_health: LuBrain,
  waste_reduction: LuRecycle,
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

function isPositive(relationship: unknown): boolean {
  return (
    typeof relationship !== "string" ||
    relationship.trim().toLowerCase() === "positive"
  );
}

/** Positive co-benefit keys reported in the ranking's evidence, if any. */
function fromEvidence(action: MeedRankedActionResult): string[] {
  const evidence = action.evidence_summary as Record<string, unknown> | null;
  const raw =
    evidence?.co_benefits ?? evidence?.coBenefits ?? evidence?.cobenefits;

  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string");
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => {
        if (!value || typeof value !== "object") return true;
        return isPositive(
          (value as { impact_relationship?: unknown }).impact_relationship,
        );
      })
      .map(([key]) => key);
  }
  return [];
}

/** Positive co-benefit keys for one action, evidence first, catalog second. */
export function actionCoBenefits(
  action: MeedRankedActionResult,
  index: MeedActionIndex,
): string[] {
  const evidence = fromEvidence(action);
  if (evidence.length > 0) return evidence.map(normalizeKey);

  const catalog = index.get(action.action_id)?.coBenefits;
  if (!catalog) return [];
  return Object.entries(catalog)
    .filter(([, value]) => isPositive(value?.impact_relationship))
    .map(([key]) => normalizeKey(key));
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
