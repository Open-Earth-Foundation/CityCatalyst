import { readFileSync } from "node:fs";

import type { StructuredDocument } from "@/backend/StructuredDocumentArtifact";
import {
  CELL_UNIT_FACTOR,
  readCell,
  type CellRead,
} from "@/util/GHGI/cell-values";
import {
  buildTableBundles,
  parseMarkdownTable,
  type TableBundle,
} from "@/util/GHGI/table-bundles";

/** A bundle from Markdown table text, with optional caption and unit notes. */
function bundle(
  tableId: string,
  content: string,
  extra: Partial<Omit<TableBundle, "tableId" | "grid" | "headerRowCount">> = {},
): TableBundle {
  const { grid, headerRowCount } = parseMarkdownTable(tableId, content);
  return {
    tableId,
    page: 1,
    caption: null,
    headings: [],
    unitNotes: [],
    yearNotes: [],
    continuationOf: null,
    ...extra,
    grid,
    headerRowCount,
  };
}

function okRead(read: CellRead) {
  if (!read.ok) throw new Error(`expected ok, got ${read.reason}`);
  return read;
}

describe("CELL_UNIT_FACTOR", () => {
  it("converts each unit to tonnes", () => {
    expect(CELL_UNIT_FACTOR).toEqual({
      t: 1,
      kt: 1000,
      Gg: 1000,
      Mt: 1000000,
      kg: 0.001,
    });
  });
});

