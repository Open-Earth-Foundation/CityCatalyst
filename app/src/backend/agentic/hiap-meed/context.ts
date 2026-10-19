import { db } from "@/models";
import { hasChapters } from "@/backend/meed/meedOutputPlan";
import { LANGUAGES } from "@/util/types";

const MAX_RANKED_ACTIONS = 25;
const MAX_REMOVED_ACTIONS = 25;
const MAX_OUTPUT_PLAN_BYTES = 40 * 1024;

function localizedExplanation(
  explanations: Record<string, string> | undefined,
  language: string,
): string | null {
  if (!explanations) return null;
  return (
    explanations[language] ??
    explanations[LANGUAGES.en] ??
    Object.values(explanations)[0] ??
    null
  );
}

/**
 * Compact persisted HIAP-MEED ranking: top ranked actions in rank order plus
 * the actions MEED removed. Read-only; never starts a ranking run.
 */
export async function buildMeedRankingContext(
  rankingId: string,
  language: string,
): Promise<Record<string, unknown> | null> {
  const ranking = await db.models.MeedRanking.findByPk(rankingId);
  if (!ranking || ranking.status !== "completed") return null;

  const rankedRows = await db.models.MeedActionRanked.findAll({
    where: { rankingId },
    order: [["rank", "ASC"]],
  });
  const removedRows = await db.models.MeedActionRemoved.findAll({
    where: { rankingId },
  });

  return {
    status: "available",
    updated_at: ranking.created?.toISOString() ?? null,
    counts: {
      ranked: rankedRows.length,
      removed: removedRows.length,
      returned: Math.min(rankedRows.length, MAX_RANKED_ACTIONS),
    },
    ranked_actions: rankedRows.slice(0, MAX_RANKED_ACTIONS).map((row) => ({
      rank: row.rank ?? null,
      action_id: row.actionId ?? null,
      final_score: row.finalScore ?? null,
      impact_score: row.impactScore ?? null,
      alignment_score: row.alignmentScore ?? null,
      feasibility_score: row.feasibilityScore ?? null,
      explanation: localizedExplanation(row.explanations, language),
    })),
    removed_actions: removedRows.slice(0, MAX_REMOVED_ACTIONS).map((row) => ({
      action_id: row.actionId ?? null,
      action_name: row.actionName ?? null,
      removal_reason: row.removalReason ?? null,
    })),
  };
}

/**
 * Persisted HIAP-MEED output plan for one action. Large plans return only
 * their chapter keys so the response stays inside the tool size bound.
 */
export async function buildMeedOutputPlanContext(
  reportId: string,
): Promise<Record<string, unknown> | null> {
  const report = await db.models.MeedActionReport.findByPk(reportId);
  if (!report || !hasChapters(report.chapters)) return null;

  const chapters = report.chapters as Record<string, unknown>;
  const fits =
    Buffer.byteLength(JSON.stringify(chapters), "utf8") <=
    MAX_OUTPUT_PLAN_BYTES;

  return {
    status: "available",
    action_id: report.actionId ?? null,
    languages: report.languages ?? [],
    updated_at: report.created?.toISOString() ?? null,
    truncated: !fits,
    chapters: fits ? chapters : null,
    chapter_keys: fits ? undefined : Object.keys(chapters),
  };
}
