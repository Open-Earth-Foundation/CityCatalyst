/**
 * CC-1008 Re-review 2: regression tests for the page selection, year, progress,
 * failed-page, total-label, hidden-total and reference-scope findings.
 * The LLM is mocked; these tests prove the code around the model.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const complete = jest.fn<(args: unknown) => Promise<{ content: string }>>();

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

const {
  canonicalGpcRefNo,
  extractInventoryFromDocument,
  finalizeExtractedRows,
  selectReconciledPages,
} = await import("@/backend/InventoryExtractionService");
const { extractionReviewNotes } =
  await import("@/util/GHGI/extraction-summary");
type ExtractedRow = import("@/backend/InventoryExtractionService").ExtractedRow;
type ExtractionSummary =
  import("@/util/GHGI/extraction-summary").ExtractionSummary;

const SE = "Stationary Energy";
const TR = "Transportation";
const TOTAL = 9559215;

const row = (
  gpcRefNo: string | null,
  scope: string | null,
  totalCO2e: number | null,
  extra: Partial<ExtractedRow> = {},
): ExtractedRow => ({
  year: 2021,
  sector: SE,
  subsector: "Residential Buildings",
  category: null,
  totalCO2e,
  scope,
  gpcRefNo,
  ...extra,
});

const grandTotal = (value = TOTAL, year: number | null = 2021): ExtractedRow =>
  row(null, null, value, { rowType: "total", category: "BASIC+", year });

/** Finalize one page the way the page path does. */
const pageOf = (page: number, rows: ExtractedRow[]) => ({
  page,
  result: finalizeExtractedRows(rows, 2021, { deferYearAssumption: true }),
});

/** Rows of an exact GPC table: two scoped rows that add up to TOTAL. */
const exactTable = (): ExtractedRow[] => [
  row("I.1.1", "1", 9000000),
  row("I.1.2", "2", TOTAL - 9000000),
];

beforeEach(() => {
  complete.mockReset();
});

describe("1. ranking: an exact page beats a wider run", () => {
  it("selects page 46 alone when page 47 adds a small scoped table", () => {
    const result = selectReconciledPages(
      [
        pageOf(15, [grandTotal()]),
        pageOf(46, exactTable()),
        pageOf(47, [
          row("II.1.1", "1", 400000, { sector: TR, subsector: "On Road" }),
          row("II.1.2", "2", 250000, { sector: TR, subsector: "On Road" }),
        ]),
      ],
      2021,
    );
    expect(result.summary.pageSelection).toBe("reconciled");
    expect(result.summary.selectedPages).toEqual([46]);
    expect(result.summary.importedSum).toBe(TOTAL);
  });

  it("still joins two halves of one table", () => {
    const result = selectReconciledPages(
      [
        pageOf(15, [grandTotal()]),
        pageOf(46, [row("I.1.1", "1", 9000000)]),
        pageOf(47, [row("I.1.2", "2", TOTAL - 9000000)]),
      ],
      2021,
    );
    expect(result.summary.selectedPages).toEqual([46, 47]);
  });

  it("keeps a GPC table 6% short ahead of a page without GPC rows", () => {
    const result = selectReconciledPages(
      [
        pageOf(15, [grandTotal(), grandTotal(10757000)]),
        pageOf(17, [
          row(null, null, 10757000, { sector: "Energy", subsector: null }),
        ]),
        pageOf(46, [row("I.1.1", "1", TOTAL * 0.94)]),
      ],
      2021,
    );
    expect(result.summary.selectedPages).toEqual([46]);
  });
});

describe("2. year: decided after selection, not per page", () => {
  it("does not reconcile a year-less page when another page names 2021", () => {
    const result = selectReconciledPages(
      [
        pageOf(15, [grandTotal()]),
        pageOf(60, [row("I.3.1", "1", 9100000, { year: null })]),
      ],
      2021,
    );
    expect(result.summary.pageSelection).toBe("fallback");
    expect(result.summary.yearAssumed).toBe(false);
    expect(result.summary.droppedRows.missing_year).toBe(1);
  });

  it("assumes the year when no page names one, but only within 1%", () => {
    const noYear = (value: number) => [
      grandTotal(TOTAL, null),
      row("I.1.1", "1", value, { year: null }),
    ];
    const exact = selectReconciledPages([pageOf(46, noYear(TOTAL))], 2021);
    expect(exact.summary.pageSelection).toBe("reconciled");
    expect(exact.summary.yearAssumed).toBe(true);
    expect(exact.rows.every((r) => r.year === 2021)).toBe(true);

    const off = selectReconciledPages(
      [pageOf(46, noYear(TOTAL * 0.952))],
      2021,
    );
    expect(off.summary.pageSelection).toBe("fallback");
  });

  it("keeps the year rule of the chunk path unchanged", () => {
    const { rows, summary } = finalizeExtractedRows(
      [row("I.1.1", "1", 5, { year: null })],
      2021,
    );
    expect(rows[0].year).toBe(2021);
    expect(summary.yearAssumed).toBe(true);
  });
});

