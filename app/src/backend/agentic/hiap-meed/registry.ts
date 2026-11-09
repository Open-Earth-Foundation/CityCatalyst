import { z } from "zod";

import { LANGUAGES } from "@/util/types";

export const HIAP_MEED_RANKING_CONTEXT_CAPABILITY =
  "hiap_meed.ranking.context" as const;
export const HIAP_MEED_OUTPUT_PLAN_CONTEXT_CAPABILITY =
  "hiap_meed.output_plan.context" as const;

/** Scope and language accepted by both HIAP-MEED catalog reads. */
export const hiapMeedContextInputSchema = z.object({
  city_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
  language: z.nativeEnum(LANGUAGES).default(LANGUAGES.en),
});

/** Largest page of ranked actions one ranking read may return. */
export const MEED_MAX_PAGE_SIZE = 50;
/** Page size when the caller sends no `limit`. */
export const MEED_DEFAULT_PAGE_SIZE = 25;

/** Chapter keys of a stored MEED output plan (hiap-meed `ChapterKey`). */
export const MEED_OUTPUT_PLAN_CHAPTER_KEYS = [
  "snapshot",
  "the_action",
  "action_impact",
  "city_fit",
  "policy_backing",
  "legal_mandate_delivery",
  "financing_precedents_pathway",
  "sources_assumptions",
] as const;

export const hiapMeedRankingInputSchema = hiapMeedContextInputSchema.extend({
  limit: z.number().int().min(1).max(MEED_MAX_PAGE_SIZE).optional(),
  offset: z.number().int().min(0).max(1000).optional(),
});

export const hiapMeedOutputPlanInputSchema = hiapMeedContextInputSchema.extend({
  chapters: z.array(z.enum(MEED_OUTPUT_PLAN_CHAPTER_KEYS)).max(8).optional(),
});

export const hiapMeedContextOutputSchema = z.object({
  action: z.enum([
    HIAP_MEED_RANKING_CONTEXT_CAPABILITY,
    HIAP_MEED_OUTPUT_PLAN_CONTEXT_CAPABILITY,
  ]),
  success: z.literal(true),
  data: z.record(z.string(), z.unknown()),
});
