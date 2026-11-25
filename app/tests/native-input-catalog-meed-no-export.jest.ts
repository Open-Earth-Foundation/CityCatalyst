import { describe, expect, it } from "@jest/globals";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { getNativeInputCapabilityDefinition } from "@/backend/agentic/native-input-catalog/registry";

// CC-1060 PR 2 (legal constraint from Product): HIAP-MEED inventory data must
// not be public or downloadable. Clima may interpret it in chat only.
// The public-inventory half is covered in native-input-catalog-city-project-access.

const MEED_ROWS = [
  {
    owningModule: "hiap_meed",
    kind: "hiap_meed_ranking",
    sourceType: "hiap_meed_ranking",
  },
  {
    owningModule: "hiap_meed",
    kind: "hiap_meed_output_plan",
    sourceType: "hiap_meed_output_plan",
  },
];

function listPaths(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const full = path.join(root, name);
    return statSync(full).isDirectory() ? [full, ...listPaths(full)] : [full];
  });
}

describe("HIAP-MEED data has no export or download path", () => {
  it.each(MEED_ROWS)(
    "exposes $kind only as a read-only context query",
    (row) => {
      const definition = getNativeInputCapabilityDefinition(row)!;
      expect(definition.operationType).toBe("query");
      expect(definition.transport.type).toBe("internal_ca_route");
      for (const id of definition.capabilityIds) {
        expect(id).toMatch(/^hiap_meed\.(ranking|output_plan)\.context$/);
        expect(id).not.toMatch(/export|download|file|csv|xlsx|pdf|docx/i);
      }
    },
  );

  it("registers no capability for downloads beyond the two context reads", () => {
    const ids = MEED_ROWS.flatMap(
      (row) => getNativeInputCapabilityDefinition(row)!.capabilityIds,
    );
    expect([...ids].sort()).toEqual([
      "hiap_meed.output_plan.context",
      "hiap_meed.ranking.context",
    ]);
  });

  it("has no Clima-facing route that exports or downloads MEED data", () => {
    const caRoot = path.join(
      process.cwd(),
      "src",
      "app",
      "api",
      "v1",
      "internal",
      "ca",
    );
    const offenders = listPaths(caRoot)
      .map((full) => path.relative(caRoot, full).replace(/\\/g, "/"))
      .filter((relative) => /meed/i.test(relative))
      .filter((relative) =>
        /export|download|file|csv|xlsx|pdf|docx/i.test(relative),
      );
    expect(offenders).toEqual([]);
  });
});
