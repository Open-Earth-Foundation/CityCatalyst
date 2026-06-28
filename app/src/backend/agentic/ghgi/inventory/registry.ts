import { z } from "zod";

export const INVENTORY_STATUS_OVERVIEW_CAPABILITY =
  "ghgi.inventory.status_overview" as const;
export const INVENTORY_EMISSIONS_CONTEXT_CAPABILITY =
  "ghgi.inventory.emissions_context" as const;
export const INVENTORY_LIST_ACCESSIBLE_CAPABILITY =
  "ghgi.inventory.list_accessible" as const;

export type InventoryCapabilityId =
  | typeof INVENTORY_LIST_ACCESSIBLE_CAPABILITY
  | typeof INVENTORY_STATUS_OVERVIEW_CAPABILITY
  | typeof INVENTORY_EMISSIONS_CONTEXT_CAPABILITY;

export type InventoryOperationType = "query";
export type InventoryResourceScope = "user" | "city" | "inventory";
export type InventoryTransportExposure = "internal_ca_route";
export type InventoryResultShape =
  | "inventory_list_accessible"
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

export const inventoryListAccessibleInputSchema = z.object({
  user_id: z.string().uuid(),
  city_query: z.string().trim().min(1).optional(),
  year: z.number().int().optional(),
  include_all_city_years: z.boolean().optional().default(false),
});

export const inventoryCapabilityOutputSchema = z.object({
  action: z.enum([
    INVENTORY_LIST_ACCESSIBLE_CAPABILITY,
    INVENTORY_STATUS_OVERVIEW_CAPABILITY,
    INVENTORY_EMISSIONS_CONTEXT_CAPABILITY,
  ]),
  success: z.literal(true),
  data: recordSchema,
});

export const inventoryCapabilityRegistry = {
  [INVENTORY_LIST_ACCESSIBLE_CAPABILITY]: {
    id: INVENTORY_LIST_ACCESSIBLE_CAPABILITY,
    module: "ghgi",
    operationType: "query",
    requiredResourceScope: ["user"],
    requiresConfirmation: false,
    writesCommittedProductData: false,
    resultShape: "inventory_list_accessible",
    transportExposure: {
      type: "internal_ca_route",
      route: "/api/v1/internal/ca/capabilities/ghgi/inventory/list-accessible",
    },
    schemas: {
      input: inventoryListAccessibleInputSchema,
      output: inventoryCapabilityOutputSchema,
    },
  },
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
