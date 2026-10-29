/**
 * CC-1191: a response cut off at the token limit must never become a shorter
 * row list. A page is retried once, then reported as failed; a whole-document
 * call or chunk is retried once, then fails the import. Also covers the
 * reasoning effort setting and the per-call log line. The LLM is mocked.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

type Answer = { content: string; finishReason?: string; usage?: object };
const complete = jest.fn<(args: unknown) => Promise<Answer>>();

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

const { extractInventoryFromDocument } =
  await import("@/backend/InventoryExtractionService");
const { logger } = await import("@/services/logger");
type ExtractedRow = import("@/backend/InventoryExtractionService").ExtractedRow;

const TOTAL = 9559215;

const row = (
  gpcRefNo: string | null,
  scope: string | null,
  totalCO2e: number,
  extra: Partial<ExtractedRow> = {},
): ExtractedRow => ({
  year: 2021,
  sector: "Stationary Energy",
  subsector: "Residential Buildings",
  category: null,
  totalCO2e,
  scope,
  gpcRefNo,
  ...extra,
});

const grandTotal = (): ExtractedRow =>
  row(null, null, TOTAL, {
    sector: null,
    subsector: null,
    rowType: "total",
    category: "BASIC+",
  });

const exactTable = (): ExtractedRow[] => [
  row("I.1.1", "1", 9000000),
  row("I.1.2", "2", TOTAL - 9000000),
];

const numbers = Array.from(
  { length: 10 },
  (_, i) => `${100 + i},${100 + i}`,
).join(" ");
const page = (n: number, title: string) =>
  `<!-- page: ${n} -->\n${title}\n${numbers}\n`;
const document =
  page(15, "Table 3-1") + page(17, "Chapter 4") + page(46, "Table A-1");

/** JSON of two rows cut after the first row, as a model stopped at the limit writes it. */
const cutOff = (rows: ExtractedRow[]) =>
  JSON.stringify({ rows }).replace(/,\{[^{}]*\}\]\}$/, "");

/** Answer by page title; Chapter 4 gets `chapter`. */
function mockPages(chapter: Answer): string[] {
  const seen: string[] = [];
  complete.mockImplementation(async (args) => {
    const user = (
      args as { messages: { role: string; content: string }[] }
    ).messages.find((m) => m.role === "user")!.content;
    seen.push(user);
    if (user.includes("Chapter 4")) return chapter;
    const rows = user.includes("Table 3-1")
      ? [grandTotal()]
      : user.includes("Table A-1")
        ? exactTable()
        : [];
    return { content: JSON.stringify({ rows }), finishReason: "stop" };
  });
  return seen;
}

beforeEach(() => {
  complete.mockReset();
});

afterEach(() => {
  delete process.env.LLM_EXTRACTION_REASONING_EFFORT;
  jest.restoreAllMocks();
});

describe("cut-off response", () => {
  const chapterRows = [
    row("II.1.1", "1", 400000, { sector: "Transportation" }),
    row("II.1.2", "2", 250000, { sector: "Transportation" }),
  ];

  it("fixture is cut JSON that the old repair would have closed", () => {
    const text = cutOff(chapterRows);
    expect(() => JSON.parse(text)).toThrow();
    expect(JSON.parse(text + "]}").rows).toHaveLength(1);
  });

  it("finish_reason length: no rows from the page, retried once, page failed", async () => {
    const seen = mockPages({
      content: cutOff(chapterRows),
      finishReason: "length",
    });
    const { rows, summary } = await extractInventoryFromDocument(document, {
      targetYear: 2021,
    });
    expect(summary.failedPages).toEqual([17]);
    expect(seen.filter((u) => u.includes("Chapter 4"))).toHaveLength(2);
    expect(rows.some((r) => r.gpcRefNo?.startsWith("II."))).toBe(false);
  });

  it("finish_reason length fails the call even when the JSON is complete", async () => {
    mockPages({
      content: JSON.stringify({ rows: chapterRows }),
      finishReason: "length",
    });
    const { summary } = await extractInventoryFromDocument(document, {
      targetYear: 2021,
    });
    expect(summary.failedPages).toEqual([17]);
  });

  it("cut JSON without a finish reason is not repaired into fewer rows", async () => {
    mockPages({ content: cutOff(chapterRows) });
    const { rows, summary } = await extractInventoryFromDocument(document, {
      targetYear: 2021,
    });
    expect(summary.failedPages).toEqual([17]);
    expect(rows.some((r) => r.gpcRefNo?.startsWith("II."))).toBe(false);
  });

  it("finish_reason length, then a complete retry: rows kept, no failed page", async () => {
    let chapterCalls = 0;
    complete.mockImplementation(async (args) => {
      const user = (
        args as { messages: { role: string; content: string }[] }
      ).messages.find((m) => m.role === "user")!.content;
      if (user.includes("Chapter 4")) {
        chapterCalls++;
        return chapterCalls === 1
          ? { content: cutOff(exactTable()), finishReason: "length" }
          : {
              content: JSON.stringify({ rows: exactTable() }),
              finishReason: "stop",
            };
      }
      const rows = user.includes("Table 3-1") ? [grandTotal()] : [];
      return { content: JSON.stringify({ rows }), finishReason: "stop" };
    });
    const { rows, summary } = await extractInventoryFromDocument(document, {
      targetYear: 2021,
    });
    expect(chapterCalls).toBe(2);
    expect(summary.failedPages).toBeUndefined();
    expect(summary.selectedPages).toEqual([17]);
    expect(rows.map((r) => r.gpcRefNo).sort()).toEqual(["I.1.1", "I.1.2"]);
  });

  it("a complete response still parses", async () => {
    mockPages({
      content: JSON.stringify({ rows: [] }),
      finishReason: "stop",
    });
    const { rows, summary } = await extractInventoryFromDocument(document, {
      targetYear: 2021,
    });
    expect(summary.failedPages).toBeUndefined();
    expect(summary.selectedPages).toEqual([46]);
    expect(rows.map((r) => r.gpcRefNo).sort()).toEqual(["I.1.1", "I.1.2"]);
  });
});

