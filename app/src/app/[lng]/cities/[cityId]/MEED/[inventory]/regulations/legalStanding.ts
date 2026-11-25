/**
 * Legal standing of a ranked action.
 *
 * The prioritizer scores every candidate against the laws that apply to the
 * municipality and keeps all of them in the ranking: legal is one component of
 * feasibility, so an action the city cannot carry out on its own authority
 * ranks lower rather than disappearing. The verdict that used to drive a hard
 * filter is therefore no longer "blocked" for any action; what still says
 * whether the city can act alone is `ownership_category`, and that is what
 * these helpers surface. Its values are shown one-to-one — enabled,
 * conditional, blocked — plus "not assessed" when the service reported none.
 *
 * The block lives on each ranked action under
 * `evidence_summary.feasibility.legal`, which the type leaves untyped; this is
 * the one place that reads it.
 */

import type {
  MeedLocalizedText,
  MeedRankedActionResult,
} from "@/util/types/meed";
import type { MeedTone } from "../../components/meedTones";
import { resolveLocalizedText } from "../../localizedText";

export type MeedLegalCategory =
  | "enabled"
  | "conditional"
  | "blocked"
  | "not_assessed";

/** Display order: what needs attention first. */
export const LEGAL_CATEGORY_ORDER: readonly MeedLegalCategory[] = [
  "blocked",
  "conditional",
  "enabled",
  "not_assessed",
];

export const LEGAL_CATEGORY_TONE: Record<MeedLegalCategory, MeedTone> = {
  blocked: "negative",
  conditional: "warning",
  enabled: "positive",
  not_assessed: "neutral",
};

/** i18n key for a category label; the same key exists in `meed-regulations` and `meed-results`. */
export function legalCategoryLabelKey(category: MeedLegalCategory): string {
  return `legal-${category.replace("_", "-")}`;
}

export interface MeedLegalStanding {
  actionId: string;
  /** Can the municipality act on its own authority? */
  ownership: MeedLegalCategory;
  /** The service's overall legal assessment. */
  verdict: MeedLegalCategory;
  /** Legal component of the feasibility score, 0..1; null when not scored. */
  score: number | null;
  /** Where the score came from, e.g. "assessment" or "neutral_fallback". */
  source: string | null;
  ownershipDescription: string | null;
  justification: string | null;
  references: string[];
}

const KNOWN: ReadonlySet<string> = new Set(["enabled", "conditional", "blocked"]);

function toCategory(value: unknown): MeedLegalCategory {
  if (typeof value !== "string") return "not_assessed";
  const key = value.trim().toLowerCase();
  return KNOWN.has(key) ? (key as MeedLegalCategory) : "not_assessed";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * A translated field, whichever way the service spelt it: a `{ en, es }` map,
 * or the older pair of a native string plus a suffixed translation.
 */
function localized(
  legal: Record<string, unknown>,
  key: string,
  nativeLanguage: string,
  suffixedLanguage: string,
): MeedLocalizedText | null {
  const value = legal[key];
  const map = asRecord(value);
  if (map) return map as MeedLocalizedText;
  const suffixed = legal[`${key}_${suffixedLanguage}`];
  const out: MeedLocalizedText = {};
  if (typeof value === "string") out[nativeLanguage] = value;
  if (typeof suffixed === "string") out[suffixedLanguage] = suffixed;
  return Object.keys(out).length ? out : null;
}

/** The legal block of one ranked action, or null when it carries none. */
export function readLegalStanding(
  action: MeedRankedActionResult,
  language = "en",
): MeedLegalStanding | null {
  const feasibility = asRecord(asRecord(action.evidence_summary)?.feasibility);
  const legal = asRecord(feasibility?.legal);
  if (!legal) return null;

  const score = legal.component_score;
  const references = Array.isArray(legal.legal_references)
    ? legal.legal_references.filter((r): r is string => typeof r === "string")
    : [];

  return {
    actionId: action.action_id,
    ownership: toCategory(legal.ownership_category),
    verdict: toCategory(legal.verdict_category),
    score: typeof score === "number" && Number.isFinite(score) ? score : null,
    source: typeof legal.component_source === "string" ? legal.component_source : null,
    // Justification is native Spanish with an `_en` translation; the
    // ownership description is English with an `_es` one (see the type notes).
    ownershipDescription: resolveLocalizedText(
      localized(legal, "ownership_description", "en", "es"),
      language,
    ),
    justification: resolveLocalizedText(
      localized(legal, "legal_justification", "es", "en"),
      language,
    ),
    references,
  };
}

export function legalStandingByAction(
  ranked: MeedRankedActionResult[] | null | undefined,
  language = "en",
): Map<string, MeedLegalStanding> {
  const map = new Map<string, MeedLegalStanding>();
  for (const action of ranked ?? []) {
    const standing = readLegalStanding(action, language);
    if (standing) map.set(standing.actionId, standing);
  }
  return map;
}

export function countByOwnership(
  standings: Iterable<MeedLegalStanding>,
): Record<MeedLegalCategory, number> {
  const counts: Record<MeedLegalCategory, number> = {
    enabled: 0,
    conditional: 0,
    blocked: 0,
    not_assessed: 0,
  };
  for (const standing of standings) counts[standing.ownership] += 1;
  return counts;
}
