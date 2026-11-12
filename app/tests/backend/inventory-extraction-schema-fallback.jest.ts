/**
 * CC-1162: PDF extraction asks for a strict json_schema and falls back to
 * jsonMode once per extraction when the provider rejects the schema.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const complete =
  jest.fn<(args: Record<string, unknown>) => Promise<{ content: string }>>();
const warn = jest.fn();

jest.unstable_mockModule("@/backend/llm", () => ({
  createLLMClient: () => ({ complete }),
  LLMError: class LLMError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  LLMErrorCode: { BAD_REQUEST: "LLM_BAD_REQUEST" },
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { warn, info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const { extractInventoryFromDocument } =
  await import("@/backend/InventoryExtractionService");
const { EXTRACTION_RESPONSE_SCHEMA } =
  await import("@/backend/extraction-response-schema");
const { LLMError } = await import("@/backend/llm");

const row = {
  year: 2022,
  sector: "Stationary Energy",
  subsector: "Residential Buildings",
  category: "Natural gas",
  totalCO2e: 100,
  unit: "t",
  rowType: "line_item",
  scope: "1",
  gpcRefNo: "I.1.1",
  source: "Table 1",
};
const ok = { content: JSON.stringify({ rows: [row] }) };
const rejection = () =>
  new LLMError(
    "Invalid schema for response_format",
    "LLM_BAD_REQUEST" as never,
  );
const WARNING = "Extraction structured output rejected; using jsonMode";
const SHORT = "Residential natural gas 100 t";
const LONG = "x".repeat(100_000);

beforeEach(() => {
  complete.mockReset();
  warn.mockReset();
});

describe("structured output with jsonMode fallback", () => {
  it("sends the strict schema first", async () => {
    complete.mockResolvedValue(ok);
    await extractInventoryFromDocument(SHORT);
    expect(complete.mock.calls[0][0].jsonSchema).toBe(
      EXTRACTION_RESPONSE_SCHEMA,
    );
    expect(complete.mock.calls[0][0].jsonMode).toBeUndefined();
  });

  it("retries the same segment with jsonMode when the schema is rejected", async () => {
    complete.mockRejectedValueOnce(rejection()).mockResolvedValue(ok);
    const result = await extractInventoryFromDocument(SHORT);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][0].jsonMode).toBe(true);
    expect(complete.mock.calls[1][0].jsonSchema).toBeUndefined();
    expect(result.rows.length).toBe(1);
  });

  it("sends no schema after a rejection and warns once", async () => {
    process.env.LLM_CHUNK_CONCURRENCY = "1";
    try {
      complete.mockRejectedValueOnce(rejection()).mockResolvedValue(ok);
      await extractInventoryFromDocument(LONG);
      expect(complete.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(complete.mock.calls.slice(1).every((c) => !c[0].jsonSchema)).toBe(
        true,
      );
      expect(warn.mock.calls.filter((c) => c[1] === WARNING)).toHaveLength(1);
    } finally {
      delete process.env.LLM_CHUNK_CONCURRENCY;
    }
  });

  it("warns once when concurrent chunks are all rejected", async () => {
    complete.mockImplementation(async (args) => {
      if (args.jsonSchema) throw rejection();
      return ok;
    });
    await extractInventoryFromDocument(LONG);
    expect(warn.mock.calls.filter((c) => c[1] === WARNING)).toHaveLength(1);
  });

  it("does not treat an unrelated bad request as a schema rejection", async () => {
    complete.mockRejectedValue(
      new LLMError("prompt too long", "LLM_BAD_REQUEST" as never),
    );
    await expect(extractInventoryFromDocument(SHORT)).rejects.toThrow(
      "prompt too long",
    );
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
