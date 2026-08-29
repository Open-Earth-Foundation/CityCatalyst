import { describe, expect, it } from "@jest/globals";

import {
  getNativeInputCapabilityDefinition,
  projectNativeInputDiscoveryEntry,
} from "@/backend/agentic/native-input-catalog/registry";

describe("NativeInputCatalog capability registry", () => {
  it("resolves only the exact supported GHGI inventory tuple", () => {
    const definition = getNativeInputCapabilityDefinition({
      owningModule: "ghgi",
      kind: "inventory_import",
      sourceType: "inventory",
    });

    expect(definition).toMatchObject({
      module: "ghgi",
      operationType: "query",
      requiredResourceScope: ["user", "city", "inventory"],
      transport: {
        type: "internal_ca_route",
        route: "/api/v1/internal/ca/capabilities/native-inputs/read",
      },
    });
    expect(definition?.capabilityIds).toEqual([
      "ghgi.inventory.status_overview",
      "ghgi.inventory.emissions_context",
    ]);
  });

  it("returns no definition for an unknown or unsupported tuple", () => {
    expect(
      getNativeInputCapabilityDefinition({
        owningModule: "cnb",
        kind: "cnb_upload",
        sourceType: "cnb_upload",
      }),
    ).toBeNull();

    expect(
      getNativeInputCapabilityDefinition({
        owningModule: "ghgi",
        kind: "inventory_import",
        sourceType: "route-from-request",
      }),
    ).toBeNull();
  });

  it("projects only safe selection metadata and never exposes the source pointer", () => {
    const projected = projectNativeInputDiscoveryEntry(
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        kind: "inventory_import",
        owningModule: "ghgi",
        sourceType: "inventory",
        sourceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        inventoryId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        labels: {
          display_name: "2024 inventory",
          s3_key: "private/raw/inventory.csv",
          bearer_token: "must-not-cross-boundary",
        },
      },
      ["ghgi.inventory.status_overview"],
    );

    expect(projected).toEqual({
      catalog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      kind: "inventory_import",
      owning_module: "ghgi",
      source_type: "inventory",
      capability_ids: ["ghgi.inventory.status_overview"],
      labels: { display_name: "2024 inventory" },
    });
    expect(JSON.stringify(projected)).not.toContain("bbbbbbbb");
    expect(JSON.stringify(projected)).not.toContain("cccccccc");
    expect(JSON.stringify(projected)).not.toContain("dddddddd");
    expect(JSON.stringify(projected)).not.toContain("s3_key");
    expect(JSON.stringify(projected)).not.toContain("bearer_token");
  });

  it("preserves the projection invariant across untrusted label variants", () => {
    const labelVariants = [
      undefined,
      null,
      "",
      "   ",
      "safe display name",
      { nested: "must not be copied" },
      "s3://private/raw/catalog.json",
    ];

    for (const displayName of labelVariants) {
      const projected = projectNativeInputDiscoveryEntry(
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          kind: "inventory_import",
          owningModule: "ghgi",
          sourceType: "inventory",
          sourceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          labels: { display_name: displayName },
        },
        ["ghgi.inventory.status_overview"],
      );
      const serialized = JSON.stringify(projected);

      expect(serialized).not.toContain("bbbbbbbb");
      expect(serialized).not.toContain("private/raw");
      if (displayName === "safe display name") {
        expect(projected.labels?.display_name).toBe(displayName);
      } else {
        expect(projected.labels).toBeUndefined();
      }
    }
  });
});
