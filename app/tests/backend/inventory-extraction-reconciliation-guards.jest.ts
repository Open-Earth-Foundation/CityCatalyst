/**
 * CC-1163: guards around total reconciliation. The LLM is mocked; these tests
 * prove the code around the model.
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

/** The model answers every call with these rows (numbers as strings). */
function mockRows(rows: Record<string, unknown>[]) {
  complete.mockImplementation(async () => ({
    content: JSON.stringify({ rows }),
  }));
}

/** A line item and a printed grand total, both as the string `value`. */
const stringRows = (value: string) => [
  {
    year: 2021,
    sector: "Stationary Energy",
    subsector: "Residential Buildings",
    scope: "1",
    gpcRefNo: "I.1.1",
    totalCO2e: value,
    rowType: "line_item",
  },
  {
    year: 2021,
    sector: null,
    subsector: null,
    category: "BASIC+",
    totalCO2e: value,
    rowType: "total",
  },
];

describe("CC-1163 number strings", () => {
  it("european page: a string 1.500 imports 1500", async () => {
    mockRows(stringRows("1.500"));
    const text =
      "<!-- page: 1 -->\nGPC table\n" +
      "1.234.567 2.345.678 3.456.789 4.567.890 5.678.901 6.789.012 " +
      "7.890.123 8.901.234\nTotal 1.500\n";
    const { rows } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(rows[0].totalCO2e).toBe(1500);
  });

  it("english page: a string 1,5 imports 1.5", async () => {
    mockRows(stringRows("1,5"));
    const text =
      "<!-- page: 1 -->\nGPC table\n" +
      "1,234,567 2,345,678 3,456,789 4,567,890 5,678,901 6,789,012 " +
      "7,890,123 8,901,234\nTotal 1,5\n";
    const { rows } = await extractInventoryFromDocument(text, {
      targetYear: 2021,
    });
    expect(rows[0].totalCO2e).toBe(1.5);
  });
});
