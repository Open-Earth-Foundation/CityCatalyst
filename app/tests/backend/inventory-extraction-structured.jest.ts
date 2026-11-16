/**
 * CC-1163 stage 2: extraction from the stored structured OCR document. The
 * model names a table cell and the text printed there; code reads, checks and
 * converts the value. The LLM is mocked; these tests prove the code around it.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { StructuredDocument } from "@/backend/StructuredDocumentArtifact";

type CompleteArgs = {
  messages: { role: string; content: string }[];
  jsonSchema?: { name: string };
};
const complete =
  jest.fn<(args: CompleteArgs) => Promise<{ content: string }>>();

jest.unstable_mockModule("@/backend/llm", () => ({
  createLLMClient: () => ({ complete }),
  LLMError: class LLMError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  LLMErrorCode: { BAD_REQUEST: "BAD_REQUEST" },
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const { extractInventoryFromStructured } =
  await import("@/backend/InventoryExtractionService");
const { reconciliationTargets } =
  await import("@/util/GHGI/extraction-summary");

beforeEach(() => {
  complete.mockReset();
});

type TableSpec = { id: string; caption?: string; content: string };
type PageSpec = { text?: string; tables: TableSpec[] };

const box = {
  top_left_x: 0,
  top_left_y: 0,
  bottom_right_x: 1,
  bottom_right_y: 1,
};
const norm = { x0: 0, y0: 0, x1: 1, y1: 1 };

function block(
  pageIndex: number,
  order: number,
  type: "caption" | "table" | "text",
  content: string,
  tableId: string | null = null,
) {
  return {
    block_id: `p${pageIndex}-b${order}`,
    page_index: pageIndex,
    reading_order_index: order,
    provider_type: type,
    normalized_type: type,
    hierarchy: { level: null, parent_block_id: null, provenance: "absent" },
    content,
    confidence: null,
    confidence_metric: null,
    bbox_px: box,
    bbox_norm: norm,
    related_image_id: null,
    related_table_id: tableId,
  };
}

/** A small hand-written structured document: page i has `page_index` i. */
function structuredDoc(pages: PageSpec[]): StructuredDocument {
  const relationships: unknown[] = [];
  const docPages = pages.map((spec, pageIndex) => {
    const blocks: ReturnType<typeof block>[] = [];
    if (spec.text) blocks.push(block(pageIndex, 0, "text", spec.text));
    for (const table of spec.tables) {
      let tableOrder = blocks.length;
      if (table.caption) {
        blocks.push(block(pageIndex, tableOrder, "caption", table.caption));
        tableOrder = blocks.length;
      }
      const tableBlock = block(
        pageIndex,
        tableOrder,
        "table",
        `[${table.id}](${table.id})`,
        table.id,
      );
      if (table.caption) {
        relationships.push({
          id: `rel-${tableBlock.block_id}`,
          type: "caption_of_table",
          from_block_id: blocks[blocks.length - 1].block_id,
          to_block_id: tableBlock.block_id,
          page_index: pageIndex,
          provenance: "derived",
          rule: "nearest_caption_same_page",
        });
      }
      blocks.push(tableBlock);
    }
    return {
      page_index: pageIndex,
      dimensions: { width: 1000, height: 1400, dpi: 200 },
      header: null,
      footer: null,
      markdown: "",
      blocks,
      tables: spec.tables.map((table) => ({
        table_id: table.id,
        page_index: pageIndex,
        content: table.content,
        bbox_px: null,
        bbox_norm: null,
      })),
      images: [],
    };
  });
  return {
    schema_version: "citycatalyst.structured-document.1",
    annotation_mode: "none",
    provider: {
      name: "mistral",
      requested_model: "mistral-ocr-latest",
      returned_model: "mistral-ocr-latest",
      payload: {},
    },
    document: {
      page_count: pages.length,
      pages: docPages,
      relationships,
    },
  } as unknown as StructuredDocument;
}

/** The OCR Markdown of the same document, with page markers. */
function markdownOf(pages: PageSpec[]): string {
  return pages
    .map(
      (spec, index) =>
        `<!-- page: ${index + 1} -->\n${spec.text ?? ""}\n\n` +
        spec.tables
          .map((table) => `${table.caption ?? ""}\n\n${table.content}`)
          .join("\n\n"),
    )
    .join("\n\n");
}

