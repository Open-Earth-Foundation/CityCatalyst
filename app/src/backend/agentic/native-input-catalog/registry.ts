import { z } from "zod";

import {
  INVENTORY_EMISSIONS_CONTEXT_CAPABILITY,
  INVENTORY_STATUS_OVERVIEW_CAPABILITY,
  inventoryCapabilityInputSchema,
  inventoryCapabilityOutputSchema,
} from "@/backend/agentic/ghgi/inventory/registry";
import {
  HIAP_INVENTORY_CONTEXT_CAPABILITY,
  hiapInventoryContextInputSchema,
  hiapInventoryContextOutputSchema,
} from "@/backend/agentic/hiap/registry";

export const NATIVE_INPUT_CAPABILITY_READ_ROUTE =
  "/api/v1/internal/ca/capabilities/native-inputs/read" as const;

export const NATIVE_INPUT_CAPABILITY_IDS = [
  INVENTORY_STATUS_OVERVIEW_CAPABILITY,
  INVENTORY_EMISSIONS_CONTEXT_CAPABILITY,
  HIAP_INVENTORY_CONTEXT_CAPABILITY,
] as const;

export type NativeInputCapabilityId =
  (typeof NATIVE_INPUT_CAPABILITY_IDS)[number];

export type NativeInputCapabilityKey = {
  owningModule: string;
  kind: string;
  sourceType: string;
};

export type NativeInputCapabilityDefinition = {
  module: "ghgi" | "hiap";
  operationType: "query";
  requiredResourceScope: readonly ("user" | "city" | "inventory")[];
  capabilityIds: readonly NativeInputCapabilityId[];
  transport: {
    type: "internal_ca_route";
    route: typeof NATIVE_INPUT_CAPABILITY_READ_ROUTE;
  };
  schemas: {
    input: z.ZodTypeAny;
    output: z.ZodTypeAny;
  };
};

export type NativeInputDiscoveryCatalogEntry = {
  id: string;
  kind: string;
  owningModule: string;
  sourceType: string;
  sourceId?: string | null;
  userId?: string | null;
  inventoryId?: string | null;
  cityId?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  labels?: Record<string, unknown> | null;
};

export type NativeInputDiscoveryEntry = {
  catalog_id: string;
  kind: string;
  owning_module: string;
  source_type: string;
  capability_ids: readonly NativeInputCapabilityId[];
  labels?: { display_name: string };
};

const GHGI_INVENTORY_DEFINITION: NativeInputCapabilityDefinition = {
  module: "ghgi",
  operationType: "query",
  requiredResourceScope: ["user", "city", "inventory"],
  capabilityIds: [
    INVENTORY_STATUS_OVERVIEW_CAPABILITY,
    INVENTORY_EMISSIONS_CONTEXT_CAPABILITY,
  ],
  transport: {
    type: "internal_ca_route",
    route: NATIVE_INPUT_CAPABILITY_READ_ROUTE,
  },
  schemas: {
    input: inventoryCapabilityInputSchema,
    output: inventoryCapabilityOutputSchema,
  },
};

const HIAP_INVENTORY_DEFINITION: NativeInputCapabilityDefinition = {
  module: "hiap",
  operationType: "query",
  requiredResourceScope: ["user", "city", "inventory"],
  capabilityIds: [HIAP_INVENTORY_CONTEXT_CAPABILITY],
  transport: {
    type: "internal_ca_route",
    route: NATIVE_INPUT_CAPABILITY_READ_ROUTE,
  },
  schemas: {
    input: hiapInventoryContextInputSchema,
    output: hiapInventoryContextOutputSchema,
  },
};

const nativeInputCapabilityRegistry: Record<
  string,
  NativeInputCapabilityDefinition
> = {
  "ghgi|inventory_import|inventory": GHGI_INVENTORY_DEFINITION,
  "hiap|hiap_ranking|hiap_ranking": HIAP_INVENTORY_DEFINITION,
  "hiap|hiap_selection|hiap_ranked_selection": HIAP_INVENTORY_DEFINITION,
  "hiap|hiap_selection|hiap_unranked_selection": HIAP_INVENTORY_DEFINITION,
  "hiap|hiap_action_plan|action_plan": HIAP_INVENTORY_DEFINITION,
};

function capabilityKey(key: NativeInputCapabilityKey): string {
  return `${key.owningModule}|${key.kind}|${key.sourceType}`;
}

/** Resolve only an exact, Core-owned catalog identity tuple. */
export function getNativeInputCapabilityDefinition(
  key: NativeInputCapabilityKey,
): NativeInputCapabilityDefinition | null {
  return nativeInputCapabilityRegistry[capabilityKey(key)] ?? null;
}

/**
 * Project a catalog row into the smallest safe selection envelope. Source and
 * scope pointers are intentionally not part of this response.
 */
export function projectNativeInputDiscoveryEntry(
  entry: NativeInputDiscoveryCatalogEntry,
  capabilityIds: readonly NativeInputCapabilityId[],
): NativeInputDiscoveryEntry {
  const displayName = entry.labels?.display_name;
  const projected: NativeInputDiscoveryEntry = {
    catalog_id: entry.id,
    kind: entry.kind,
    owning_module: entry.owningModule,
    source_type: entry.sourceType,
    capability_ids: [...capabilityIds],
  };

  if (isSafeDisplayName(displayName)) {
    projected.labels = { display_name: displayName };
  }

  return projected;
}

function isSafeDisplayName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 200 &&
    !/[\r\n\u0000-\u001f]/.test(value) &&
    !/(?:s3:\/\/|amazonaws\.com|private\/raw|bearer\s|access[_-]?key|secret|token|signed[_-]?url)/i.test(
      value,
    )
  );
}
