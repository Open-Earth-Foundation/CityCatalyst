import { describe, expect, it, jest } from "@jest/globals";

import {
  authorizeCatalogScope,
  discoverNativeInputs,
  readNativeInputCapability,
  type NativeInputDiscoveryRequest,
  type NativeInputCapabilityServiceDependencies,
} from "@/backend/NativeInputCatalogCapabilityService";
import type { AppSession } from "@/lib/auth";
import { Roles } from "@/util/types";

const session: AppSession = {
  user: { id: "11111111-1111-4111-8111-111111111111", role: Roles.User },
  expires: "1h",
};

const authorizedEntry = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  kind: "inventory_import",
  owningModule: "ghgi",
  sourceType: "inventory",
  sourceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  inventoryId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  userId: session.user.id,
  cityId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  labels: { display_name: "2024 inventory", private_note: "hidden" },
  availability: "active" as const,
};

function dependencies(
  entries: (typeof authorizedEntry)[],
  overrides: Partial<NativeInputCapabilityServiceDependencies> = {},
): NativeInputCapabilityServiceDependencies {
  return {
    findActiveCatalogEntries: jest.fn(async () => entries),
    authorizeCatalogScope: jest.fn(async () => true),
    getSourceAdapter: jest.fn(() => ({
      probeReadiness: jest.fn(async () => true),
      executeSelected: jest.fn(async () => ({ content: "must not run" })),
    })),
    ...overrides,
  };
}

function readDependencies(
  adapter: {
    probeReadiness: jest.Mock;
    executeSelected: jest.Mock;
  },
  overrides: Partial<NativeInputCapabilityServiceDependencies> = {},
): NativeInputCapabilityServiceDependencies {
  return dependencies([authorizedEntry], {
    findCatalogEntryById: jest.fn(async () => authorizedEntry),
    getSourceAdapter: jest.fn(() => adapter),
    ...overrides,
  });
}

