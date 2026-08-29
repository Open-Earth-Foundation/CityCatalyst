import { describe, expect, it, jest } from "@jest/globals";

import {
  discoverNativeInputs,
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
});
