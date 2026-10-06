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

    expect(response).toEqual({
      entries: [
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
      ],
    });
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

    expect(response).toEqual({ entries: [] });
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

    await expect(discoverNativeInputs({}, session, deps)).resolves.toEqual({
      entries: [],
    });
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

  it("discovers a later authorized entry hidden behind 100 inaccessible or incompatible rows and still reads it", async () => {
    const inaccessible = Array.from({ length: 80 }, (_, index) =>
      orderedEntry(index, {
        sourceId: `inaccessible-source-${index}`,
        labels: { display_name: `hidden ${index}` },
      }),
    );
    const incompatible = Array.from({ length: 21 }, (_, index) =>
      orderedEntry(80 + index, {
        owningModule: "cnb",
        kind: "cnb_upload",
        sourceType: "cnb_upload",
        sourceId: `incompatible-source-${index}`,
      }),
    );
    const laterAuthorized = orderedEntry(101, {
      sourceId: "later-authorized-source",
      labels: { display_name: "later authorized inventory" },
    });
    const deniedIds = new Set(inaccessible.map((entry) => entry.id));
    const catalogById = new Map(
      [...inaccessible, ...incompatible, laterAuthorized].map((entry) => [
        entry.id,
        entry,
      ]),
    );
    const adapter = {
      probeReadiness: jest.fn(async () => true),
      executeSelected: jest.fn(async () => ({
        completion: { filled: 4, required: 12 },
      })),
    };
    const deps = dependencies([...inaccessible, ...incompatible, laterAuthorized], {
      findActiveCatalogEntries: keysetFind([
        ...inaccessible,
        ...incompatible,
        laterAuthorized,
      ]),
      authorizeCatalogScope: jest.fn(
        async (_session, _request, entry) => !deniedIds.has(entry.id),
      ),
      findCatalogEntryById: jest.fn(async (catalogId: string) => {
        return catalogById.get(catalogId) ?? null;
      }),
      getSourceAdapter: jest.fn((entry) =>
        entry.owningModule === "cnb" ? null : adapter,
      ),
    });

    const page = (await discoverNativeInputs({}, session, deps)) as {
      entries: Array<{ catalog_id: string }>;
      continuationCursor?: string;
    };

    expect(page.entries.map((entry) => entry.catalog_id)).toEqual([
      laterAuthorized.id,
    ]);
    expect(page.continuationCursor).toBeUndefined();
    expect(JSON.stringify(page)).not.toContain("inaccessible-source");
    expect(JSON.stringify(page)).not.toContain("incompatible-source");
    for (const hidden of inaccessible) {
      expect(page.continuationCursor ?? "").not.toContain(hidden.id);
    }

    await expect(
      readNativeInputCapability(
        {
          catalogId: laterAuthorized.id,
          capabilityId: "ghgi.inventory.status_overview",
          cityId: laterAuthorized.cityId,
          inventoryId: laterAuthorized.inventoryId,
          input: {
            city_id: laterAuthorized.cityId,
            inventory_id: laterAuthorized.inventoryId,
          },
        },
        session,
        deps,
      ),
    ).resolves.toEqual({
      action: "ghgi.inventory.status_overview",
      success: true,
      data: { completion: { filled: 4, required: 12 } },
    });
  });

  it("bounds each discovery request and still reaches a later authorized entry by cursor", async () => {
    const inaccessible = Array.from({ length: 250 }, (_, index) =>
      orderedEntry(index, {
        sourceId: `budget-hidden-source-${index}`,
        labels: { display_name: `hidden ${index}` },
      }),
    );
    const laterAuthorized = orderedEntry(250, {
      sourceId: "budget-later-authorized-source",
      labels: { display_name: "later authorized after budget" },
    });
    const catalogById = new Map(
      [...inaccessible, laterAuthorized].map((entry) => [entry.id, entry]),
    );
    const adapter = {
      probeReadiness: jest.fn(async () => true),
      executeSelected: jest.fn(async () => ({ bounded: true })),
    };
    const findActiveCatalogEntries = keysetFind([
      ...inaccessible,
      laterAuthorized,
    ]);
    const deps = dependencies([...inaccessible, laterAuthorized], {
      findActiveCatalogEntries,
      authorizeCatalogScope: jest.fn(
        async (_session, _request, entry) => entry.id === laterAuthorized.id,
      ),
      findCatalogEntryById: jest.fn(async (catalogId: string) => {
        return catalogById.get(catalogId) ?? null;
      }),
      getSourceAdapter: jest.fn(() => adapter),
    });

    const firstPage = (await discoverNativeInputs({}, session, deps)) as {
      entries: Array<{ catalog_id: string }>;
      continuationCursor?: string;
    };
    const firstScanned = await scannedCandidateCount(findActiveCatalogEntries);

    expect(firstPage.entries).toEqual([]);
    expect(firstPage.continuationCursor).toEqual(expect.any(String));
    expect(firstScanned).toBe(200);
    expect(deps.authorizeCatalogScope).toHaveBeenCalledTimes(200);
    expect(JSON.stringify(firstPage)).not.toContain("budget-hidden-source");
    expect(JSON.stringify(firstPage)).not.toContain("budget-later-authorized");
    expect(firstPage.continuationCursor).not.toContain(laterAuthorized.id);

    findActiveCatalogEntries.mockClear();
    (deps.authorizeCatalogScope as jest.Mock).mockClear();

    const secondPage = (await discoverNativeInputs(
      { cursor: firstPage.continuationCursor } as NativeInputDiscoveryRequest,
      session,
      deps,
    )) as {
      entries: Array<{ catalog_id: string }>;
      continuationCursor?: string;
    };
    const secondScanned = await scannedCandidateCount(findActiveCatalogEntries);

    expect(secondScanned).toBeLessThanOrEqual(200);
    expect(secondPage.entries.map((entry) => entry.catalog_id)).toEqual([
      laterAuthorized.id,
    ]);
    expect(JSON.stringify(secondPage)).not.toContain("budget-hidden-source");

    await expect(
      readNativeInputCapability(
        {
          catalogId: laterAuthorized.id,
          capabilityId: "ghgi.inventory.status_overview",
          cityId: laterAuthorized.cityId,
          inventoryId: laterAuthorized.inventoryId,
          input: {
            city_id: laterAuthorized.cityId,
            inventory_id: laterAuthorized.inventoryId,
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

  it("returns the remaining authorized entry on the next page without duplicates or gaps", async () => {
    const authorized = Array.from({ length: 101 }, (_, index) =>
      orderedEntry(index, {
        sourceId: `authorized-source-${index}`,
        labels: { display_name: `inventory ${index}` },
      }),
    );
    const catalogById = new Map(authorized.map((entry) => [entry.id, entry]));
    const adapter = {
      probeReadiness: jest.fn(async () => true),
      executeSelected: jest.fn(async () => ({ bounded: true })),
    };
    const deps = dependencies(authorized, {
      findActiveCatalogEntries: keysetFind(authorized),
      findCatalogEntryById: jest.fn(async (catalogId: string) => {
        return catalogById.get(catalogId) ?? null;
      }),
      getSourceAdapter: jest.fn(() => adapter),
    });

    const firstPage = (await discoverNativeInputs({}, session, deps)) as {
      entries: Array<{ catalog_id: string }>;
      continuationCursor?: string;
    };
    const secondPage = (await discoverNativeInputs(
      { cursor: firstPage.continuationCursor } as NativeInputDiscoveryRequest,
      session,
      deps,
    )) as {
      entries: Array<{ catalog_id: string }>;
      continuationCursor?: string;
    };

    expect(firstPage.entries).toHaveLength(100);
    expect(firstPage.continuationCursor).toEqual(expect.any(String));
    expect(JSON.stringify(firstPage)).not.toMatch(/authorized-source-/);
    expect(secondPage.entries.map((entry) => entry.catalog_id)).toEqual([
      authorized[100].id,
    ]);
    expect(secondPage.continuationCursor).toBeUndefined();
    expect(
      firstPage.entries
        .map((entry) => entry.catalog_id)
        .concat(secondPage.entries.map((entry) => entry.catalog_id)),
    ).toEqual(authorized.map((entry) => entry.id));

    await expect(
      readNativeInputCapability(
        {
          catalogId: authorized[100].id,
          capabilityId: "ghgi.inventory.status_overview",
          cityId: authorized[100].cityId,
          inventoryId: authorized[100].inventoryId,
          input: {
            city_id: authorized[100].cityId,
            inventory_id: authorized[100].inventoryId,
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

  it("keeps a minted cursor valid after rotating CC_SERVICE_API_KEY", async () => {
    const originalServiceKey = process.env.CC_SERVICE_API_KEY;
    const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "stable-nextauth-secret";
    process.env.CC_SERVICE_API_KEY = "service-key-one";

    try {
      const authorized = Array.from({ length: 101 }, (_, index) =>
        orderedEntry(index),
      );
      const deps = dependencies(authorized, {
        findActiveCatalogEntries: keysetFind(authorized),
      });
      const firstPage = await discoverNativeInputs(
        { cityId: authorizedEntry.cityId },
        session,
        deps,
      );

      process.env.CC_SERVICE_API_KEY = "service-key-two";
      await expect(
        discoverNativeInputs(
          {
            cityId: authorizedEntry.cityId,
            cursor: firstPage.continuationCursor,
          },
          session,
          deps,
        ),
      ).resolves.toMatchObject({
        entries: [{ catalog_id: authorized[100].id }],
      });
    } finally {
      if (originalServiceKey === undefined) {
        delete process.env.CC_SERVICE_API_KEY;
      } else {
        process.env.CC_SERVICE_API_KEY = originalServiceKey;
      }
      if (originalNextAuthSecret === undefined) {
        delete process.env.NEXTAUTH_SECRET;
      } else {
        process.env.NEXTAUTH_SECRET = originalNextAuthSecret;
      }
    }
  });

  it("rejects a malformed or filter-mismatched cursor without catalog disclosure", async () => {
    const authorized = Array.from({ length: 101 }, (_, index) =>
      orderedEntry(index, {
        sourceId: `cursor-secret-source-${index}`,
      }),
    );
    const deps = dependencies(authorized, {
      findActiveCatalogEntries: keysetFind(authorized),
    });
    const firstPage = (await discoverNativeInputs(
      { cityId: authorizedEntry.cityId },
      session,
      deps,
    )) as { continuationCursor?: string; entries: Array<{ catalog_id: string }> };

    await expect(
      discoverNativeInputs({ cursor: "not-a-cursor" }, session, deps),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid discovery cursor.",
    });
    await expect(
      discoverNativeInputs(
        {
          cityId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          cursor: firstPage.continuationCursor,
        },
        session,
        deps,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid discovery cursor.",
    });
    expect(firstPage.continuationCursor).toEqual(expect.any(String));
    expect(JSON.stringify(firstPage)).not.toContain("cursor-secret-source");
    expect(firstPage.continuationCursor).not.toContain(authorized[0].id);
  });
});

function orderedEntry(
  index: number,
  overrides: Partial<typeof authorizedEntry> & { created?: Date } = {},
) {
  return {
    ...authorizedEntry,
    id: catalogId(index),
    created: new Date(Date.UTC(2024, 0, 1, 0, 0, index)),
    inventoryId: `bbbbbbbb-bbbb-4bbb-8bbb-${index.toString(16).padStart(12, "0")}`,
    ...overrides,
  };
}

function catalogId(index: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16).padStart(12, "0")}`;
}

async function scannedCandidateCount(
  findActiveCatalogEntries: ReturnType<typeof keysetFind>,
) {
  const batches = await Promise.all(
    findActiveCatalogEntries.mock.results.map((result) => result.value),
  );
  return batches.reduce((total, batch) => total + (batch?.length ?? 0), 0);
}

function keysetFind(entries: Array<typeof authorizedEntry & { created: Date }>) {
  const ordered = [...entries].sort((left, right) => {
    const createdDiff = left.created.getTime() - right.created.getTime();
    if (createdDiff !== 0) return createdDiff;
    return left.id.localeCompare(right.id);
  });

  return jest.fn(
    async (query?: { after?: { created: string; id: string }; limit?: number }) => {
      const limit = query?.limit ?? ordered.length;
      let start = 0;
      if (query?.after) {
        const afterTime = new Date(query.after.created).getTime();
        start = ordered.findIndex((entry) => {
          const created = entry.created.getTime();
          return (
            created > afterTime ||
            (created === afterTime && entry.id > query.after!.id)
          );
        });
        if (start < 0) return [];
      }
      return ordered.slice(start, start + limit);
    },
  );
}
