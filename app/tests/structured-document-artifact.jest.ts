import { describe, expect, it } from "@jest/globals";
import { buildStructuredDocument } from "@/backend/StructuredDocumentArtifact";
import { VISUAL_ANNOTATION_SCHEMA_VERSION } from "@/backend/MistralVisualAnnotation";

const annotation = {
  schema_version: VISUAL_ANNOTATION_SCHEMA_VERSION,
  kind: "chart",
  title: "Sector trend",
  short_description: "Line chart of three sectors.",
  text_visible: ["Transport"],
  chart: {
    chart_type: "line",
    x_axis: { label: "Year", values: [2020, 2025] },
    y_axis: { label: "Emissions", unit: "ktCO2e", scale: "linear" },
    legend: ["Transport"],
    series: [],
    trends: ["Transport declines", "Falls below 35 kt"],
    targets: [],
    callouts: [],
    readable_values: [],
  },
  uncertainties: [],
};

function response(annotationMode: "none" | "visual_context" = "none") {
  return buildStructuredDocument(
    {
      model: "mistral-ocr-latest",
      usage_info: { pages_processed: 1 },
      pages: [
        {
          index: 0,
          markdown: "# Title\n\n![img-0.jpeg](img-0.jpeg)\n\nFigure 1. Chart caption.",
          header: "Synthetic header",
          footer: null,
          dimensions: { width: 1000, height: 1000, dpi: 72 },
          blocks: [
            {
              type: "title",
              level: 1,
              content: "# Title",
              top_left_x: 10,
              top_left_y: 10,
              bottom_right_x: 200,
              bottom_right_y: 40,
            },
            {
              type: "text",
              content: "Narrative",
              top_left_x: 10,
              top_left_y: 50,
              bottom_right_x: 200,
              bottom_right_y: 80,
            },
            {
              type: "image",
              content: "![img-0.jpeg](img-0.jpeg)",
              top_left_x: 100,
              top_left_y: 100,
              bottom_right_x: 500,
              bottom_right_y: 400,
            },
            {
              type: "caption",
              content: "Figure 1. Chart caption.",
              top_left_x: 100,
              top_left_y: 410,
              bottom_right_x: 500,
              bottom_right_y: 440,
            },
          ],
          images: [
            {
              id: "img-0.jpeg",
              top_left_x: 100,
              top_left_y: 100,
              bottom_right_x: 500,
              bottom_right_y: 400,
              image_base64: "not-a-real-image",
              image_annotation: annotationMode === "visual_context" ? annotation : null,
            },
          ],
          tables: [{ id: "table-1", markdown: "| A | 1 |" }],
        },
      ],
    },
    { annotationMode, requestedModel: "mistral-ocr-latest" },
  );
}

