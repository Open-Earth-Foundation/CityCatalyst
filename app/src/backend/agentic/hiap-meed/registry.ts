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

export const hiapMeedContextOutputSchema = z.object({
  action: z.enum([
    HIAP_MEED_RANKING_CONTEXT_CAPABILITY,
    HIAP_MEED_OUTPUT_PLAN_CONTEXT_CAPABILITY,
  ]),
  success: z.literal(true),
  data: z.record(z.string(), z.unknown()),
});