describe("3. review notes", () => {
  const summary = (importedSum: number): ExtractionSummary => ({
    reportedTotals: [
      {
        label: "TOTAL",
        value: TOTAL,
        year: 2021,
        scope: null,
        sector: null,
        subsector: null,
        level: "total",
      },
    ],
    droppedRows: { other_page: 3 },
    importedSum,
    yearAssumed: false,
    targetYear: 2021,
    pageSelection: "reconciled",
    selectedPages: [46],
    failedPages: [17],
  });

  it("names the page only when the sum matches the document total", () => {
    expect(extractionReviewNotes(summary(TOTAL)).reconciledPages).toEqual([46]);
    const off = extractionReviewNotes(summary(TOTAL * 1.05));
    expect(off.reconciliation?.mismatch).toBe(true);
    expect(off.reconciledPages).toEqual([]);
  });

  it("lists failed pages and the drop reasons to show", () => {
    const notes = extractionReviewNotes(summary(TOTAL));
    expect(notes.failedPages).toEqual([17]);
    expect(notes.droppedReasons).toEqual(["other_page"]);
  });

  it("works with summaries stored before these fields", () => {
    const notes = extractionReviewNotes({
      reportedTotals: [],
      droppedRows: {},
      importedSum: 0,
      yearAssumed: false,
    });
    expect(notes).toEqual({
      reconciliation: null,
      reconciledPages: [],
      failedPages: [],
      droppedReasons: [],
    });
  });
});

/** Mock answering by page title; a title mapped to "throw" returns invalid JSON. */
function mockPages(
  byTitle: Record<string, ExtractedRow[] | "throw">,
): string[] {
  const seen: string[] = [];
  complete.mockImplementation(async (args) => {
    const user = (
      args as { messages: { role: string; content: string }[] }
    ).messages.find((m) => m.role === "user")!.content;
    seen.push(user);
    const title = Object.keys(byTitle).find((t) => user.includes(t));
    const answer = title ? byTitle[title] : [];
    if (answer === "throw") return { content: "not json at all" };
    return { content: JSON.stringify({ rows: answer }) };
  });
  return seen;
}

const numbers = Array.from(
  { length: 10 },
  (_, i) => `${100 + i},${100 + i}`,
).join(" ");
const page = (n: number, title: string) =>
  `<!-- page: ${n} -->\n${title}\n${numbers}\n`;

describe("4. progress over page phase and chunk fallback", () => {
  it("never moves back and ends at the total on fallback", async () => {
    mockPages({ "Chapter A": [row("I.1.1", "1", 5)], "Chapter B": [] });
    const progress: [number, number][] = [];
    const { summary } = await extractInventoryFromDocument(
      page(17, "Chapter A") + page(18, "Chapter B"),
      {
        targetYear: 2021,
        onChunkProgress: (current, total) => {
          progress.push([current, total]);
        },
      },
    );
    expect(summary.pageSelection).toBe("fallback");
    // 2 pages + 1 whole-document call.
    expect(progress.map(([, total]) => total)).toEqual([3, 3, 3]);
    expect(progress.map(([current]) => current)).toEqual([1, 2, 3]);
  });

  it("ends at the total when a page run reconciles", async () => {
    mockPages({ "Table 3-1": [grandTotal()], "Table A-1": exactTable() });
    const progress: [number, number][] = [];
    const { summary } = await extractInventoryFromDocument(
      page(15, "Table 3-1") + page(46, "Table A-1"),
      {
        targetYear: 2021,
        onChunkProgress: (current, total) => {
          progress.push([current, total]);
        },
      },
    );
    expect(summary.pageSelection).toBe("reconciled");
    expect(progress.at(-1)).toEqual([3, 3]);
    const currents = progress.map(([current]) => current);
    expect(currents).toEqual([...currents].sort((a, b) => a - b));
  });
});

