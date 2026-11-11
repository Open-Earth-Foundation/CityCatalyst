/**
 * CC-1163: user number format and reported total in PDF
 * extraction. The LLM is mocked; these tests prove the code around the model.
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

const { extractInventoryFromDocument } =
  await import("@/backend/InventoryExtractionService");

beforeEach(() => {
  complete.mockReset();
});

const meta = (over: Record<string, unknown> = {}) => ({
  numberFormat: null,
  numberFormatSource: null,
  reportedTotal: null,
  reportedTotalKind: null,
  ...over,
});

const row = (value: string | number, over: Record<string, unknown> = {}) => ({
  year: 2021,
  sector: "Stationary Energy",
  subsector: "Residential Buildings",
  scope: "1",
  gpcRefNo: "I.1.1",
  totalCO2e: value,
  rowType: "line_item",
  ...over,
});

const totalRow = (value: number) => ({
  year: 2021,
  sector: null,
  subsector: null,
  category: "Total",
  totalCO2e: value,
  rowType: "total",
});

/** The model answers by the PAGE_n tag it finds in the user message. */
function mockByPage(byPage: Record<number, Record<string, unknown>[]>) {
  complete.mockImplementation(async (args: unknown) => {
    const messages = (args as { messages: { content: string }[] }).messages;
    const user = messages[messages.length - 1].content;
    const marker = /PAGE_(\d+)/.exec(user);
    const rows = marker ? (byPage[Number(marker[1])] ?? []) : [];
    return { content: JSON.stringify({ rows }) };
  });
}

const manyNumbers = (style: "european" | "english", tag: string) => {
  const sep = style === "european" ? "." : ",";
  const nums = [
    `1${sep}234${sep}567`,
    `2${sep}345${sep}678`,
    `3${sep}456${sep}789`,
    `4${sep}567${sep}890`,
    `5${sep}678${sep}901`,
    `6${sep}789${sep}012`,
    `7${sep}890${sep}123`,
    `8${sep}901${sep}234`,
  ];
  return `${tag}\n${nums.join(" ")}\n`;
};

const onePage = (n: number, body: string) => `<!-- page: ${n} -->\n${body}`;

describe("number style from metadata", () => {
  const page = (style: "european" | "english") =>
    onePage(1, manyNumbers(style, "PAGE_1")) + onePage(2, "intro\n");

  it("user english style reads 1.500 as 1.5", async () => {
    mockByPage({ 1: [row("1.500")] });
    const text =
      onePage(1, manyNumbers("english", "PAGE_1") + "| I.1.1 | 1.500 |\n") +
      onePage(2, "x\n");
    const english = await extractInventoryFromDocument(text, {
      targetYear: 2021,
      sourceMetadata: meta({
        numberFormat: "english",
        numberFormatSource: "user",
      }),
    });
    expect(english.rows[0].totalCO2e).toBe(1.5);
    const european = await extractInventoryFromDocument(text, {
      targetYear: 2021,
      sourceMetadata: meta({
        numberFormat: "european",
        numberFormatSource: "user",
      }),
    });
    expect(european.rows[0].totalCO2e).toBe(1500);
  });

  it("country default yields to detection", async () => {
    mockByPage({ 1: [row("1.500")] });
    const result = await extractInventoryFromDocument(page("european"), {
      targetYear: 2021,
      sourceMetadata: meta({
        numberFormat: "english",
        numberFormatSource: "country_default",
      }),
    });
    expect(result.rows[0].totalCO2e).toBe(1500);
  });

  const prompts = () =>
    complete.mock.calls
      .map((call) => {
        const messages = (call[0] as { messages: { content: string }[] })
          .messages;
        return messages.map((m) => m.content).join("\n");
      })
      .join("\n");

  it("country default does not instruct the model when the document has its own style", async () => {
    mockByPage({ 1: [row("1.500")] });
    const result = await extractInventoryFromDocument(page("european"), {
      targetYear: 2021,
      sourceMetadata: meta({
        numberFormat: "english",
        numberFormatSource: "country_default",
      }),
    });
    expect(result.rows[0].totalCO2e).toBe(1500);
    expect(prompts()).not.toContain('use "." as the decimal separator');
    expect(result.summary.numberFormatConflict).toBeUndefined();
  });

  it("country default decides when the document has no detectable style", async () => {
    mockByPage({ 1: [row("1.500")] });
    const text =
      onePage(1, "PAGE_1\n| I.1.1 | 1.500 |\n") + onePage(2, "x\n");
    const result = await extractInventoryFromDocument(text, {
      targetYear: 2021,
      sourceMetadata: meta({
        numberFormat: "european",
        numberFormatSource: "country_default",
      }),
    });
    expect(result.rows[0].totalCO2e).toBe(1500);
    expect(prompts()).toContain('use "," as the decimal separator');
  });

  it("conflict is recorded for user choice only", async () => {
    mockByPage({ 1: [row("1.500")] });
    const user = await extractInventoryFromDocument(page("european"), {
      targetYear: 2021,
      sourceMetadata: meta({
        numberFormat: "english",
        numberFormatSource: "user",
      }),
    });
    expect(user.summary.numberFormatConflict).toEqual({
      chosen: "english",
      detected: "european",
    });
    const fallback = await extractInventoryFromDocument(page("european"), {
      targetYear: 2021,
      sourceMetadata: meta({
        numberFormat: "english",
        numberFormatSource: "country_default",
      }),
    });
    expect(fallback.summary.numberFormatConflict).toBeUndefined();
  });

  it("user total copied to summary", async () => {
    mockByPage({ 1: [row(1500)] });
    const result = await extractInventoryFromDocument(page("english"), {
      targetYear: 2021,
      sourceMetadata: meta({
        reportedTotal: 7453238,
        reportedTotalKind: "gross",
      }),
    });
    expect(result.summary.userReportedTotal).toEqual({
      value: 7453238,
      kind: "gross",
    });
  });

  it("no metadata leaves the summary fields unset", async () => {
    mockByPage({ 1: [row(1500)] });
    const result = await extractInventoryFromDocument(page("english"), {
      targetYear: 2021,
    });
    expect(result.summary.userReportedTotal).toBeUndefined();
    expect(result.summary.numberFormatConflict).toBeUndefined();
  });
});