function fixture(name: string): StructuredDocument {
  return JSON.parse(
    readFileSync(`tests/fixtures/structured/${name}`, "utf8"),
  ) as StructuredDocument;
}

/** Answers each page call with the rows for the first table id in its prompt. */
function mockRowsByTable(byTable: Record<string, Record<string, unknown>[]>) {
  complete.mockImplementation(async (args) => {
    const prompt = args.messages[1].content;
    const id = Object.keys(byTable).find((tableId) =>
      prompt.includes(`Table ${tableId} `),
    );
    return { content: JSON.stringify({ rows: id ? byTable[id] : [] }) };
  });
}

const lineItem = (fields: Record<string, unknown>) => ({
  year: 2021,
  sector: "Stationary Energy",
  subsector: "Residential Buildings",
  category: "Residential",
  scope: "1",
  gpcRefNo: "I.1.1",
  refSource: "inferred",
  rowType: "line_item",
  unit: "t",
  ...fields,
});

const twoUnitsPage: PageSpec[] = [
  { text: "City GHG Inventory 2021", tables: [] },
  {
    text: "Results by sector.",
    tables: [
      {
        id: "t1",
        caption: "Table 1: Stationary energy emissions 2021 (kt CO2e)",
        content: "| Sector | 2021 |\n| --- | --- |\n| Residential | 1,234 |",
      },
      {
        id: "t2",
        caption: "Table 2: Waste emissions 2021",
        content:
          "| Source | tCO2e | CH4 (t CO2e) |\n| --- | --- | --- |\n| Landfill | 567 | 120 |",
      },
    ],
  },
];

