import type { TFunction } from "i18next";
import type { AdaptationAction } from "../../_lib/types";
import { pick } from "../../_lib/localized";
import type { NotRankedReason } from "../../_lib/ranking";
import { UNCOVERED_HAZARD_LABEL } from "../../_lib/riskCells";

/**
 * Why an action sits outside the ranking, in words, wherever it shows up:
 * as a related action, in its own drawer, or under the list. The reason
 * comes from the method, so every place gives the same one.
 */
function hazardOf(action: AdaptationAction, lng: string): string {
  return action.uncoveredHazard
    ? pick(UNCOVERED_HAZARD_LABEL[action.uncoveredHazard], lng)
    : "";
}

/** One sentence: "A planning action: it works through …". */
export function unrankedWhy(
  action: AdaptationAction,
  reason: NotRankedReason,
  lng: string,
  t: TFunction,
): string {
  return t(`next-unranked-why-${reason}`, { hazard: hazardOf(action, lng) });
}

/** A short aside for inline mentions: "not ranked, planning action". */
export function unrankedShort(
  action: AdaptationAction,
  reason: NotRankedReason,
  lng: string,
  t: TFunction,
): string {
  return t(`next-unranked-short-${reason}`, { hazard: hazardOf(action, lng) });
}
