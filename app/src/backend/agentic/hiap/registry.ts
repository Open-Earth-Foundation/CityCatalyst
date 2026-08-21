import { z } from "zod";

import { LANGUAGES } from "@/util/types";

export const HIAP_INVENTORY_CONTEXT_CAPABILITY =
  "hiap.inventory.context" as const;

export const hiapInventoryContextInputSchema = z.object({
  city_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
  language: z.nativeEnum(LANGUAGES).default(LANGUAGES.en),
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
