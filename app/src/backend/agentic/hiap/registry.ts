import { z } from "zod";

import { ACTION_TYPES, LANGUAGES } from "@/util/types";

export const HIAP_INVENTORY_CONTEXT_CAPABILITY =
  "hiap.inventory.context" as const;
export const HIAP_ACTION_PLAN_CONTEXT_CAPABILITY =
  "hiap.action_plan.context" as const;

/** Largest page of actions one call may return per action type. */
export const HIAP_MAX_ACTIONS_LIMIT = 50;
/** Page size of a ranked listing when the caller sends no `limit`. */
export const HIAP_DEFAULT_PAGE_SIZE = 25;

/**
 * `scope`, `type` and `limit` are optional. Without them the output is the
 * original view: the city selection when one exists, else the ranked fallback.
 */
export const hiapInventoryContextInputSchema = z.object({
  city_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
  language: z.nativeEnum(LANGUAGES).default(LANGUAGES.en),
  scope: z.enum(["selected", "ranked"]).optional(),
  type: z.nativeEnum(ACTION_TYPES).optional(),
  limit: z.number().int().min(1).max(HIAP_MAX_ACTIONS_LIMIT).optional(),
  offset: z.number().int().min(0).max(1000).optional(),
});

export const hiapActionPlanContextInputSchema = z.object({
  city_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
});

export const hiapActionPlanContextOutputSchema = z.object({
  action: z.literal(HIAP_ACTION_PLAN_CONTEXT_CAPABILITY),
  success: z.literal(true),
  data: z.record(z.string(), z.unknown()),
});

export const hiapInventoryContextOutputSchema = z.object({
  action: z.literal(HIAP_INVENTORY_CONTEXT_CAPABILITY),
  success: z.literal(true),
  data: z.record(z.string(), z.unknown()),
});

export const hiapCapabilityRegistry = {
  [HIAP_INVENTORY_CONTEXT_CAPABILITY]: {
    id: HIAP_INVENTORY_CONTEXT_CAPABILITY,
    module: "hiap",
    operationType: "query",
    requiredResourceScope: ["user", "city", "inventory"],
    requiresConfirmation: false,
    writesCommittedProductData: false,
    resultShape: "hiap_inventory_context",
    transportExposure: {
      type: "internal_ca_route",
      route: "/api/v1/internal/ca/capabilities/hiap/inventory/context",
    },
    schemas: {
      input: hiapInventoryContextInputSchema,
      output: hiapInventoryContextOutputSchema,
    },
  },
} as const;
