import { describe, expect, it, jest } from "@jest/globals";

import { createNativeInputSourceAdapter } from "@/backend/agentic/native-input-catalog/source-adapters";

const catalogEntry = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  kind: "inventory_import",
  owningModule: "ghgi",
  sourceType: "inventory",
  sourceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  inventoryId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

describe("NativeInputCatalog source adapters", () => {
  it("keeps discovery readiness probing separate from capability execution", async () => {
    const executeSelected = jest.fn(async () => ({ content: "must not load" }));
    const adapter = createNativeInputSourceAdapter({
      probeReadiness: jest.fn(async () => true),
      executeSelected,
    });

    await expect(adapter.probeReadiness(catalogEntry)).resolves.toBe(true);
    expect(executeSelected).not.toHaveBeenCalled();
  });

  it("executes exactly the selected bounded operation", async () => {
    const probeReadiness = jest.fn(async () => true);
    const executeSelected = jest.fn(async () => ({
      action: "ghgi.inventory.status_overview",
      success: true,
      data: { bounded: true },
    }));
    const adapter = createNativeInputSourceAdapter({
      probeReadiness,
      executeSelected,
    });

    await expect(
      adapter.executeSelected({
        entry: catalogEntry,
        capabilityId: "ghgi.inventory.status_overview",
        input: { city_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
      }),
    ).resolves.toEqual({
      action: "ghgi.inventory.status_overview",
      success: true,
      data: { bounded: true },
    });
    expect(executeSelected).toHaveBeenCalledTimes(1);
    expect(probeReadiness).not.toHaveBeenCalled();
  });

  it("does not expose a raw source or storage reference through the adapter contract", async () => {
    const adapter = createNativeInputSourceAdapter({
      probeReadiness: async () => true,
      executeSelected: async () => ({
        action: "ghgi.inventory.status_overview",
        success: true,
        data: { inventory: { year: 2024 } },
      }),
    });

    const result = await adapter.executeSelected({
      entry: {
        ...catalogEntry,
        sourceId: "private/raw/inventory.csv",
      },
      capabilityId: "ghgi.inventory.status_overview",
      input: { city_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    });

    expect(JSON.stringify(result)).not.toContain("private/raw");
  });
});
