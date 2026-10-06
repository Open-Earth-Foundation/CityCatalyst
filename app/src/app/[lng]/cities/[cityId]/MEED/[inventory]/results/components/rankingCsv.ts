/**
 * The ranked-actions table, as CSV rows.
 *
 * Every cell is rendered the same way the table renders it — same catalog
 * lookups, same reduction-level label mapping — so an exported file and the
 * screen it came from can never disagree. Scores are written as whole numbers
 * (0–100) rather than the 0–1 fractions the API returns, matching how the
 * prototype's export read in a spreadsheet.
 */
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import {
  actionName,
  reductionLevel,
  reductionLevelLabelKey,
  sectorLabel,
  type MeedActionIndex,
} from "./actionCatalog";

function percent(score: number): string {
  return (score * 100).toFixed(0);
}

export function buildRankingCsv(
  actions: MeedRankedActionResult[],
  index: MeedActionIndex,
  t: TFunction,
): { headers: string[]; rows: (string | number)[][] } {
  const headers = [
    t("csv-column-rank"),
    t("csv-column-action"),
    t("csv-column-sector"),
    t("csv-column-reduction"),
    t("csv-column-impact"),
    t("csv-column-alignment"),
    t("csv-column-feasibility"),
    t("csv-column-final"),
  ];

  const rows = actions.map((action) => [
    action.rank,
    actionName(index, action.action_id, t),
    sectorLabel(index, action.action_id, t),
    t(reductionLevelLabelKey(reductionLevel(index, action.action_id))),
    percent(action.impact_score),
    percent(action.alignment_score),
    percent(action.feasibility_score),
    percent(action.final_score),
  ]);

  return { headers, rows };
}