describe("structured document artifact", () => {
  it("keeps provider facts, derived hierarchy, and strips binary payloads", () => {
    const document = response("none");
    expect(document.schema_version).toBe("citycatalyst.structured-document.1");
    expect(document.provider.payload).toMatchObject({
      usage_info: { pages_processed: 1 },
    });
    expect(JSON.stringify(document.provider.payload)).not.toContain(
      "not-a-real-image",
    );
    expect(document.document.pages[0].images[0].image_sha256).toHaveLength(64);
    expect(document.document.pages[0].blocks[1].hierarchy).toEqual({
      level: null,
      parent_block_id: "p0-b0",
      provenance: "derived",
    });
    expect(document.document.relationships).toEqual([
      expect.objectContaining({
        provenance: "derived",
        rule: "nearest_caption_same_page",
        type: "caption_of_image",
      }),
    ]);
    expect(document.document.pages[0].blocks[0].reading_order_index).toBe(0);
  });

  it("stores requested annotations as unverified image annotations", () => {
    const document = response("visual_context");
    const stored = document.document.pages[0].images[0].annotation;
    expect(stored).toMatchObject({
      source: "image_annotation",
      quantitative_reliability: "unverified",
      page_index: 0,
      image_id: "img-0.jpeg",
    });
    expect(stored?.provider_annotation).toEqual(annotation);
    expect(stored?.provider_annotation).not.toHaveProperty(
      "quantitative_reliability",
    );
  });

  it("preserves English and Portuguese values, empty strings, and null fields", () => {
    const richAnnotation = {
      schema_version: VISUAL_ANNOTATION_SCHEMA_VERSION,
      kind: "chart",
      title: "Emissões setoriais / Sector emissions",
      short_description: "",
      text_visible: ["Transport", "12.5%", "Resíduos"],
      chart: {
        chart_type: "line",
        x_axis: { label: "Year", values: [2020, null] },
        y_axis: { label: "Emissions", unit: "ktCO2e", scale: "linear" },
        legend: ["Transport", "Waste"],
        series: [
          {
            name: "Transport",
            points: [{ x: 2020, y: 12.5, value_kind: "printed" as const }],
          },
        ],
        trends: ["Transport declines", "Queda de 12.5%"],
        targets: [{ label: "2030", value: "12.5%", value_kind: "printed" as const }],
        callouts: [],
        readable_values: [
          { label: "Fuel", value: null, value_kind: "unreadable" as const },
        ],
      },
      uncertainties: [],
    };
    const document = buildStructuredDocument(
      {
        model: "mistral-ocr-latest",
        pages: [
          {
            index: 0,
            markdown: "![img-0.jpeg](img-0.jpeg)",
            dimensions: { width: 1000, height: 1000, dpi: 72 },
            blocks: [],
            images: [
              {
                id: "img-0.jpeg",
                top_left_x: 100,
                top_left_y: 100,
                bottom_right_x: 500,
                bottom_right_y: 400,
                image_annotation: richAnnotation,
              },
            ],
            tables: [],
          },
        ],
      },
      { annotationMode: "visual_context", requestedModel: "mistral-ocr-latest" },
    );
    const stored = document.document.pages[0].images[0].annotation;
    expect(stored?.source).toBe("image_annotation");
    expect(stored?.quantitative_reliability).toBe("unverified");
    expect(stored?.provider_annotation).toEqual(richAnnotation);
    expect(stored?.provider_annotation.short_description).toBe("");
    expect(stored?.provider_annotation.title).toBe(
      "Emissões setoriais / Sector emissions",
    );
    expect(JSON.stringify(document.provider.payload)).not.toContain(
      "image_base64",
    );
  });

  it("fails the attempt when a requested image annotation is missing", () => {
    expect(() => response("none")).not.toThrow();
    expect(() =>
      buildStructuredDocument(
        {
          pages: [
            {
              index: 0,
              markdown: "page",
              dimensions: { width: 10, height: 10 },
              blocks: [],
              images: [
                {
                  id: "img",
                  top_left_x: 0,
                  top_left_y: 0,
                  bottom_right_x: 1,
                  bottom_right_y: 1,
                },
              ],
            },
          ],
        },
        { annotationMode: "visual_context", requestedModel: "model" },
      ),
    ).toThrow(/missing/i);
  });

  it("accepts a requested annotation run with zero images", () => {
    const document = buildStructuredDocument(
      {
        pages: [
          {
            index: 0,
            markdown: "text",
            dimensions: { width: 10, height: 10 },
            blocks: [],
            images: [],
          },
        ],
      },
      { annotationMode: "visual_context", requestedModel: "model" },
    );
    expect(document.document.pages[0].images).toEqual([]);
  });

  it("keeps OCR 4.1 table identity and average content confidence", () => {
    const document = buildStructuredDocument(
      {
        model: "mistral-ocr-4-1",
        pages: [
          {
            index: 0,
            markdown: "![img-0.jpeg](img-0.jpeg)",
            dimensions: { width: 1000, height: 1400 },
            blocks: [
              {
                type: "table",
                table_id: "tbl-0.md",
                content: "| Sector | Direction |",
                confidence_scores: {
                  average_content_confidence_score: 0.99,
                  minimum_content_confidence_score: 0.5,
                  block_type_confidence_score: 1,
                },
                top_left_x: 10,
                top_left_y: 20,
                bottom_right_x: 400,
                bottom_right_y: 200,
              },
              {
                type: "image",
                image_id: "img-0.jpeg",
                content: "![img-0.jpeg](img-0.jpeg)",
                confidence_scores: {
                  minimum_content_confidence_score: 0.4,
                },
                top_left_x: 10,
                top_left_y: 220,
                bottom_right_x: 300,
                bottom_right_y: 500,
              },
            ],
            tables: [{ id: "tbl-0.md", content: "| Sector | Direction |" }],
            images: [
              {
                id: "img-0.jpeg",
                top_left_x: 10,
                top_left_y: 220,
                bottom_right_x: 300,
                bottom_right_y: 500,
              },
            ],
          },
        ],
      },
      { annotationMode: "none", requestedModel: "mistral-ocr-4-1" },
    );
    const [tableBlock, imageBlock] = document.document.pages[0].blocks;
    expect(tableBlock.related_table_id).toBe("tbl-0.md");
    expect(tableBlock.confidence).toBe(0.99);
    expect(tableBlock.confidence_metric).toBe(
      "average_content_confidence_score",
    );
    expect(document.document.pages[0].tables[0].table_id).toBe("tbl-0.md");
    expect(imageBlock.related_image_id).toBe("img-0.jpeg");
    expect(imageBlock.confidence).toBeNull();
    expect(imageBlock.confidence_metric).toBeNull();
  });

  it("rejects a table reference that is not on the same page", () => {
    expect(() =>
      buildStructuredDocument(
        {
          pages: [
            {
              index: 0,
              markdown: "table",
              dimensions: { width: 100, height: 100 },
              blocks: [
                {
                  type: "table",
                  table_id: "missing-table",
                  content: "| A |",
                  top_left_x: 0,
                  top_left_y: 0,
                  bottom_right_x: 10,
                  bottom_right_y: 10,
                },
              ],
              tables: [],
            },
          ],
        },
        { annotationMode: "none", requestedModel: "model" },
      ),
    ).toThrow(/missing table/i);
  });
});