describe("5. failed pages", () => {
  it("rethrows when every page fails", async () => {
    mockPages({ "Chapter A": "throw", "Chapter B": "throw" });
    await expect(
      extractInventoryFromDocument(
        page(1, "Chapter A") + page(2, "Chapter B"),
        {
          targetYear: 2021,
        },
      ),
    ).rejects.toThrow("not valid JSON");
  });

  it("records a page that fails twice and keeps the others", async () => {
    const seen = mockPages({
      "Table 3-1": [grandTotal()],
      "Chapter 4": "throw",
      "Table A-1": exactTable(),
    });
    const { summary } = await extractInventoryFromDocument(
      page(15, "Table 3-1") + page(17, "Chapter 4") + page(46, "Table A-1"),
      { targetYear: 2021 },
    );
    expect(summary.failedPages).toEqual([17]);
    expect(summary.selectedPages).toEqual([46]);
    expect(seen.filter((u) => u.includes("Chapter 4"))).toHaveLength(2);
  });

  it("retries a page once and does not record it when the retry works", async () => {
    let chapterCalls = 0;
    complete.mockImplementation(async (args) => {
      const user = (
        args as { messages: { role: string; content: string }[] }
      ).messages.find((m) => m.role === "user")!.content;
      if (user.includes("Table 3-1")) {
        return { content: JSON.stringify({ rows: [grandTotal()] }) };
      }
      chapterCalls += 1;
      if (chapterCalls === 1) return { content: "not json" };
      return { content: JSON.stringify({ rows: exactTable() }) };
    });
    const { summary } = await extractInventoryFromDocument(
      page(15, "Table 3-1") + page(46, "Table A-1"),
      { targetYear: 2021 },
    );
    expect(chapterCalls).toBe(2);
    expect(summary.failedPages).toBeUndefined();
    expect(summary.selectedPages).toEqual([46]);
  });
});

describe("6. total labels", () => {
  it("turns a line item labeled Total or Grand total into a grand total", () => {
    const { rows, summary } = finalizeExtractedRows(
      [
        row(null, null, TOTAL, { category: "Total", rowType: "line_item" }),
        row(null, null, TOTAL, { category: "Grand total" }),
        row(null, null, 4424829, {
          category: "Sub-total",
          rowType: "line_item",
        }),
        row("I.1.1", "1", 5),
      ],
      2021,
    );
    expect(rows).toHaveLength(1);
    expect(summary.reportedTotals.map((t) => [t.label, t.level])).toEqual([
      ["Total", "total"],
      ["Grand total", "total"],
      ["Sub-total", "subtotal"],
    ]);
  });
});

describe("7. hidden Total column with one scope", () => {
  it("keeps one row for I.8.1 when the Total column repeats scope 1", () => {
    const fugitive = {
      subsector: "Fugitive Emissions From Oil And Natural Gas",
    };
    const { rows, summary } = finalizeExtractedRows(
      [row("I.8.1", "1", 50718, fugitive), row("I.8.1", null, 50718, fugitive)],
      2021,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe("1");
    expect(summary.importedSum).toBe(50718);
  });

  it("keeps an unscoped row that only nearly matches a single scoped row", () => {
    const { rows } = finalizeExtractedRows(
      [row("I.8.1", "1", 50718), row("I.8.1", null, 50800)],
      2021,
    );
    expect(rows).toHaveLength(2);
  });

  it("does not hide a row with a total of another year", () => {
    const { rows } = finalizeExtractedRows(
      [
        row("I.8.1", "1", 50718, { year: 2021 }),
        row("I.8.1", null, 50718, { year: 2016 }),
      ],
      2021,
    );
    // The 2016 row is dropped by the year filter, not counted as a total.
    expect(rows).toHaveLength(1);
  });
});

describe("8. reference against the scope column", () => {
  it("drops a reference whose taxonomy scope differs from the row scope", () => {
    expect(canonicalGpcRefNo("I.1.1", "2")).toBeNull();
    expect(canonicalGpcRefNo("I.1.2", "2")).toBe("I.1.2");
    // Waste scope 3 is III.1.2: the taxonomy scope, not the last digit.
    expect(canonicalGpcRefNo("III.1.2", "3")).toBe("III.1.2");
    expect(canonicalGpcRefNo("III.1.2", "1")).toBeNull();
    // I.4.4 has no scope in the taxonomy and stays.
    expect(canonicalGpcRefNo("I.4.4", "1")).toBe("I.4.4");
  });

  it("resolves the dropped reference from sub-sector and scope", async () => {
    complete.mockResolvedValue({
      content: JSON.stringify({
        rows: [
          {
            year: 2021,
            sector: SE,
            subsector: "Residential Buildings",
            category: "Residential Buildings",
            scope: "2",
            gpcRefNo: "I.1.1",
            totalCO2e: 450523,
            rowType: "line_item",
          },
        ],
      }),
    });
    const { rows } = await extractInventoryFromDocument("Table A-1 only", {
      targetYear: 2021,
    });
    expect(rows[0].gpcRefNo).toBe("I.1.2");
  });
});
