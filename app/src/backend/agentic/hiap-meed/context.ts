import { db } from "@/models";
import { hasChapters } from "@/backend/meed/meedOutputPlan";
import { MEED_DEFAULT_PAGE_SIZE } from "@/backend/agentic/hiap-meed/registry";
import { LANGUAGES } from "@/util/types";

const MAX_REMOVED_ACTIONS = 25;
const MAX_OUTPUT_PLAN_BYTES = 40 * 1024;
/** Ranked page and removed list stay together under the 64 KB tool result bound. */
const MAX_RANKED_PAGE_BYTES = 40 * 1024;
const MAX_REMOVED_BYTES = 12 * 1024;

type MeedRankingPage = { limit?: number; offset?: number };
type MeedOutputPlanOptions = { chapters?: readonly string[] };

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
 * Pick one language from a stored i18n value (`{ en: ..., pt: ... }`). Any
 * other value is returned as stored.
 */
function pickLanguage(value: unknown, language: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const byLanguage = value as Record<string, unknown>;
  return (
    byLanguage[language] ??
    byLanguage[LANGUAGES.en] ??
    Object.values(byLanguage)[0] ??
    null
  );
}

function chapterKey(chapter: unknown, fallback: string): string {
  const key = (chapter as { key?: unknown } | null)?.key;
  return typeof key === "string" ? key : fallback;
}

function localizeChapter(chapter: unknown, language: string): unknown {
  if (!chapter || typeof chapter !== "object" || Array.isArray(chapter)) {
    return chapter;
  }
  return Object.fromEntries(
    Object.entries(chapter as Record<string, unknown>).map(([name, value]) => [
      name,
      name === "key" ? value : pickLanguage(value, language),
    ]),
  );
}

/** Drop trailing items until the JSON fits; always keeps the first item. */
function fitToBytes<T>(items: T[], maxBytes: number): T[] {
  let fitted = items;
  while (
    fitted.length > 1 &&
    Buffer.byteLength(JSON.stringify(fitted), "utf8") > maxBytes
  ) {
    fitted = fitted.slice(0, -1);
  }
  return fitted;
}

/**
 * Compact persisted HIAP-MEED ranking, one page of ranked actions in rank
 * order plus the actions MEED removed. Read-only; never starts a ranking run.
 * `counts.total` is the full ranked list; `truncated` tells whether more pages
 * follow (read again with `offset` = `counts.offset` + `counts.returned`). A
 * page that would exceed the size bound is cut, so `counts.returned` can be
 * below the requested `limit`.
 */
export async function buildMeedRankingContext(
  rankingId: string,
  language: string,
  page: MeedRankingPage = {},
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

  const offset = page.offset ?? 0;
  const rankedActions = fitToBytes(
    rankedRows
      .slice(offset, offset + (page.limit ?? MEED_DEFAULT_PAGE_SIZE))
      .map((row) => ({
        rank: row.rank ?? null,
        action_id: row.actionId ?? null,
        final_score: row.finalScore ?? null,
        impact_score: row.impactScore ?? null,
        alignment_score: row.alignmentScore ?? null,
        feasibility_score: row.feasibilityScore ?? null,
        explanation: localizedExplanation(row.explanations, language),
      })),
    MAX_RANKED_PAGE_BYTES,
  );
  const removedActions = fitToBytes(
    removedRows.slice(0, MAX_REMOVED_ACTIONS).map((row) => ({
      action_id: row.actionId ?? null,
      action_name: row.actionName ?? null,
      removal_reason: row.removalReason ?? null,
    })),
    MAX_REMOVED_BYTES,
  );

  return {
    status: "available",
    updated_at: ranking.created?.toISOString() ?? null,
    counts: {
      ranked: rankedRows.length,
      total: rankedRows.length,
      removed: removedRows.length,
      returned: rankedActions.length,
      offset,
    },
    truncated: offset + rankedActions.length < rankedRows.length,
    ranked_actions: rankedActions,
    removed_actions: removedActions,
  };
}

/**
 * Persisted HIAP-MEED output plan for one action, in one language. `chapters`
 * selects chapters by key (for example `legal_mandate_delivery`,
 * `financing_precedents_pathway`, `city_fit`); `chapter_keys` always lists the
 * keys the plan holds. A plan over the size bound returns only its keys.
 */
export async function buildMeedOutputPlanContext(
  reportId: string,
  language: string = LANGUAGES.en,
  options: MeedOutputPlanOptions = {},
): Promise<Record<string, unknown> | null> {
  const report = await db.models.MeedActionReport.findByPk(reportId);
  if (!report || !hasChapters(report.chapters)) return null;

  const stored = report.chapters as unknown;
  const entries: [string, unknown][] = Array.isArray(stored)
    ? stored.map((chapter, index) => [
        chapterKey(chapter, String(index)),
        chapter,
      ])
    : Object.entries(stored as Record<string, unknown>);
  const chapterKeys = entries.map(([key]) => key);
  const requested = options.chapters?.length ? new Set(options.chapters) : null;
  const selected = entries.filter(([key]) => !requested || requested.has(key));
  const localized = selected.map(
    ([key, chapter]) => [key, localizeChapter(chapter, language)] as const,
  );
  const fits =
    Buffer.byteLength(JSON.stringify(localized), "utf8") <=
    MAX_OUTPUT_PLAN_BYTES;

  return {
    status: "available",
    action_id: report.actionId ?? null,
    languages: report.languages ?? [],
    updated_at: report.created?.toISOString() ?? null,
    truncated: !fits,
    chapter_keys: chapterKeys,
    missing_chapters: requested
      ? [...requested].filter((key) => !chapterKeys.includes(key))
      : [],
    // Array plans stay arrays so each chapter keeps its `key`.
    chapters: fits
      ? Array.isArray(stored)
        ? localized.map(([, chapter]) => chapter)
        : Object.fromEntries(localized)
      : null,
  };
}
