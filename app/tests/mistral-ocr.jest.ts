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
            dimensions: { width: 100, height: 100 },
            blocks: [],
          },
          {
            index: 0,
            markdown: "# Inventory\nNarrative",
            dimensions: { width: 100, height: 100 },
            blocks: [],
          },
          {
            index: 1,
            markdown: "",
            dimensions: { width: 100, height: 100 },
            blocks: [],
          },
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

  it.each(["none", "visual_context"] as const)(
    "inserts separated page-local tables for annotation mode %s",
    (annotationMode) => {
      const response = {
        model: "mistral-ocr-2505",
        pages: [
          {
            index: 0,
            markdown:
              "Before\n\n[tbl-0.md](tbl-0.md)\n\nBetween\n\n[tbl-1.md](tbl-1.md)",
            dimensions: { width: 100, height: 100 },
            blocks: [],
            tables: [
              {
                id: "tbl-0",
                content: "| Fuel | tCO2e |\n|---|---:|\n| Gas | 12.50 |",
              },
              {
                id: "tbl-1",
                content: "| Year | tCO2e |\n|---|---:|\n| 2024 | 8.25 |",
              },
            ],
          },
          {
            index: 1,
            markdown: "[Source](https://example.org/source.pdf)",
            dimensions: { width: 100, height: 100 },
            blocks: [],
          },
        ],
      };

      const result = mergeMistralPages(response, "model", annotationMode);

      expect(result.markdown).toBe(
        "<!-- page: 1 -->\nBefore\n\n" +
          "| Fuel | tCO2e |\n|---|---:|\n| Gas | 12.50 |" +
          "\n\nBetween\n\n" +
          "| Year | tCO2e |\n|---|---:|\n| 2024 | 8.25 |" +
          "\n\n<!-- page: 2 -->\n[Source](https://example.org/source.pdf)",
      );
      expect(result.structured.provider.payload).toEqual(response);
      expect(result.structured.document.pages[0].tables).toEqual([
        expect.objectContaining({
          table_id: "tbl-0",
          content: "| Fuel | tCO2e |\n|---|---:|\n| Gas | 12.50 |",
        }),
        expect.objectContaining({
          table_id: "tbl-1",
          content: "| Year | tCO2e |\n|---|---:|\n| 2024 | 8.25 |",
        }),
      ]);
    },
  );

  it.each([
    {
      name: "missing table",
      pages: [{ index: 0, markdown: "[tbl-0.md](tbl-0.md)", tables: [] }],
      code: "missing_table_reference",
    },
    {
      name: "cross-page table",
      pages: [
        { index: 0, markdown: "[tbl-0.md](tbl-0.md)" },
        {
          index: 1,
          markdown: "table",
          tables: [{ id: "tbl-0", content: "| A |\n|---|" }],
        },
      ],
      code: "cross_page_table_reference",
    },
    {
      name: "duplicate table ID on multiple pages",
      pages: [
        {
          index: 0,
          markdown: "[tbl-0.md](tbl-0.md)",
          tables: [{ id: "tbl-0", content: "| A |\n|---|" }],
        },
        {
          index: 1,
          markdown: "[tbl-0.md](tbl-0.md)",
          tables: [{ id: "tbl-0", content: "| B |\n|---|" }],
        },
      ],
      code: "invalid_table_reference",
    },
    {
      name: "duplicate placeholder",
      pages: [
        {
          index: 0,
          markdown: "[tbl-0.md](tbl-0.md)\n[tbl-0.md](tbl-0.md)",
          tables: [{ id: "tbl-0", content: "| A |\n|---|" }],
        },
      ],
      code: "invalid_table_reference",
    },
    {
      name: "contentless table",
      pages: [
        {
          index: 0,
          markdown: "[tbl-0.md](tbl-0.md)",
          tables: [{ id: "tbl-0", content: " \n " }],
        },
      ],
      code: "invalid_table_reference",
    },
    {
      name: "unplaced table",
      pages: [
        {
          index: 0,
          markdown: "Narrative",
          tables: [{ id: "tbl-0", content: "| A |\n|---|" }],
        },
      ],
      code: "unplaced_table",
    },
  ])("rejects $name references", ({ pages, code }) => {
    const payload = {
      pages: pages.map((page) => ({
        dimensions: { width: 100, height: 100 },
        blocks: [],
        ...page,
      })),
    };

    expect(() => mergeMistralPages(payload, "model")).toThrow(
      expect.objectContaining({ code, retryable: true }),
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

  it("requests structural OCR fields and keeps annotation off by default", async () => {
    process.env.MISTRAL_API_KEY = "secret";
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "returned-model",
          pages: [
            {
              index: 0,
              markdown: "ok",
              dimensions: { width: 10, height: 10 },
              blocks: [],
            },
          ],
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
    expect(request.include_blocks).toBe(true);
    expect(request.table_format).toBe("markdown");
    expect(request.extract_header).toBe(true);
    expect(request.extract_footer).toBe(true);
    expect(request.bbox_annotation_format).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain('image_base64":true');
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
