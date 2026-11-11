import { describe, expect, it } from "@jest/globals";
import { join } from "node:path";
import type { Block } from "@/backend/ingestion-benchmark/report";
import {
  MAX_FILES_PER_RUN,
  SelectionError,
  loadManifest,
  selectCases,
  type CaseManifestEntry,
} from "@/backend/ingestion-benchmark/selection";

const entry = (
  id: string,
  over: Partial<CaseManifestEntry> = {},
): CaseManifestEntry => ({
  id,
  city: "City",
  country: "Country",
  year: 2020,
  block: "validated",
  totalOnly: false,
  textTables: null,
  fileName: `${id}.pdf`,
  ...over,
});

const manifest = [entry("C-004"), entry("C-010"), entry("C-020")];

describe("selectCases", () => {
  it("throws when --cases and --set are both given", () => {
    expect(() =>
      selectCases(manifest, { cases: "C-004", set: "validated" }),
    ).toThrow(SelectionError);
  });

  it("throws when neither --cases nor --set is given", () => {
    expect(() => selectCases(manifest, {})).toThrow(SelectionError);
  });

  it("throws on unknown id and lists valid ids", () => {
    try {
      selectCases(manifest, { cases: "C-004,C-999" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SelectionError);
      expect((e as SelectionError).ids).toEqual(["C-999"]);
      expect((e as Error).message).toContain("C-999");
      expect((e as Error).message).toContain("C-004, C-010, C-020");
    }
  });

  it("trims and upper-cases ids", () => {
    const out = selectCases(manifest, { cases: "c-004, C-010" });
    expect(out.map((c) => c.id)).toEqual(["C-004", "C-010"]);
  });

  it("ignores repeated ids, in any case, before the 10-file cap", () => {
    const big = Array.from({ length: 10 }, (_, i) =>
      entry(`C-${String(100 + i)}`),
    );
    const ids = big.map((c) => c.id);
    const repeated = [...ids, ids[0].toLowerCase(), ` ${ids[1]} `].join(",");
    expect(selectCases(big, { cases: repeated }).map((c) => c.id)).toEqual(ids);
  });

  it("throws SelectionError with all ids for 11 files, passes for 10", () => {
    const big = Array.from({ length: 11 }, (_, i) =>
      entry(`C-${String(100 + i)}`),
    );
    const ids = big.map((c) => c.id);
    expect(MAX_FILES_PER_RUN).toBe(10);
    try {
      selectCases(big, { cases: ids.join(",") });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SelectionError);
      expect((e as SelectionError).ids).toEqual(ids);
    }
    expect(
      selectCases(big, { cases: ids.slice(0, 10).join(",") }),
    ).toHaveLength(10);
  });

  it("selects a whole block with --set", () => {
    const m = [entry("C-1"), entry("C-2", { block: "held-out" })];
    expect(selectCases(m, { set: "held-out" }).map((c) => c.id)).toEqual([
      "C-2",
    ]);
  });

  it("--eligible keeps textTables true and not totalOnly", () => {
    const m = [
      entry("C-1", { textTables: true }),
      entry("C-2", { textTables: true, totalOnly: true }),
      entry("C-3", { textTables: false }),
      entry("C-4", { textTables: null }),
    ];
    expect(
      selectCases(m, { set: "validated", eligible: true }).map((c) => c.id),
    ).toEqual(["C-1"]);
  });

  it("--eligible returns [] when every textTables is null", () => {
    expect(selectCases(manifest, { set: "validated", eligible: true })).toEqual(
      [],
    );
  });
});

describe("cases.json", () => {
  const path = join(process.cwd(), "benchmarks/pdf/cases.json");
  const blocks: Block[] = ["validated", "held-out", "dev"];

  it("has 28 unique ids and every block value is valid", () => {
    const m = loadManifest(path);
    expect(m).toHaveLength(28);
    expect(new Set(m.map((c) => c.id)).size).toBe(28);
    for (const c of m) expect(blocks).toContain(c.block);
    expect(m.filter((c) => c.totalOnly).map((c) => c.id)).toEqual([
      "C-006",
      "C-022",
      "C-023",
      "C-024",
      "C-025",
    ]);
  });
});
