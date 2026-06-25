import { z } from "zod";

export const INVENTORY_STATUS_OVERVIEW_CAPABILITY =
  "ghgi.inventory.status_overview" as const;
export const INVENTORY_EMISSIONS_CONTEXT_CAPABILITY =
  "ghgi.inventory.emissions_context" as const;

export type InventoryCapabilityId =
  | typeof INVENTORY_STATUS_OVERVIEW_CAPABILITY
  | typeof INVENTORY_EMISSIONS_CONTEXT_CAPABILITY;

export type InventoryOperationType = "query";
export type InventoryResourceScope = "user" | "city" | "inventory";
export type InventoryTransportExposure = "internal_ca_route";
export type InventoryResultShape =
  | "inventory_status_overview"
  | "inventory_emissions_context";

export type InventoryCapabilityDefinition = {
  id: InventoryCapabilityId;
  module: "ghgi";
  operationType: InventoryOperationType;
  requiredResourceScope: readonly InventoryResourceScope[];
  requiresConfirmation: false;
  writesCommittedProductData: false;
  resultShape: InventoryResultShape;
  transportExposure: {
    type: InventoryTransportExposure;
    route: string;
  };
  schemas: {
    input: z.ZodTypeAny;
    output: z.ZodTypeAny;
  };
};

const recordSchema = z.record(z.string(), z.unknown());

export const inventoryCapabilityInputSchema = z.object({
  user_id: z.string().uuid(),
  city_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
});

export const inventoryCapabilityOutputSchema = z.object({
  action: z.enum([
    INVENTORY_STATUS_OVERVIEW_CAPABILITY,
    INVENTORY_EMISSIONS_CONTEXT_CAPABILITY,
  ]),
  success: z.literal(true),
  data: recordSchema,
});

export const inventoryCapabilityRegistry = {
  [INVENTORY_STATUS_OVERVIEW_CAPABILITY]: {
    id: INVENTORY_STATUS_OVERVIEW_CAPABILITY,
    module: "ghgi",
    operationType: "query",
    requiredResourceScope: ["user", "city", "inventory"],
    requiresConfirmation: false,
    writesCommittedProductData: false,
    resultShape: "inventory_status_overview",
    transportExposure: {
      type: "internal_ca_route",
      route: "/api/v1/internal/ca/capabilities/ghgi/inventory/status-overview",
    },
    schemas: {
      input: inventoryCapabilityInputSchema,
      output: inventoryCapabilityOutputSchema,
    },
  },
  [INVENTORY_EMISSIONS_CONTEXT_CAPABILITY]: {
    id: INVENTORY_EMISSIONS_CONTEXT_CAPABILITY,
    module: "ghgi",
    operationType: "query",
    requiredResourceScope: ["user", "city", "inventory"],
    requiresConfirmation: false,
    writesCommittedProductData: false,
    resultShape: "inventory_emissions_context",
    transportExposure: {
      type: "internal_ca_route",
      route:
        "/api/v1/internal/ca/capabilities/ghgi/inventory/emissions-context",
    },
    schemas: {
      input: inventoryCapabilityInputSchema,
      output: inventoryCapabilityOutputSchema,
    },
  },
} satisfies Record<InventoryCapabilityId, InventoryCapabilityDefinition>;

export function getInventoryCapabilityDefinition(
  capabilityId: InventoryCapabilityId,
): InventoryCapabilityDefinition {
  return inventoryCapabilityRegistry[capabilityId];
}
