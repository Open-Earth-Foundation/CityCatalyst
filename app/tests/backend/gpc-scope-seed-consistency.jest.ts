import { describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { taxonomyScope } from "@/util/GHGI/gpc-ref-resolver";

const SEED_DIR = path.join(
  process.cwd(),
  "seed-data/gpc_seeder/data_processed",
);

function readCsv(file: string): Record<string, string>[] {
  const [header, ...lines] = fs
    .readFileSync(path.join(SEED_DIR, file), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const columns = header.split(",");
  return lines.map((line) => {
    const cells = line
      .match(/("([^"]|"")*"|[^,]*)(,|$)/g)!
      .map((cell) =>
        cell.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'),
      );
    return Object.fromEntries(columns.map((c, i) => [c, cells[i]]));
  });
}

const gpcReferenceTable = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "src/util/GHGI/data/gpc-reference-table.json"),
    "utf8",
  ),
) as { gpcRefNo: string }[];

const scopeNameById = new Map(
  readCsv("Scope.csv").map((r) => [r.scope_id, r.scope_name]),
);
// Sub-sectors such as IV.1 carry the scope themselves and have no sub-category.
// Sub-sectors such as IV.1 carry the scope themselves; others have none.
const seedScope = new Map<string, number>();
for (const r of [...readCsv("SubSector.csv"), ...readCsv("SubCategory.csv")]) {
  const name = scopeNameById.get(r.scope_id);
  if (name) seedScope.set(r.reference_number, Number(name));
}

// Known difference: the seed puts I.4.4 in scope 1, the taxonomy gives it none.
const KNOWN_DIFFERENCES = new Set(["I.4.4"]);

describe("GPC taxonomy scope matches the seeded scope", () => {
  it("agrees on the waste references and the known I.4.4 difference", () => {
    expect(seedScope.get("III.1.2")).toBe(3);
    expect(taxonomyScope("III.1.2")).toBe(3);
    expect(seedScope.get("III.1.3")).toBe(1);
    expect(taxonomyScope("III.1.3")).toBe(1);
    expect(seedScope.get("I.4.4")).toBe(1);
    expect(taxonomyScope("I.4.4")).toBeUndefined();
  });

  it("has the same scope for every other reference in both sources", () => {
    const mismatches: string[] = [];
    const refs = new Set([
      ...seedScope.keys(),
      ...gpcReferenceTable.map((r) => r.gpcRefNo),
    ]);
    for (const ref of refs) {
      if (KNOWN_DIFFERENCES.has(ref)) continue;
      const seed = seedScope.get(ref);
      const taxonomy = taxonomyScope(ref);
      if (seed !== taxonomy) {
        mismatches.push(`${ref}: seed ${seed}, taxonomy ${taxonomy}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
