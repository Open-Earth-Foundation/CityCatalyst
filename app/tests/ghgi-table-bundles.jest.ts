import { readFileSync } from "node:fs";

import type { StructuredDocument } from "@/backend/StructuredDocumentArtifact";
import {
  buildTableBundles,
  bundleText,
  parseMarkdownTable,
} from "@/util/GHGI/table-bundles";

/**
 * StructuredDocument as JSON can type it: string literal unions widen to
 * string. A hand-written fixture must have this shape (checked by
 * `npx tsc --noEmit -p tests/tsconfig.json`).
 */
type JsonShape<T> = T extends string
  ? string
  : T extends number | boolean | null
    ? T
    : T extends Array<infer U>
      ? JsonShape<U>[]
      : T extends object
        ? { [K in keyof T]: JsonShape<T[K]> }
        : T;

function assertFixtureShape<_T extends JsonShape<StructuredDocument>>(): void {}
assertFixtureShape<
  typeof import("./fixtures/structured/two-tables-one-page.json")
>();
assertFixtureShape<
  typeof import("./fixtures/structured/continued-table.json")
>();

function loadFixture(name: string): StructuredDocument {
  return JSON.parse(
    readFileSync(`tests/fixtures/structured/${name}`, "utf8"),
  ) as StructuredDocument;
}

const CURRENT_YEAR = 2026;

describe("parseMarkdownTable", () => {
  it("counts every row above the separator as a header row", () => {
    const { grid, headerRowCount } = parseMarkdownTable(
      "t1",
      [
        "| | 2019 | 2020 |",
        "| Sector | kt CO2e | kt CO2e |",
        "| --- | --- | --- |",
        "| Energy | 1,200 | 1,150 |",
        "| Waste | 80.3 | 79.9 |",
      ].join("\n"),
    );
    expect(headerRowCount).toBe(2);
    expect(grid).toHaveLength(4);
    expect(grid[0][1]).toEqual({ ref: "t1:r0:c1", text: "2019", header: true });
    expect(grid[1][1].header).toBe(true);
    expect(grid[2][1]).toEqual({
      ref: "t1:r2:c1",
      text: "1,200",
      header: false,
    });
    expect(grid[3][0]).toEqual({
      ref: "t1:r3:c0",
      text: "Waste",
      header: false,
    });
  });

  it("keeps an escaped pipe inside its cell", () => {
    const { grid } = parseMarkdownTable(
      "t2",
      "| Name | Value |\n|---|---|\n| Fuel \\| diesel | 3 |",
    );
    expect(grid[1]).toHaveLength(2);
    expect(grid[1][0].text).toBe("Fuel | diesel");
    expect(grid[1][1]).toEqual({ ref: "t2:r1:c1", text: "3", header: false });
  });

  it("has no header rows without a separator", () => {
    const { grid, headerRowCount } = parseMarkdownTable(
      "t3",
      "| Industrial | 830.4 |\n| Total | 1,744.5 |",
    );
    expect(headerRowCount).toBe(0);
    expect(grid.flat().every((cell) => !cell.header)).toBe(true);
  });
});