describe("NativeInputCatalog capability service", () => {
  it("returns only safe metadata for an authorized readiness-positive entry", async () => {
    const deps = dependencies([authorizedEntry]);
    const response = await discoverNativeInputs(
      { userId: session.user.id, cityId: authorizedEntry.cityId },
      session,
      deps,
    );

    expect(response).toEqual([
      {
        catalog_id: authorizedEntry.id,
        kind: "inventory_import",
        owning_module: "ghgi",
        source_type: "inventory",
        capability_ids: [
          "ghgi.inventory.status_overview",
          "ghgi.inventory.emissions_context",
        ],
        labels: { display_name: "2024 inventory" },
      },
    ]);
    expect(JSON.stringify(response)).not.toContain(authorizedEntry.sourceId);
    expect(JSON.stringify(response)).not.toContain("private_note");
    expect(deps.getSourceAdapter).toHaveBeenCalledTimes(1);
    expect(
      (
        deps.getSourceAdapter.mock.results[0]?.value as {
          probeReadiness: jest.Mock;
          executeSelected: jest.Mock;
        }
      ).executeSelected,
    ).not.toHaveBeenCalled();
  });

  it("omits unauthorized, removed, unmapped, and unready entries without reasons", async () => {
    const withdrawn = {
      ...authorizedEntry,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      availability: "withdrawn" as const,
      sourceId: "withdrawn-source-must-not-leak",
    };
    const unsupported = {
      ...authorizedEntry,
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      owningModule: "cnb",
      kind: "cnb_upload",
      sourceType: "cnb_upload",
      sourceId: "unsupported-source-must-not-leak",
    };
    const denied = {
      ...authorizedEntry,
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      sourceId: "denied-source-must-not-leak",
    };
    const probe = jest
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false);
    const deps = dependencies(
      [
        { ...authorizedEntry, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        withdrawn,
        unsupported,
        denied,
      ],
      {
        authorizeCatalogScope: jest.fn(
          async (_session, _request, entry) => entry !== denied,
        ),
        getSourceAdapter: jest.fn(() => ({
          probeReadiness: probe,
          executeSelected: jest.fn(async () => ({ content: "must not run" })),
        })),
      },
    );

    const response = await discoverNativeInputs({}, session, deps);

    expect(response).toEqual([]);
    expect(JSON.stringify(response)).not.toContain("withdrawn-source");
    expect(JSON.stringify(response)).not.toContain("unsupported-source");
    expect(JSON.stringify(response)).not.toContain("denied-source");
    expect(probe).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: denied.sourceId }),
    );
  });

  it("fails closed when a readiness dependency throws", async () => {
    const deps = dependencies([authorizedEntry], {
      getSourceAdapter: jest.fn(() => ({
        probeReadiness: jest.fn(async () => {
          throw new Error("source details must not escape");
        }),
        executeSelected: jest.fn(),
      })),
    });

    await expect(discoverNativeInputs({}, session, deps)).resolves.toEqual([]);
  });

  it.each(["organizationId", "projectId", "cityId", "inventoryId"] as const)(
    "omits an entry for a conflicting %s request scope",
    async (field) => {
      const scopedEntry = {
        ...authorizedEntry,
        [field]: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      };
      const request = {
        [field]: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      } as NativeInputDiscoveryRequest;

      await expect(
        authorizeCatalogScope(session, request, scopedEntry),
      ).resolves.toBe(false);
    },
  );

  it("revalidates and executes exactly the selected bounded capability", async () => {
    const adapter = {
      probeReadiness: jest.fn(async () => true),
      executeSelected: jest.fn(async () => ({
        completion: { filled: 10, required: 12 },
      })),
    };
    const deps = readDependencies(adapter);

    await expect(
      readNativeInputCapability(
        {
          userId: session.user.id,
          catalogId: authorizedEntry.id,
          capabilityId: "ghgi.inventory.status_overview",
          cityId: authorizedEntry.cityId,
          inventoryId: authorizedEntry.inventoryId,
          input: {
            city_id: authorizedEntry.cityId,
            inventory_id: authorizedEntry.inventoryId,
          },
        },
        session,
        deps,
      ),
    ).resolves.toEqual({
      action: "ghgi.inventory.status_overview",
      success: true,
      data: { completion: { filled: 10, required: 12 } },
    });
    expect(adapter.probeReadiness).toHaveBeenCalledTimes(1);
    expect(adapter.executeSelected).toHaveBeenCalledTimes(1);
    expect(adapter.executeSelected).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: authorizedEntry,
        capabilityId: "ghgi.inventory.status_overview",
      }),
    );
  });

  it.each([
    ["missing catalog", null],
    ["withdrawn catalog", { ...authorizedEntry, availability: "withdrawn" }],
    ["forged capability", { ...authorizedEntry, kind: "unsupported" }],
  ])("returns one stable error for %s selection", async (_label, entry) => {
    const adapter = {
      probeReadiness: jest.fn(async () => true),
      executeSelected: jest.fn(),
    };
    const deps = readDependencies(adapter, {
      findCatalogEntryById: jest.fn(async () => entry),
    });

    await expect(
      readNativeInputCapability(
        {
          catalogId: authorizedEntry.id,
          capabilityId: "ghgi.inventory.status_overview",
          input: {
            city_id: authorizedEntry.cityId,
            inventory_id: authorizedEntry.inventoryId,
          },
        },
        session,
        deps,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "capability_unavailable",
      message: "Requested capability is unavailable.",
    });
    expect(adapter.executeSelected).not.toHaveBeenCalled();
  });

  it("normalizes stale authorization and forbidden adapter data without disclosure", async () => {
    const adapter = {
      probeReadiness: jest.fn(async () => true),
      executeSelected: jest.fn(async () => ({
        s3_key: "private/raw/inventory.csv",
        signed_url: "https://storage.example/signed",
        bearer_token: "secret",
      })),
    };
    const deps = readDependencies(adapter, {
      authorizeCatalogScope: jest.fn(async () => false),
    });

    await expect(
      readNativeInputCapability(
        {
          catalogId: authorizedEntry.id,
          capabilityId: "ghgi.inventory.status_overview",
          input: {
            city_id: authorizedEntry.cityId,
            inventory_id: authorizedEntry.inventoryId,
          },
        },
        session,
        deps,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "capability_unavailable",
      message: "Requested capability is unavailable.",
    });
    expect(adapter.probeReadiness).not.toHaveBeenCalled();
    expect(adapter.executeSelected).not.toHaveBeenCalled();
  });

  it("redacts forbidden fields from a selected bounded result", async () => {
    const adapter = {
      probeReadiness: jest.fn(async () => true),
      executeSelected: jest.fn(async () => ({
        bounded: true,
        s3_key: "private/raw/inventory.csv",
        signed_url: "https://storage.example/signed",
        inventory_id: authorizedEntry.inventoryId,
      })),
    };
    const deps = readDependencies(adapter);

    await expect(
      readNativeInputCapability(
        {
          catalogId: authorizedEntry.id,
          capabilityId: "ghgi.inventory.status_overview",
          input: {
            city_id: authorizedEntry.cityId,
            inventory_id: authorizedEntry.inventoryId,
          },
        },
        session,
        deps,
      ),
    ).resolves.toEqual({
      action: "ghgi.inventory.status_overview",
      success: true,
      data: { bounded: true },
    });
  });

  it.each([
    [
      "readiness-negative",
      {
        getSourceAdapter: jest.fn(() => ({
          probeReadiness: jest.fn(async () => false),
          executeSelected: jest.fn(),
        })),
      },
    ],
    ["malformed input", undefined],
    ["missing adapter", { getSourceAdapter: jest.fn(() => null) }],
    [
      "upstream failure",
      {
        getSourceAdapter: jest.fn(() => ({
          probeReadiness: jest.fn(async () => true),
          executeSelected: jest.fn(async () => {
            throw new Error("private upstream details");
          }),
        })),
      },
    ],
  ] as const)(
    "normalizes %s selected-read failures",
    async (label, override) => {
      const adapter = {
        probeReadiness: jest.fn(async () => true),
        executeSelected: jest.fn(async () => ({ bounded: true })),
      };
      const input =
        label === "malformed input"
          ? {}
          : {
              city_id: authorizedEntry.cityId,
              inventory_id: authorizedEntry.inventoryId,
            };
      const deps = readDependencies(adapter, override ?? undefined);

      await expect(
        readNativeInputCapability(
          {
            catalogId: authorizedEntry.id,
            capabilityId: "ghgi.inventory.status_overview",
            input,
          },
          session,
          deps,
        ),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "capability_unavailable",
        message: "Requested capability is unavailable.",
      });
    },
  );

  it("rejects a selected result that exceeds the bounded response size", async () => {
    const adapter = {
      probeReadiness: jest.fn(async () => true),
      executeSelected: jest.fn(async () => ({
        oversized: "x".repeat(64 * 1024),
      })),
    };

    await expect(
      readNativeInputCapability(
        {
          catalogId: authorizedEntry.id,
          capabilityId: "ghgi.inventory.status_overview",
          input: {
            city_id: authorizedEntry.cityId,
            inventory_id: authorizedEntry.inventoryId,
          },
        },
        session,
        readDependencies(adapter),
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "capability_unavailable",
      message: "Requested capability is unavailable.",
    });
  });
});
