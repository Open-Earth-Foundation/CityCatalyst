import { db } from "@/models";

const MAX_PLAN_BYTES = 40 * 1024;
const PLAN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Plan sections returned as stored, in the order they are dropped when too large. */
const PLAN_SECTIONS = [
  "timeline",
  "costBudget",
  "milestones",
  "institutions",
  "merIndicators",
  "subactions",
  "mitigations",
  "adaptations",
  "sdgs",
] as const;

/** A plan catalog `sourceId` is `${plan.id}:${contentDigest}`. */
export function parseActionPlanSourceId(sourceId: string): string | null {
  const planId = sourceId.split(":")[0];
  return PLAN_ID_PATTERN.test(planId) ? planId : null;
}

function sizeOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/**
 * Persisted HIAP implementation plan for one action. Read-only. Sections that
 * would push the result over the tool size bound are listed in
 * `omitted_sections` instead of being returned.
 */
export async function buildHiapActionPlanContext(
  sourceId: string,
): Promise<Record<string, unknown> | null> {
  const planId = parseActionPlanSourceId(sourceId);
  if (!planId) return null;
  const plan = await db.models.ActionPlan.findByPk(planId);
  if (!plan) return null;

  const data: Record<string, unknown> = {
    status: "available",
    action_name: plan.actionName,
    language: plan.language,
    city_name: plan.cityName ?? null,
    updated_at: plan.lastUpdated?.toISOString() ?? null,
    action_description: plan.actionDescription ?? null,
    city_description: plan.cityDescription ?? null,
    national_strategy_explanation: plan.nationalStrategyExplanation ?? null,
  };
  const omitted: string[] = [];
  let used = sizeOf(data);
  for (const section of PLAN_SECTIONS) {
    const value = plan[section] ?? null;
    const size = sizeOf(value);
    if (used + size > MAX_PLAN_BYTES) {
      omitted.push(section);
      continue;
    }
    data[section] = value;
    used += size;
  }
  data.truncated = omitted.length > 0;
  data.omitted_sections = omitted;
  return data;
}