describe("buildTableBundles", () => {
  it("gives each table on a page its own caption, headings and units", () => {
    const bundles = buildTableBundles(
      loadFixture("two-tables-one-page.json"),
      CURRENT_YEAR,
    );
    expect(bundles).toHaveLength(2);
    const [energy, waste] = bundles;

    expect(energy).toMatchObject({
      tableId: "tbl-3a.md",
      page: 4,
      caption: "Table 3: Stationary energy emissions 2021 (kt CO2e)",
      headings: ["## 4. Sector results 2021"],
      unitNotes: ["Table 3: Stationary energy emissions 2021 (kt CO2e)"],
      yearNotes: [2021],
      headerRowCount: 1,
      continuationOf: null,
    });
    expect(energy.grid[1][1]).toEqual({
      ref: "tbl-3a.md:r1:c1",
      text: "1,234.5",
      header: false,
    });

    expect(waste).toMatchObject({
      tableId: "tbl-3b.md",
      page: 4,
      caption: "Table 4: Waste emissions (t CO2e)",
      headings: ["## 4. Sector results 2021", "### Waste"],
      unitNotes: ["Table 4: Waste emissions (t CO2e)", "tCO2e"],
      yearNotes: [2021],
      continuationOf: null,
    });
    expect(waste.unitNotes.some((note) => /\bkt\b/i.test(note))).toBe(false);
  });

  it("carries the caption and units of a table continued on the next page", () => {
    const bundles = buildTableBundles(
      loadFixture("continued-table.json"),
      CURRENT_YEAR,
    );
    expect(bundles.map((b) => [b.tableId, b.page])).toEqual([
      ["tbl-4.md", 4],
      ["tbl-5.md", 5],
    ]);
    const continued = bundles[1];
    expect(continued).toMatchObject({
      continuationOf: "tbl-4.md",
      caption: "Table 5: Stationary energy emissions 2021 (kt CO2e)",
      unitNotes: ["Table 5: Stationary energy emissions 2021 (kt CO2e)"],
      yearNotes: [2021],
      headerRowCount: 0,
    });
    expect(continued.grid[1][1].ref).toBe("tbl-5.md:r1:c1");
  });

  it("does not continue a table with a different column count", () => {
    const doc = loadFixture("continued-table.json");
    doc.document.pages[4].tables[0].content =
      "| Industrial | 830.4 | 2.5 | 0.1 |\n| Total | 1,744.5 | 4.6 | 0.2 |";
    const continued = buildTableBundles(doc, CURRENT_YEAR)[1];
    expect(continued).toMatchObject({
      tableId: "tbl-5.md",
      continuationOf: null,
      caption: null,
      unitNotes: [],
      yearNotes: [],
    });
  });

  it("does not continue a table that has its own caption", () => {
    const doc = loadFixture("continued-table.json");
    const page = doc.document.pages[4];
    page.blocks[1].normalized_type = "caption";
    page.blocks[1].content = "Table 6: Transport emissions (t CO2e)";
    doc.document.relationships.push({
      id: "rel-p4-p4-b0-p4-b1",
      type: "caption_of_table",
      from_block_id: "p4-b1",
      to_block_id: "p4-b0",
      page_index: 4,
      provenance: "derived",
      rule: "nearest_caption_same_page",
    });
    const continued = buildTableBundles(doc, CURRENT_YEAR)[1];
    expect(continued.continuationOf).toBeNull();
    expect(continued.caption).toBe("Table 6: Transport emissions (t CO2e)");
    expect(continued.unitNotes).toEqual([
      "Table 6: Transport emissions (t CO2e)",
    ]);
  });

  it("keeps only years from 1990 to the current year", () => {
    const doc = loadFixture("two-tables-one-page.json");
    doc.document.pages[3].blocks[1].content =
      "Table 3: Emissions 2021 and 2050 target, 1985 (kt CO2e)";
    const [energy] = buildTableBundles(doc, CURRENT_YEAR);
    expect(energy.yearNotes).toEqual([2021]);
  });
});

describe("bundleText", () => {
  it("renders one line per row, each cell prefixed with its ref", () => {
    const [energy] = buildTableBundles(
      loadFixture("two-tables-one-page.json"),
      CURRENT_YEAR,
    );
    const lines = bundleText(energy).split("\n");
    expect(lines).toContain(
      "[tbl-3a.md:r0:c0] Sector | [tbl-3a.md:r0:c1] 2021",
    );
    expect(lines).toContain(
      "[tbl-3a.md:r1:c0] Residential | [tbl-3a.md:r1:c1] 1,234.5",
    );
    expect(lines).toContain(
      "Caption: Table 3: Stationary energy emissions 2021 (kt CO2e)",
    );
  });

  it("escapes a pipe inside a cell", () => {
    const { grid, headerRowCount } = parseMarkdownTable(
      "t2",
      "| Name | Value |\n|---|---|\n| Fuel \\| diesel | 3 |",
    );
    const text = bundleText({
      tableId: "t2",
      page: 1,
      caption: null,
      headings: [],
      unitNotes: [],
      yearNotes: [],
      headerRowCount,
      grid,
      continuationOf: null,
    });
    expect(text).toContain("[t2:r1:c0] Fuel \\| diesel | [t2:r1:c1] 3");
  });
});
