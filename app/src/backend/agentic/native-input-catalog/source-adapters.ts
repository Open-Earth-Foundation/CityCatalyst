import { db } from "@/models";
import {
  buildInventoryEmissionsContext,
  buildInventoryStatusOverview,
} from "@/backend/agentic/ghgi/inventory/context";
import {
  INVENTORY_EMISSIONS_CONTEXT_CAPABILITY,
  INVENTORY_STATUS_OVERVIEW_CAPABILITY,
} from "@/backend/agentic/ghgi/inventory/registry";
import { buildHiapInventoryContext } from "@/backend/agentic/hiap/context";
import {
  HIAP_INVENTORY_CONTEXT_CAPABILITY,
  hiapInventoryContextInputSchema,
} from "@/backend/agentic/hiap/registry";
import {
  getNativeInputCapabilityDefinition,
  type NativeInputCapabilityId,
  type NativeInputDiscoveryCatalogEntry,
} from "@/backend/agentic/native-input-catalog/registry";
import { LANGUAGES } from "@/util/types";

export type NativeInputSelectedExecution = {
  entry: NativeInputDiscoveryCatalogEntry;
  capabilityId: NativeInputCapabilityId;
  input: unknown;
};

export type NativeInputSourceAdapter = {
  /** A bounded, non-content eligibility check used only during discovery. */
  probeReadiness: (entry: NativeInputDiscoveryCatalogEntry) => Promise<boolean>;
  /** Execute one already-selected capability through its module boundary. */
  executeSelected: (request: NativeInputSelectedExecution) => Promise<unknown>;
};

export type NativeInputSourceAdapterDependencies = {
  probeReadiness: NativeInputSourceAdapter["probeReadiness"];
  executeSelected: NativeInputSourceAdapter["executeSelected"];
};

/**
 * Build an adapter from independently injectable probe and execution seams.
 * Keeping these functions separate prevents discovery from accidentally
 * becoming a source-content read and makes selected-only execution testable.
 */
export function createNativeInputSourceAdapter(
  dependencies: NativeInputSourceAdapterDependencies,
): NativeInputSourceAdapter {
  return {
    probeReadiness: dependencies.probeReadiness,
    executeSelected: dependencies.executeSelected,
  };
}

async function inventoryExists(inventoryId: string): Promise<boolean> {
  const inventory = await db.models.Inventory.findByPk(inventoryId, {
    attributes: ["inventoryId", "cityId"],
  });
  return Boolean(inventory);
}

const ghgiInventoryAdapter = createNativeInputSourceAdapter({
  async probeReadiness(entry) {
    if (
      entry.owningModule !== "ghgi" ||
      entry.kind !== "inventory_import" ||
      entry.sourceType !== "inventory" ||
      !entry.sourceId
    ) {
      return false;
    }
    return inventoryExists(entry.sourceId);
  },
  async executeSelected({ entry, capabilityId, input: _input }) {
    if (!entry.sourceId) return null;
    const inventory = await db.models.Inventory.findByPk(entry.sourceId);
    if (!inventory) return null;

    if (capabilityId === INVENTORY_STATUS_OVERVIEW_CAPABILITY) {
      return buildInventoryStatusOverview(inventory);
    }
    if (capabilityId === INVENTORY_EMISSIONS_CONTEXT_CAPABILITY) {
      return buildInventoryEmissionsContext(inventory);
    }
    return null;
  },
});

const hiapInventoryAdapter = createNativeInputSourceAdapter({
  async probeReadiness(entry) {
    if (
      entry.owningModule !== "hiap" ||
      !entry.inventoryId ||
      !getNativeInputCapabilityDefinition(entry)
    ) {
      return false;
    }
    return inventoryExists(entry.inventoryId);
  },
  async executeSelected({ entry, capabilityId, input }) {
    if (
      capabilityId !== HIAP_INVENTORY_CONTEXT_CAPABILITY ||
      !entry.inventoryId
    ) {
      return null;
    }
    const parsed = hiapInventoryContextInputSchema.parse(input);
    return buildHiapInventoryContext(
      entry.inventoryId,
      parsed.language ?? LANGUAGES.en,
    );
  },
});

function adapterKey(entry: NativeInputDiscoveryCatalogEntry): string {
  return `${entry.owningModule}|${entry.kind}|${entry.sourceType}`;
}

const nativeInputSourceAdapters: Record<string, NativeInputSourceAdapter> = {
  "ghgi|inventory_import|inventory": ghgiInventoryAdapter,
  "hiap|hiap_ranking|hiap_ranking": hiapInventoryAdapter,
  "hiap|hiap_selection|hiap_ranked_selection": hiapInventoryAdapter,
  "hiap|hiap_selection|hiap_unranked_selection": hiapInventoryAdapter,
  "hiap|hiap_action_plan|action_plan": hiapInventoryAdapter,
};

export function getNativeInputSourceAdapter(
  entry: NativeInputDiscoveryCatalogEntry,
): NativeInputSourceAdapter | null {
  return nativeInputSourceAdapters[adapterKey(entry)] ?? null;
}