describe("readCell", () => {
  it("converts a kt column header value to tonnes", () => {
    const b = bundle(
      "t1",
      "| Sector | Emissions (kt CO2e) |\n| --- | --- |\n| Total | 9,559.2 |",
    );
    const read = okRead(readCell([b], "t1:r1:c1", "9,559.2", "english"));
    expect(read).toMatchObject({
      tonnes: 9559200,
      printed: "9,559.2",
      unit: "kt",
      unitSource: "column",
      unitConflict: false,
    });
  });

  it("prefers a t CO2e column header over a kt caption", () => {
    const b = bundle(
      "t1",
      "| Sector | t CO2e |\n| --- | --- |\n| Total | 1,200 |",
      {
        caption: "Table 3: Emissions (kt)",
        unitNotes: ["Table 3: Emissions (kt)", "t CO2e"],
      },
    );
    const read = okRead(readCell([b], "t1:r1:c1", "1,200", "english"));
    expect(read).toMatchObject({
      unit: "t",
      unitSource: "column",
      tonnes: 1200,
    });
  });

  it("falls back to the row's first cell, then the caption", () => {
    const b = bundle(
      "t1",
      "| Gas | 2021 |\n| --- | --- |\n| CH4 (kt) | 12 |\n| CO2 | 30 |",
      { caption: "Emissions in Gg", unitNotes: ["Emissions in Gg"] },
    );
    expect(okRead(readCell([b], "t1:r1:c1", "12", "english"))).toMatchObject({
      unit: "kt",
      unitSource: "row",
      tonnes: 12000,
    });
    expect(okRead(readCell([b], "t1:r2:c1", "30", "english"))).toMatchObject({
      unit: "Gg",
      unitSource: "caption",
      tonnes: 30000,
    });
  });

  it("gives a conflict when two header cells of the column name t and kt", () => {
    const b = bundle(
      "t1",
      "| Sector | Emissions (t CO2e) |\n| | kt |\n| --- | --- |\n| Total | 500 |",
    );
    const read = okRead(readCell([b], "t1:r2:c1", "500", "english"));
    expect(read).toMatchObject({
      unit: null,
      unitSource: "column",
      unitConflict: true,
      tonnes: 500,
    });
  });

  it("does not let a lower level break a tie: a caption conflict is a conflict", () => {
    const b = bundle(
      "t2",
      "| Sector | Total |\n| --- | --- |\n| Energy | 40 |",
      {
        caption: "Emissions (kt CO2e)",
        continuationOf: "t1",
        unitNotes: ["Emissions (kt CO2e)", "Emissions (t CO2e)"],
      },
    );
    expect(okRead(readCell([b], "t2:r1:c1", "40", "english"))).toMatchObject({
      unit: null,
      unitSource: "caption",
      unitConflict: true,
      tonnes: 40,
    });
  });

  it("does not read other columns' header units at the caption level (R15)", () => {
    const b = bundle(
      "t1",
      "| Sector | t CO2e | kt CO2e | Share |\n| --- | --- | --- | --- |\n| Energy | 1,200 | 1.2 | 12 |",
      // As buildTableBundles writes them: the header cells that name a unit.
      { unitNotes: ["t CO2e", "kt CO2e"] },
    );
    expect(okRead(readCell([b], "t1:r1:c3", "12", "english"))).toMatchObject({
      unit: null,
      unitSource: null,
      unitConflict: false,
      tonnes: 12,
    });
    expect(okRead(readCell([b], "t1:r1:c2", "1.2", "english"))).toMatchObject({
      unit: "kt",
      unitSource: "column",
      unitConflict: false,
      tonnes: 1200,
    });
  });

  it("does not count kt and Gg at one level as a conflict (R15)", () => {
    const b = bundle(
      "t1",
      "| Sector | Total |\n| --- | --- |\n| Energy | 7 |",
      {
        caption: "Emissions in Gg CO2e",
        headings: ["Inventory (kt)"],
        unitNotes: ["Emissions in Gg CO2e", "Inventory (kt)"],
      },
    );
    const read = okRead(readCell([b], "t1:r1:c1", "7", "english"));
    expect(read).toMatchObject({
      unitSource: "caption",
      unitConflict: false,
      tonnes: 7000,
    });
    expect(read.unit && CELL_UNIT_FACTOR[read.unit]).toBe(1000);
  });

  describe("a continuation reads its source column header (R16)", () => {
    const sourceHeader =
      "| Sector | t CO2e (2021) | kt CO2e | t CO2e / capita | Share % |";
    // As buildTableBundles writes them: the source's unit header cells, which
    // the continuation inherits.
    const notes = ["t CO2e (2021)", "kt CO2e", "t CO2e / capita"];
    const source = bundle(
      "t1",
      `${sourceHeader}\n| --- | --- | --- | --- | --- |\n| Energy | 1,200 | 1.2 | 5.1 | 40 |`,
      { unitNotes: notes },
    );
    // No separator: the continuation has no header rows.
    const continuation = bundle(
      "t2",
      "| Waste | 300 | 0.3 | 1.2 | 10 |\n| Total | 1,500 | 1.5 | 6.3 | 50 |",
      { page: 2, unitNotes: notes, continuationOf: "t1" },
    );
    const bundles = [source, continuation];

    it("reads the t column as t and the kt column as kt, without a conflict", () => {
      expect(
        okRead(readCell(bundles, "t2:r0:c1", "300", "english")),
      ).toMatchObject({
        unit: "t",
        unitSource: "column",
        unitConflict: false,
        tonnes: 300,
      });
      expect(
        okRead(readCell(bundles, "t2:r1:c2", "1.5", "english")),
      ).toMatchObject({
        unit: "kt",
        unitSource: "column",
        unitConflict: false,
        tonnes: 1500,
      });
    });

    it("gives per_person for the per-capita column", () => {
      expect(readCell(bundles, "t2:r0:c3", "1.2", "english")).toEqual({
        ok: false,
        reason: "per_person",
      });
    });

    it("gives the Share column no unit", () => {
      expect(
        okRead(readCell(bundles, "t2:r0:c4", "10", "english")),
      ).toMatchObject({ unit: null, unitSource: null, unitConflict: false });
    });

    it("takes columnYear from the source header", () => {
      expect(
        okRead(readCell(bundles, "t2:r0:c1", "300", "english")).columnYear,
      ).toBe(2021);
    });

    it("follows a chain of continuations", () => {
      const third = bundle("t3", "| Other | 7 | 0.7 | 0.1 | 2 |", {
        page: 3,
        unitNotes: notes,
        continuationOf: "t2",
      });
      expect(
        okRead(readCell([...bundles, third], "t3:r0:c2", "0.7", "english")),
      ).toMatchObject({ unit: "kt", tonnes: 700 });
    });

    it("reads the first row of a built continuation", () => {
      const doc = JSON.parse(
        readFileSync("tests/fixtures/structured/continued-table.json", "utf8"),
      ) as StructuredDocument;
      doc.document.pages[4].tables[0].content =
        "| Industrial | 830.4 | 2.5 |\n| --- | --- | --- |\n| Total | 1,744.5 | 4.6 |";
      const built = buildTableBundles(doc, 2026);
      expect(
        okRead(readCell(built, "tbl-5.md:r0:c1", "830.4", "english")),
      ).toMatchObject({ unit: "kt", unitSource: "caption", tonnes: 830400 });
    });
  });

  it("does not take the end of a space-grouped number", () => {
    const b = bundle(
      "t1",
      "| Sector | Total |\n| --- | --- |\n| Energy | 9 559 215 |",
    );
    expect(readCell([b], "t1:r1:c1", "215", "english")).toEqual({
      ok: false,
      reason: "text_not_in_cell",
    });
  });

  it("finds a printed hyphen-minus in a cell with a Unicode minus", () => {
    const b = bundle(
      "t1",
      "| Sector | Total |\n| --- | --- |\n| AFOLU | −603,983 |",
    );
    expect(
      okRead(readCell([b], "t1:r1:c1", "-603,983", "english")).tonnes,
    ).toBe(-603983);
  });

  it("limits columnYear to currentYear", () => {
    const b = bundle("t1", "| Sector | 2027 |\n| --- | --- |\n| Energy | 40 |");
    expect(
      okRead(readCell([b], "t1:r1:c1", "40", "english", 2026)).columnYear,
    ).toBeNull();
    expect(
      okRead(readCell([b], "t1:r1:c1", "40", "english", 2027)).columnYear,
    ).toBe(2027);
  });

  it("keeps a value without any unit in tonnes, with no source", () => {
    const b = bundle(
      "t1",
      "| Sector | Total |\n| --- | --- |\n| Energy | 40 |",
    );
    expect(okRead(readCell([b], "t1:r1:c1", "40", "english"))).toMatchObject({
      unit: null,
      unitSource: null,
      unitConflict: false,
      tonnes: 40,
    });
  });

  it("maps a capital MT header to no unit without a conflict (ambiguous, #3420)", () => {
    const b = bundle(
      "t1",
      "| Sector | MT CO2e |\n| --- | --- |\n| Energy | 40 |",
      { caption: "Emissions (kt)", unitNotes: ["Emissions (kt)", "MT CO2e"] },
    );
    expect(okRead(readCell([b], "t1:r1:c1", "40", "english"))).toMatchObject({
      unit: null,
      unitSource: "column",
      unitConflict: false,
      tonnes: 40,
    });
  });

  it("reads thousand MT as kt", () => {
    const b = bundle(
      "t1",
      "| Sector | thousand MT CO2e |\n| --- | --- |\n| Energy | 4.5 |",
    );
    expect(okRead(readCell([b], "t1:r1:c1", "4.5", "english"))).toMatchObject({
      unit: "kt",
      tonnes: 4500,
    });
  });

  it("converts Mt and kg", () => {
    const b = bundle(
      "t1",
      "| Sector | Mt CO2e | kg CO2e |\n| --- | --- | --- |\n| Energy | 1.25 | 2,500 |",
    );
    expect(okRead(readCell([b], "t1:r1:c1", "1.25", "english"))).toMatchObject({
      unit: "Mt",
      tonnes: 1250000,
    });
    expect(okRead(readCell([b], "t1:r1:c2", "2,500", "english"))).toMatchObject(
      {
        unit: "kg",
        tonnes: 2.5,
      },
    );
  });

  it("gives no_cell for a missing, unknown or header ref", () => {
    const b = bundle(
      "t1",
      "| Sector | Total |\n| --- | --- |\n| Energy | 40 |",
    );
    expect(readCell([b], null, "40", "english")).toEqual({
      ok: false,
      reason: "no_cell",
    });
    expect(readCell([b], undefined, "40", "english")).toEqual({
      ok: false,
      reason: "no_cell",
    });
    expect(readCell([b], "t1:r9:c1", "40", "english")).toEqual({
      ok: false,
      reason: "no_cell",
    });
    expect(readCell([b], "t9:r1:c1", "40", "english")).toEqual({
      ok: false,
      reason: "no_cell",
    });
    expect(readCell([b], "t1:r0:c1", "Total", "english")).toEqual({
      ok: false,
      reason: "no_cell",
    });
  });

  it("gives text_not_in_cell when the printed text is not in the cell", () => {
    const b = bundle(
      "t1",
      "| Sector | Total |\n| --- | --- |\n| Energy | 100 |",
    );
    expect(readCell([b], "t1:r1:c1", "120", "english")).toEqual({
      ok: false,
      reason: "text_not_in_cell",
    });
    expect(readCell([b], "t1:r1:c1", null, "english")).toEqual({
      ok: false,
      reason: "text_not_in_cell",
    });
  });

  it("does not accept a printed fragment of a larger number", () => {
    const b = bundle(
      "t1",
      "| Sector | Total |\n| --- | --- |\n| Energy | 9,559.2 a |",
    );
    expect(readCell([b], "t1:r1:c1", "559", "english")).toEqual({
      ok: false,
      reason: "text_not_in_cell",
    });
    expect(okRead(readCell([b], "t1:r1:c1", "9,559.2", "english")).tonnes).toBe(
      9559.2,
    );
  });

  it("matches printed text after collapsing whitespace", () => {
    const b = bundle(
      "t1",
      "| Sector | Total |\n| --- | --- |\n| Energy | 9 559 215 |",
    );
    expect(
      okRead(readCell([b], "t1:r1:c1", "9 559 215", "english")).tonnes,
    ).toBe(9559215);
  });

  it("gives not_a_number for a cell such as NE", () => {
    const b = bundle(
      "t1",
      "| Sector | Total |\n| --- | --- |\n| Energy | NE |",
    );
    expect(readCell([b], "t1:r1:c1", "NE", "english")).toEqual({
      ok: false,
      reason: "not_a_number",
    });
  });

  it("gives per_person for a t CO2e / capita column", () => {
    const b = bundle(
      "t1",
      "| Sector | t CO2e / capita |\n| --- | --- |\n| Total | 5.2 |",
    );
    expect(readCell([b], "t1:r1:c1", "5.2", "english")).toEqual({
      ok: false,
      reason: "per_person",
    });
  });

  it.each([
    "kg per capita",
    "t per person",
    "t CO2e per cápita",
    "t CO2e pro Kopf",
    "tCO2e/capita",
  ])("gives per_person for a %s column", (header) => {
    const b = bundle(
      "t1",
      `| Sector | ${header} |\n| --- | --- |\n| Total | 5.2 |`,
    );
    expect(readCell([b], "t1:r1:c1", "5.2", "english")).toEqual({
      ok: false,
      reason: "per_person",
    });
  });

  it("reads the column's year from its header cells", () => {
    const b = bundle(
      "t1",
      "| Sector | 2019 | 2021 |\n| --- | --- | --- |\n| Total | 10 | 12 |",
    );
    expect(okRead(readCell([b], "t1:r1:c2", "12", "english")).columnYear).toBe(
      2021,
    );
    const noYear = bundle(
      "t2",
      "| Sector | Total |\n| --- | --- |\n| Energy | 40 |",
    );
    expect(
      okRead(readCell([noYear], "t2:r1:c1", "40", "english")).columnYear,
    ).toBeNull();
  });

  it("reads a value in parentheses as negative", () => {
    const b = bundle(
      "t1",
      "| Sector | Total (t CO2e) |\n| --- | --- |\n| AFOLU | (811,512) |",
    );
    expect(
      okRead(readCell([b], "t1:r1:c1", "(811,512)", "english")).tonnes,
    ).toBe(-811512);
    expect(okRead(readCell([b], "t1:r1:c1", "811,512", "english")).tonnes).toBe(
      -811512,
    );
  });

  it("reads a Unicode minus before a value with a note as negative", () => {
    const b = bundle(
      "t1",
      "| Sector | Total |\n| --- | --- |\n| AFOLU | −603,983 (a) |",
    );
    expect(okRead(readCell([b], "t1:r1:c1", "603,983", "english")).tonnes).toBe(
      -603983,
    );
  });

  it("parses with the document's number style", () => {
    const b = bundle(
      "t1",
      "| Sector | Total (kt) |\n| --- | --- |\n| Energy | 1.500 |",
    );
    expect(okRead(readCell([b], "t1:r1:c1", "1.500", "european")).tonnes).toBe(
      1500000,
    );
  });
});
