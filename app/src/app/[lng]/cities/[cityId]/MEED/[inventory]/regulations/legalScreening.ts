/**
 * Legal screening, derived from a prioritization result.
 *
 * Legal hard filters run inside the prioritizer, so their output only exists on
 * a ranking. There are two populations and they live in different places:
 *
 * - **blocked** — actions the filter removed. These are on `removed_actions`,
 *   which the backend builds specifically for display.
 * - **flagged** — actions that were *kept* despite having no legal assessment.
 *   Because they were kept they never appear in `removed_actions`; the only
 *   record is `metadata.hard_filter_evidence_by_action_id`.
 *
 * `removed_actions` is newer than the prototype, which had to reconstruct both
 * populations from the evidence map. That path is kept as a fallback so an
 * older stored ranking still renders.
 */

import type {
  MeedHardFilterEvidence,
  MeedPrioritizeCityResult,
} from "@/util/types/meed";
import type { MeedActionIndex } from "../results/components/actionCatalog";
import { resolveLocalizedText } from "../../localizedText";

export interface LegalScreenedAction {
  actionId: string;
  actionName: string;
  sector?: string | null;
  reasons?: string[];
}

export interface LegalScreening {
  /** Actions that passed and went on to be ranked. */
  includedCount: number;
  blocked: LegalScreenedAction[];
  flagged: LegalScreenedAction[];
  /** True when the ranking carried no screening information at all. */
  isEmpty: boolean;
}

const EMPTY: LegalScreening = {
  includedCount: 0,
  blocked: [],
  flagged: [],
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

/** Evidence entries, tolerating the map being absent on older rankings. */
function evidenceEntries(
  result: MeedPrioritizeCityResult,
): [string, MeedHardFilterEvidence][] {
  const map = result.metadata?.hard_filter_evidence_by_action_id;
  return map && typeof map === "object" ? Object.entries(map) : [];
}

export function deriveLegalScreening(
  result: MeedPrioritizeCityResult | null | undefined,
  index: MeedActionIndex,
  /** Language for the translated legal text; defaults to English. */
  language = "en",
): LegalScreening {
  if (!result) return EMPTY;

  const evidence = evidenceEntries(result);

  // Blocked — prefer removed_actions, fall back to the evidence map.
  const removed = result.removed_actions ?? [];
  const blocked: LegalScreenedAction[] = removed.length
    ? removed
        .filter((r) => r.removal_source === "legal_hard_filter")
        .map((r) => ({
          actionId: r.action_id,
          actionName: nameOf(index, r.action_id, r.action_name),
          sector: sectorOf(index, r.action_id),
          reasons: [
            r.removal_reason,
            resolveLocalizedText(r.legal?.legalJustification, language),
          ]
            .filter((v): v is string => typeof v === "string" && v.length > 0)
            .slice(0, 2),
        }))
    : evidence
        .filter(([, e]) => e?.legal_verdict_category === "blocked")
        .map(([actionId, e]) => ({
          actionId,
          actionName: nameOf(index, actionId),
          sector: sectorOf(index, actionId),
          reasons: e?.discard_reason ? [e.discard_reason] : [],
        }));

  // Flagged — kept, but with no legal assessment behind them. Only the evidence
  // map knows about these.
  const blockedIds = new Set(blocked.map((a) => a.actionId));
  const flagged: LegalScreenedAction[] = evidence
    .filter(
      ([actionId, e]) =>
        !blockedIds.has(actionId) && e?.legal_assessment_present === false,
    )
    .map(([actionId]) => ({
      actionId,
      actionName: nameOf(index, actionId),
      sector: sectorOf(index, actionId),
    }));

  const includedCount =
    result.metadata?.counts?.valid_actions ??
    result.ranked_actions?.length ??
    result.ranked_action_ids?.length ??
    0;

  return {
    includedCount,
    blocked,
    flagged,
    // Screening ran but cleared everything is a real, different answer from
    // "this ranking carried no screening data" — the screen must not show an
    // all-clear card for the latter.
    isEmpty: evidence.length === 0 && removed.length === 0,
  };
}
