import { describe, expect, it } from "@jest/globals";
import { groupInventoryHistory } from "@/components/GHGI/inventory-versions/history-helpers";
import type { VersionHistoryEntry } from "@/util/types";

const author = { name: "Test User", userId: "user-1" };

// entries are newest first, like the version-history API returns them
function entry(
  versionId: string,
  created: string,
  label?: string,
): VersionHistoryEntry {
  return {
    version: {
      versionId,
      created: new Date(created),
      label,
      author,
      previousVersion: null,
    },
  };
}

function groupIds(groups: VersionHistoryEntry[][]) {
  return groups.map((group) => group.map((item) => item.version.versionId));
}

describe("groupInventoryHistory", () => {
  it("groups changes by the same author within an hour", () => {
    const groups = groupInventoryHistory([
      entry("b", "2026-01-01T10:10:00Z"),
      entry("a", "2026-01-01T10:00:00Z"),
    ]);

    expect(groupIds(groups)).toEqual([["b", "a"]]);
  });

  it("starts a new group when the label changes", () => {
    const groups = groupInventoryHistory([
      entry("imported", "2026-01-01T10:00:00.050Z", "import-replace"),
      entry("deleted", "2026-01-01T10:00:00.001Z", "import-replace"),
      entry("snapshot", "2026-01-01T10:00:00.000Z", "import-replace-before"),
      entry("manual", "2026-01-01T09:59:00.000Z"),
    ]);

    expect(groupIds(groups)).toEqual([
      ["imported", "deleted"],
      ["snapshot"],
      ["manual"],
    ]);
  });
});