describe("extractInventoryFromStructured", () => {
  it("two tables on one page with different units convert independently", async () => {
    mockRowsByTable({
      t1: [
        lineItem({
          category: "Residential",
          valueCell: "t1:r1:c1",
          totalCO2eText: "1,234",
          totalCO2e: 1234,
          unit: "kt",
        }),
        lineItem({
          sector: "Waste",
          subsector: "Solid Waste Disposal",
          category: "Landfill",
          gpcRefNo: "III.1.1",
          valueCell: "t2:r1:c1",
          totalCO2eText: "567",
          totalCO2e: 567,
          ch4Cell: "t2:r1:c2",
          co2Cell: "t2:r9:c9",
          ch4: 5,
          co2: 7,
        }),
      ],
    });
    const { rows } = await extractInventoryFromStructured(
      structuredDoc(twoUnitsPage),
      markdownOf(twoUnitsPage),
      { targetYear: 2021 },
    );
    expect(complete).toHaveBeenCalledTimes(1);
    const residential = rows.find((row) => row.category === "Residential");
    const landfill = rows.find((row) => row.category === "Landfill");
    expect(residential).toMatchObject({
      totalCO2e: 1234000,
      unit: "t",
      unitSource: "caption",
      totalCO2eText: "1,234",
      sourceCell: { tableId: "t1", page: 2, row: 1, col: 1 },
      page: 2,
    });
    expect(residential?.valueCheck).toBeUndefined();
    expect(residential?.unitCheck).toBeUndefined();
    expect(landfill).toMatchObject({
      totalCO2e: 567,
      unitSource: "column",
      sourceCell: { tableId: "t2", page: 2, row: 1, col: 1 },
      // The gas comes from its cell; a gas cell that does not exist is null.
      ch4: 120,
      co2: null,
    });
    expect(landfill?.valueCheck).toBeUndefined();
  });

  it("sends only pages with tables, with each cell's reference", async () => {
    mockRowsByTable({});
    await extractInventoryFromStructured(
      structuredDoc(twoUnitsPage),
      markdownOf(twoUnitsPage),
      { targetYear: 2021 },
    );
    expect(complete).toHaveBeenCalledTimes(1);
    const [system, user] = complete.mock.calls[0][0].messages;
    expect(system.content).toContain("<example_output>");
    expect(system.content).toContain("valueCell");
    expect(user.content).toContain("[t1:r1:c1] 1,234");
    expect(user.content).toContain("Results by sector.");
    expect(complete.mock.calls[0][0].jsonSchema?.name).toBe(
      "inventory_rows_cells",
    );
  });

  it("a hallucinated cell ref goes to review", async () => {
    mockRowsByTable({
      t1: [
        lineItem({
          valueCell: "t9:r1:c1",
          totalCO2eText: "1,234",
          totalCO2e: 1234,
        }),
      ],
    });
    const { rows } = await extractInventoryFromStructured(
      structuredDoc(twoUnitsPage),
      markdownOf(twoUnitsPage),
      { targetYear: 2021 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ valueCheck: "not_found", totalCO2e: 1234 });
    expect(rows[0].sourceCell ?? null).toBeNull();
  });

  it("printed text not in the cell goes to review", async () => {
    mockRowsByTable({
      t1: [
        lineItem({
          valueCell: "t1:r1:c1",
          totalCO2eText: "4,321",
          totalCO2e: 4321,
        }),
      ],
    });
    const { rows } = await extractInventoryFromStructured(
      structuredDoc(twoUnitsPage),
      markdownOf(twoUnitsPage),
      { targetYear: 2021 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ valueCheck: "not_found", totalCO2e: 4321 });
  });

  it("a chart value without a cell goes to review", async () => {
    mockRowsByTable({
      t1: [
        lineItem({
          category: "Chart value",
          valueCell: null,
          totalCO2eText: null,
          totalCO2e: 800,
        }),
      ],
    });
    const { rows } = await extractInventoryFromStructured(
      structuredDoc(twoUnitsPage),
      markdownOf(twoUnitsPage),
      { targetYear: 2021 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ valueCheck: "not_found", totalCO2e: 800 });
  });

  it("a per-person cell goes to review", async () => {
    const pages: PageSpec[] = [
      { tables: [] },
      {
        tables: [
          {
            id: "t1",
            caption: "Table 1: Emissions 2021",
            content:
              "| Sector | t CO2e | t CO2e per capita |\n| --- | --- | --- |\n| Residential | 5,000 | 4.2 |",
          },
        ],
      },
    ];
    mockRowsByTable({
      t1: [
        lineItem({
          valueCell: "t1:r1:c2",
          totalCO2eText: "4.2",
          totalCO2e: 4.2,
        }),
      ],
    });
    const { rows } = await extractInventoryFromStructured(
      structuredDoc(pages),
      markdownOf(pages),
      { targetYear: 2021 },
    );
    expect(rows[0]).toMatchObject({ valueCheck: "not_found" });
  });

  it("a table with no unit anywhere reads as tonnes, and its total is a target", async () => {
    const pages: PageSpec[] = [
      { tables: [] },
      {
        tables: [
          {
            id: "t1",
            caption: "Table 1: Emissions 2021",
            content:
              "| Sector | Emissions |\n| --- | --- |\n| Residential | 5,000 |\n| Total | 5,000 |",
          },
        ],
      },
    ];
    mockRowsByTable({
      t1: [
        lineItem({
          valueCell: "t1:r1:c1",
          totalCO2eText: "5,000",
          unit: "kt",
        }),
        {
          year: 2021,
          category: "Total",
          rowType: "total",
          valueCell: "t1:r2:c1",
          totalCO2eText: "5,000",
        },
      ],
    });
    const { rows, summary } = await extractInventoryFromStructured(
      structuredDoc(pages),
      markdownOf(pages),
      { targetYear: 2021 },
    );
    expect(rows[0]).toMatchObject({ totalCO2e: 5000, unit: "t" });
    expect(rows[0].unitCheck).toBeUndefined();
    expect(rows[0].valueCheck).toBeUndefined();
    expect(summary.reportedTotals[0]).toMatchObject({
      value: 5000,
      inText: true,
      rowsNearby: true,
    });
    expect(
      reconciliationTargets(summary.reportedTotals, 2021).grand,
    ).toHaveLength(1);
  });

  it("a page with a kt caption whose column has no unit marks the rows", async () => {
    const pages: PageSpec[] = [
      { tables: [] },
      {
        // The caption is page text, not linked to the table.
        text: "Table 1: Emissions by sector 2021 (kt CO2e)",
        tables: [
          {
            id: "t1",
            content:
              "| Sector | Emissions |\n| --- | --- |\n| Residential | 5,000 |\n| Total | 5,000 |",
          },
        ],
      },
    ];
    mockRowsByTable({
      t1: [
        lineItem({ valueCell: "t1:r1:c1", totalCO2eText: "5,000" }),
        {
          year: 2021,
          category: "Total",
          rowType: "total",
          valueCell: "t1:r2:c1",
          totalCO2eText: "5,000",
        },
      ],
    });
    const { rows, summary } = await extractInventoryFromStructured(
      structuredDoc(pages),
      markdownOf(pages),
      { targetYear: 2021 },
    );
    expect(rows[0]).toMatchObject({ totalCO2e: 5000, unitCheck: "missing" });
    // A unit-less total there confirms nothing (R4).
    expect(summary.reportedTotals).toEqual([]);
    expect(summary.droppedRows.unsupported_unit).toBe(1);
  });

  it("an MT header marks the rows for the unit check", async () => {
    const pages: PageSpec[] = [
      { tables: [] },
      {
        tables: [
          {
            id: "t1",
            caption: "Table 1: Emissions 2021",
            content:
              "| Sector | MT CO2e |\n| --- | --- |\n| Residential | 5,000 |",
          },
        ],
      },
    ];
    mockRowsByTable({
      t1: [lineItem({ valueCell: "t1:r1:c1", totalCO2eText: "5,000" })],
    });
    const { rows } = await extractInventoryFromStructured(
      structuredDoc(pages),
      markdownOf(pages),
      { targetYear: 2021 },
    );
    expect(rows[0]).toMatchObject({ totalCO2e: 5000, unitCheck: "missing" });
  });

  it("a chart caption over a table with no data rows keeps no line item", async () => {
    mockRowsByTable({});
    const { rows } = await extractInventoryFromStructured(
      fixture("chart-caption-only.json"),
      "<!-- page: 1 -->\n# City GHG Inventory 2021\n<!-- page: 2 -->\n" +
        "Figure 2: Emissions by sector 2021 (kt CO2e)\n\n| Sector | 2021 |\n| --- | --- |",
      { targetYear: 2021 },
    );
    expect(complete).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([]);
  });

  it("a column year other than the target drops the row as other_year", async () => {
    const pages: PageSpec[] = [
      { tables: [] },
      {
        tables: [
          {
            id: "t1",
            caption: "Table 1: Emissions (t CO2e)",
            content:
              "| Sector | 2019 | 2021 |\n| --- | --- | --- |\n| Residential | 4,000 | 5,000 |",
          },
        ],
      },
    ];
    mockRowsByTable({
      t1: [
        // The model claims 2021 for the 2019 column: the header decides.
        lineItem({ valueCell: "t1:r1:c1", totalCO2eText: "4,000" }),
        lineItem({
          category: "Commercial",
          valueCell: "t1:r1:c2",
          totalCO2eText: "5,000",
        }),
      ],
    });
    const { rows, summary } = await extractInventoryFromStructured(
      structuredDoc(pages),
      markdownOf(pages),
      { targetYear: 2021 },
    );
    expect(rows.map((row) => row.totalCO2e)).toEqual([5000]);
    expect(summary.droppedRows.other_year).toBe(1);
  });

  it("a total in another table is not a target", async () => {
    const pages: PageSpec[] = [
      { tables: [] },
      {
        tables: [
          {
            id: "t1",
            caption: "Table 1: Stationary energy 2021 (t CO2e)",
            content:
              "| Sector | tCO2e |\n| --- | --- |\n| Residential | 1,000 |\n| Commercial | 2,000 |",
          },
          {
            id: "t2",
            caption: "Table 2: Emissions by region 2021 (t CO2e)",
            content:
              "| Region | tCO2e |\n| --- | --- |\n| North | 1,500 |\n| Total | 3,000 |",
          },
        ],
      },
    ];
    mockRowsByTable({
      t1: [
        lineItem({ valueCell: "t1:r1:c1", totalCO2eText: "1,000" }),
        lineItem({
          category: "Commercial",
          subsector: "Commercial Buildings",
          gpcRefNo: "I.2.1",
          valueCell: "t1:r2:c1",
          totalCO2eText: "2,000",
        }),
        {
          year: 2021,
          category: "Total",
          rowType: "total",
          valueCell: "t2:r2:c1",
          totalCO2eText: "3,000",
          totalCO2e: 3000,
        },
      ],
    });
    const { summary } = await extractInventoryFromStructured(
      structuredDoc(pages),
      markdownOf(pages),
      { targetYear: 2021 },
    );
    expect(summary.reportedTotals).toHaveLength(1);
    expect(summary.reportedTotals[0]).toMatchObject({
      value: 3000,
      inText: true,
      rowsNearby: false,
      sourceCell: { tableId: "t2", page: 2, row: 2, col: 1 },
    });
    expect(reconciliationTargets(summary.reportedTotals, 2021).grand).toEqual(
      [],
    );
  });

  it("a total in the continuation table is a target", async () => {
    const doc = fixture("continued-table.json");
    mockRowsByTable({
      "tbl-4.md": [
        lineItem({
          valueCell: "tbl-4.md:r1:c1",
          totalCO2eText: "512.3",
          totalCO2e: 512.3,
        }),
        lineItem({
          category: "Commercial",
          subsector: "Commercial Buildings",
          gpcRefNo: "I.2.1",
          valueCell: "tbl-4.md:r2:c1",
          totalCO2eText: "401.8",
          totalCO2e: 401.8,
        }),
      ],
      "tbl-5.md": [
        {
          year: 2021,
          category: "Total",
          rowType: "total",
          valueCell: "tbl-5.md:r1:c1",
          totalCO2eText: "1,744.5",
          totalCO2e: 1744.5,
        },
      ],
    });
    const markdown =
      "<!-- page: 1 -->\n# City GHG Inventory 2021\n<!-- page: 2 -->\n" +
      "<!-- page: 3 -->\n<!-- page: 4 -->\nTable 5: Stationary energy emissions 2021 (kt CO2e)\n\n" +
      "| Sector | CO2 | CH4 |\n| --- | --- | --- |\n| Residential | 512.3 | 1.2 |\n| Commercial | 401.8 | 0.9 |\n" +
      "<!-- page: 5 -->\n| Industrial | 830.4 | 2.5 |\n| Total | 1,744.5 | 4.6 |\n\nSource: city energy records.";
    const { rows, summary } = await extractInventoryFromStructured(
      doc,
      markdown,
      { targetYear: 2021 },
    );
    expect(complete).toHaveBeenCalledTimes(2);
    expect(rows.map((row) => row.totalCO2e)).toEqual([512300, 401800]);
    expect(summary.reportedTotals).toHaveLength(1);
    expect(summary.reportedTotals[0]).toMatchObject({
      value: 1744500,
      inText: true,
      rowsNearby: true,
      page: 5,
    });
    expect(
      reconciliationTargets(summary.reportedTotals, 2021).grand,
    ).toHaveLength(1);
  });

  it("model totalCO2e is ignored when the cell reads differently", async () => {
    const pages: PageSpec[] = [
      { tables: [] },
      {
        tables: [
          {
            id: "t1",
            caption: "Table 1: Emissions 2021 (t CO2e)",
            content:
              "| Sector | tCO2e |\n| --- | --- |\n| Residential | 1,234 |",
          },
        ],
      },
    ];
    mockRowsByTable({
      t1: [
        lineItem({
          valueCell: "t1:r1:c1",
          totalCO2eText: "1,234",
          totalCO2e: 9999,
        }),
      ],
    });
    const { rows } = await extractInventoryFromStructured(
      structuredDoc(pages),
      markdownOf(pages),
      { targetYear: 2021 },
    );
    expect(rows[0].totalCO2e).toBe(1234);
    expect(rows[0].valueCheck).toBeUndefined();
  });

  it("keeps the review checks of the Markdown text (reference provenance)", async () => {
    mockRowsByTable({
      t1: [
        lineItem({
          valueCell: "t1:r1:c1",
          totalCO2eText: "1,234",
          refSource: "document",
        }),
      ],
    });
    const { rows } = await extractInventoryFromStructured(
      structuredDoc(twoUnitsPage),
      markdownOf(twoUnitsPage),
      { targetYear: 2021 },
    );
    // I.1.1 is not printed on the row's line in the Markdown: inferred.
    expect(rows[0].refSource).toBe("inferred");
  });

  it("falls back to jsonMode when the provider rejects the schema", async () => {
    const { LLMError } = await import("@/backend/llm");
    complete.mockImplementation(async (args) => {
      if (args.jsonSchema) {
        throw new (
          LLMError as unknown as new (message: string, code: string) => Error
        )("response_format json_schema unsupported", "BAD_REQUEST");
      }
      return {
        content: JSON.stringify({
          rows: [lineItem({ valueCell: "t1:r1:c1", totalCO2eText: "1,234" })],
        }),
      };
    });
    const { rows } = await extractInventoryFromStructured(
      structuredDoc(twoUnitsPage),
      markdownOf(twoUnitsPage),
      { targetYear: 2021 },
    );
    expect(rows[0].totalCO2e).toBe(1234000);
  });
});
