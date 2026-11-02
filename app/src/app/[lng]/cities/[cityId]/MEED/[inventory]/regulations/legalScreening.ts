/**
 * Legal screening, derived from a prioritization result.
 *
 * Legal checks run inside the prioritizer, so their output only exists on a
 * ranking. Two populations, in two places:
 *
 * - **ranked actions**, grouped by whether the municipality can act on its own
 *   authority (`ownership_category`, read through `legalStanding.ts`). Since
 *   the hard filter was turned off every assessed action is kept and scored,
 *   so this is where "blocked" now lives.
 * - **excluded before scoring** — whatever the backend did remove, on
 *   `removed_actions`. Empty on current rankings; still rendered when an older
 *   stored ranking carries them.
 */

import type { MeedPrioritizeCityResult } from "@/util/types/meed";
import type { MeedActionIndex } from "../results/components/actionCatalog";
import { resolveLocalizedText } from "../../localizedText";
import {
  legalStandingByAction,
  type MeedLegalCategory,
  type MeedLegalStanding,
} from "./legalStanding";

export interface LegalScreenedAction {
  actionId: string;
  actionName: string;
  sector?: string | null;
  /** Position in the ranking; absent for an action removed before scoring. */
  rank?: number;
  /** Why the backend removed it (excluded actions only). */
  reasons?: string[];
  standing?: MeedLegalStanding;
}

export interface LegalScreening {
  /** Actions that were scored and ranked. */
  includedCount: number;
  /** Ranked actions by municipal authority, in display order. */
  groups: Record<MeedLegalCategory, LegalScreenedAction[]>;
  excludedBeforeScoring: LegalScreenedAction[];
  /** True when the ranking carried no legal information at all. */
  isEmpty: boolean;
}

function emptyGroups(): Record<MeedLegalCategory, LegalScreenedAction[]> {
  return { blocked: [], conditional: [], enabled: [], not_assessed: [] };
}

const EMPTY: LegalScreening = {
  includedCount: 0,
  groups: emptyGroups(),
  excludedBeforeScoring: [],
  isEmpty: true,
};

function nameOf(
  index: MeedActionIndex,
  actionId: string,
  fallback?: string | null,
): string {
  return index.get(actionId)?.actionName ?? fallback ?? actionId;
}

function sectorOf(index: MeedActionIndex, actionId: string): string | null {
  return index.get(actionId)?.sectorTag ?? null;
}

export function deriveLegalScreening(
  result: MeedPrioritizeCityResult | null | undefined,
  index: MeedActionIndex,
  /** Language for the translated legal text; defaults to English. */
  language = "en",
): LegalScreening {
  if (!result) return EMPTY;

  const ranked = result.ranked_actions ?? [];
  const standings = legalStandingByAction(ranked, language);
  const groups = emptyGroups();
  for (const action of ranked) {
    const standing = standings.get(action.action_id);
    if (!standing) continue;
    groups[standing.ownership].push({
      actionId: action.action_id,
      actionName: nameOf(index, action.action_id),
      sector: sectorOf(index, action.action_id),
      rank: action.rank,
      standing,
    });
  }

  const removed = result.removed_actions ?? [];
  const excludedBeforeScoring: LegalScreenedAction[] = removed.map((r) => ({
    actionId: r.action_id,
    actionName: nameOf(index, r.action_id, r.action_name),
    sector: sectorOf(index, r.action_id),
    reasons: [
      r.removal_reason,
      resolveLocalizedText(r.legal?.legalJustification, language),
    ]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .slice(0, 2),
  }));

  const includedCount =
    result.metadata?.counts?.valid_actions ??
    ranked.length ??
    result.ranked_action_ids?.length ??
    0;

  return {
    includedCount,
    groups,
    excludedBeforeScoring,
    // "Every action is enabled" is a real answer; "this ranking carried no
    // legal data" is a different one, and must not show as an all-clear.
    isEmpty: standings.size === 0 && removed.length === 0,
  };
}
