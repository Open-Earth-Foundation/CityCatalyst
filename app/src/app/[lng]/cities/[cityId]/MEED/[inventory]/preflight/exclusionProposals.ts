/**
 * Which catalog actions the city's exclusion criteria would actually remove.
 *
 * The criteria are chosen on the Strategic preferences screen, but a criterion
 * is an abstraction — "exclude Transportation" says nothing about how many
 * actions that costs, or which ones. This turns the criteria into a concrete,
 * reviewable list so the user confirms action IDs rather than a rule.
 *
 * Both rules here are exact structural matches over the catalog, so computing
 * them locally gives the same answer the prioritizer would. Free text is
 * deliberately *not* matched: upstream resolves it with an LLM
 * (`resolve_free_text_exclusions`, tagged `free_text_llm`), and a substring
 * imitation would propose a different set of actions than the ranking goes on
 * to drop — worse than proposing none and saying so.
 */
import type { TFunction } from "i18next";
import type { MeedProposedExcludedAction } from "@/util/types/meed";
import type {
  MeedActionIndex,
  MeedCatalogCoBenefit,
} from "../results/components/actionCatalog";

/** `matchedBy` tags, kept identical to the ones the preview endpoint emits. */
export const MATCHED_BY_SECTOR = "sector";
export const MATCHED_BY_CO_BENEFIT = "co_benefit";

export interface MeedExclusionCriteria {
  /** Snake_case GPC sector tags, e.g. `transportation`. */
  excludedSectors: string[];
  /** Snake_case co-benefit keys, e.g. `air_quality`. */
  excludedCoBenefits: string[];
}

export interface MeedExclusionMatch {
  actionId: string;
  /** The excluded sector this action belongs to, if any. */
  matchedSectorTag?: string;
  /** Excluded co-benefits this action is recorded as harming. */
  matchedCoBenefitKeys: string[];
}

/** API option keys use snake_case; locale keys are kebab-case. */
function kebab(key: string): string {
  return key.replace(/_/g, "-");
}

/**
 * Whether a co-benefit entry records harm.
 *
 * Two fields carry the same fact and the live catalog populates both. The
 * frontend has only ever read the string; the prioritizer's own test is
 * numeric (`impact_numeric < 0`, exclusion_resolution.py). Reading either keeps
 * this preview consistent with what the server would remove even if one of the
 * two goes missing upstream.
 */
function isNegative(entry: MeedCatalogCoBenefit | undefined): boolean {
  if (!entry) return false;
  if (
    typeof entry.impact_relationship === "string" &&
    entry.impact_relationship.trim().toLowerCase() === "negative"
  ) {
    return true;
  }
  return typeof entry.impact_numeric === "number" && entry.impact_numeric < 0;
}

/**
 * Match the catalog against the criteria. Pure — no i18n, no React — so the
 * matching rules can be tested without bootstrapping either.
 */
export function computeExclusionMatches(
  index: MeedActionIndex,
  criteria: MeedExclusionCriteria,
): MeedExclusionMatch[] {
  const { excludedSectors, excludedCoBenefits } = criteria;
  if (excludedSectors.length === 0 && excludedCoBenefits.length === 0) {
    return [];
  }

  const matches: MeedExclusionMatch[] = [];

  for (const [actionId, action] of index) {
    // `sectorTag` is derived from `emissions.sector_number` at index-build
    // time and shares its vocabulary with the preference keys, so this is a
    // straight compare — no display-name mapping layer needed.
    const matchedSectorTag =
      action.sectorTag && excludedSectors.includes(action.sectorTag)
        ? action.sectorTag
        : undefined;

    const matchedCoBenefitKeys = excludedCoBenefits.filter((key) =>
      isNegative(action.coBenefits?.[key]),
    );

    if (!matchedSectorTag && matchedCoBenefitKeys.length === 0) continue;
    matches.push({ actionId, matchedSectorTag, matchedCoBenefitKeys });
  }

  // Map iteration order follows the catalog payload; sort so a re-render can
  // never reshuffle the list under the user's checkboxes.
  return matches.sort((a, b) => a.actionId.localeCompare(b.actionId));
}

/**
 * Render matches into the shape the `/exclusions/preview` endpoint returns, so
 * the panel that consumes this needs no reshaping when that endpoint lands.
 *
 * Labels come from this screen's own `sector-*` / `co-benefit-*` keys — the
 * same ones the criteria summary directly above the panel renders — rather
 * than the results screen's `cobenefit-*` vocabulary, which is a different key
 * set in a different namespace.
 */
export function toProposedExclusions(
  matches: MeedExclusionMatch[],
  index: MeedActionIndex,
  t: TFunction,
): MeedProposedExcludedAction[] {
  return matches
    .map((match) => {
      const reasons: string[] = [];
      const matchedBy: string[] = [];

      if (match.matchedSectorTag) {
        reasons.push(
          t("preview-reason-sector", {
            sector: t(`sector-${kebab(match.matchedSectorTag)}`),
          }),
        );
        matchedBy.push(MATCHED_BY_SECTOR);
      }
      for (const key of match.matchedCoBenefitKeys) {
        reasons.push(
          t("preview-reason-co-benefit", {
            coBenefit: t(`co-benefit-${kebab(key)}`),
          }),
        );
      }
      if (match.matchedCoBenefitKeys.length > 0) {
        matchedBy.push(MATCHED_BY_CO_BENEFIT);
      }

      return {
        actionId: match.actionId,
        actionName: index.get(match.actionId)?.actionName ?? match.actionId,
        reasons,
        matchedBy,
      };
    })
    .sort((a, b) => a.actionName.localeCompare(b.actionName));
}
