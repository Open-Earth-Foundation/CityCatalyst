import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  convertPdfUrlToMarkdown,
  mergeMistralPages,
  MistralOcrError,
} from "@/backend/MistralOcrService";
import { getPdfOcrRetryDelayMs } from "@/backend/pdf-ocr-config";

describe("Mistral OCR Markdown conversion", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.MISTRAL_API_KEY;
  });

  it("orders pages, preserves blank pages and inline tables, and marks pages", () => {
    const result = mergeMistralPages(
      {
        model: "mistral-ocr-2505",
        pages: [
          {
            index: 2,
            markdown: "| Value | tCO2e |\n|---|---:|\n| Fuel | 12.50 |",
          },
          { index: 0, markdown: "# Inventory\nNarrative" },
          { index: 1, markdown: "" },
        ],
      },
      "mistral-ocr-latest",
    );
    expect(result.pageCount).toBe(3);
    expect(result.model).toBe("mistral-ocr-2505");
    expect(result.markdown).toBe(
      "<!-- page: 1 -->\n# Inventory\nNarrative\n\n" +
        "<!-- page: 2 -->\n\n\n" +
        "<!-- page: 3 -->\n| Value | tCO2e |\n|---|---:|\n| Fuel | 12.50 |",
    );
  });

  it.each([
    { pages: [] },
    { pages: [{ index: 0, markdown: "" }] },
    { pages: [{ index: 1, markdown: "content" }] },
    {
      pages: [
        { index: 0, markdown: "a" },
        { index: 0, markdown: "b" },
      ],
    },
  ])("rejects malformed or entirely empty results", (payload) => {
    expect(() => mergeMistralPages(payload, "model")).toThrow(MistralOcrError);
  });

  it("uses a presigned document URL, disables image payloads, and leaves table defaults unset", async () => {
    process.env.MISTRAL_API_KEY = "secret";
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "returned-model",
          pages: [{ index: 0, markdown: "ok" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await convertPdfUrlToMarkdown("https://s3.example/presigned");
    const request = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(request.document).toEqual({
      type: "document_url",
      document_url: "https://s3.example/presigned",
    });
    expect(request.include_image_base64).toBe(false);
    expect(request.table_format).toBeUndefined();
  });

  it.each([429, 500, 503])(
    "classifies HTTP %s as retryable",
    async (status) => {
      process.env.MISTRAL_API_KEY = "secret";
      jest
        .spyOn(global, "fetch")
        .mockResolvedValue(new Response("", { status }));
      await expect(
        convertPdfUrlToMarkdown("https://example.test/pdf"),
      ).rejects.toMatchObject({
        retryable: true,
      });
    },
  );

  it("retries transient failures three total attempts after 60 seconds and 5 minutes", () => {
    expect(getPdfOcrRetryDelayMs(1, true)).toBe(60_000);
    expect(getPdfOcrRetryDelayMs(2, true)).toBe(300_000);
    expect(getPdfOcrRetryDelayMs(3, true)).toBeNull();
    expect(getPdfOcrRetryDelayMs(1, false)).toBeNull();
  });
});