describe("cut-off response on the chunk path", () => {
  // No page has enough numbers to be a candidate, so extraction skips the page
  // path: one whole-document call, or chunks above 50k characters.
  const cases = [
    ["single call", "Inventory report without tables.\n", 1],
    ["multi-chunk", "word ".repeat(12_000), 2],
  ] as const;
  const answer = (cut: boolean): Answer =>
    cut
      ? { content: cutOff(exactTable()), finishReason: "length" }
      : {
          content: JSON.stringify({ rows: exactTable() }),
          finishReason: "stop",
        };

  it.each(cases)(
    "%s: a cut call is retried once and its rows are imported",
    async (_name, text, chunkCount) => {
      let calls = 0;
      complete.mockImplementation(async () => answer(++calls === 1));
      const { rows } = await extractInventoryFromDocument(text, {
        targetYear: 2021,
      });
      expect(calls).toBe(chunkCount + 1);
      expect(rows.map((r) => r.gpcRefNo).sort()).toEqual(["I.1.1", "I.1.2"]);
    },
  );

  it.each(cases)(
    "%s: a call cut twice rejects the import",
    async (_name, text) => {
      complete.mockImplementation(async () => answer(true));
      await expect(
        extractInventoryFromDocument(text, { targetYear: 2021 }),
      ).rejects.toThrow("cut off at the token limit");
    },
  );
});

describe("reasoning effort", () => {
  const sentEffort = () =>
    (complete.mock.calls[0][0] as { reasoningEffort?: string }).reasoningEffort;

  it("is read from LLM_EXTRACTION_REASONING_EFFORT", async () => {
    process.env.LLM_EXTRACTION_REASONING_EFFORT = "low";
    mockPages({ content: JSON.stringify({ rows: [] }) });
    await extractInventoryFromDocument(document, { targetYear: 2021 });
    expect(sentEffort()).toBe("low");
  });

  it("is left to the provider when unset", async () => {
    mockPages({ content: JSON.stringify({ rows: [] }) });
    await extractInventoryFromDocument(document, { targetYear: 2021 });
    expect(sentEffort()).toBeUndefined();
  });
});

describe("call log", () => {
  it("logs model, finish reason, tokens and duration without document text", async () => {
    const info = jest.spyOn(logger, "info");
    complete.mockResolvedValue({
      content: JSON.stringify({ rows: [] }),
      finishReason: "stop",
      usage: {
        promptTokens: 1200,
        completionTokens: 300,
        reasoningTokens: 200,
      },
      model: "gpt-6.1-terra",
    } as Answer);
    await extractInventoryFromDocument(document, { targetYear: 2021 });
    const calls = info.mock.calls.filter(
      (call) => call[1] === "Extraction LLM call finished",
    );
    expect(calls.length).toBeGreaterThan(0);
    const entry = calls[0][0] as Record<string, unknown>;
    expect(entry).toMatchObject({
      model: "gpt-6.1-terra",
      finishReason: "stop",
      promptTokens: 1200,
      completionTokens: 300,
      reasoningTokens: 200,
    });
    expect(typeof entry.durationMs).toBe("number");
    expect(JSON.stringify(entry)).not.toContain("Table A-1");
  });
});
