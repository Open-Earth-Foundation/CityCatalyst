import { mergePartBundles } from "../scripts/crva-eval/merge-bundles";
import type {
  CrvaDraftBundle,
  CrvaDraftValue,
} from "@/backend/ingest/plugins/ccra/draft-schema";

const value = (
  fieldId: "A1.1" | "A2.1a",
  text: string,
  page: number,
  file = "part.pdf",
): CrvaDraftValue => ({
  fieldId,
  value: text,
  source: { file, page, quote: `quote ${text}` },
  origin: "ai_draft",
  confirmed: false,
});

const bundle = (overrides: Partial<CrvaDraftBundle> = {}): CrvaDraftBundle => ({
  file: "part.pdf",
  pageCount: 40,
  ocrModel: "ocr-a",
  extractionModel: "llm-a",
  values: [],
  uncoveredFields: [],
  figures: [],
  dropped: [],
  ...overrides,
});

const original = { file: "city.pdf", pageCount: 80 };

describe("mergePartBundles", () => {
  it("offsets value and figure pages", () => {
    const merged = mergePartBundles(
      [
        { startPage: 1, bundle: bundle({ values: [value("A1.1", "x", 40)] }) },
        {
          startPage: 41,
          bundle: bundle({
            values: [value("A2.1a", "y", 3)],
            figures: [{ page: 1, imageId: "img", caption: null }],
          }),
        },
      ],
      original,
    );
    const pages = merged.values.map((v) => v.source.page);
    expect(pages).toEqual([40, 43]);
    expect(merged.figures[0].page).toBe(41);
  });

  it("uses the original file name and page count", () => {
    const merged = mergePartBundles(
      [{ startPage: 1, bundle: bundle({ values: [value("A1.1", "x", 1)] }) }],
      original,
    );
    expect(merged.file).toBe("city.pdf");
    expect(merged.pageCount).toBe(80);
    expect(merged.values.every((v) => v.source.file === "city.pdf")).toBe(true);
  });

  it("dedupes across parts keeping the first by page", () => {
    const merged = mergePartBundles(
      [
        {
          startPage: 41,
          bundle: bundle({ values: [value("A1.1", "Same", 2)] }),
        },
        {
          startPage: 1,
          bundle: bundle({ values: [value("A1.1", "same", 5)] }),
        },
      ],
      original,
    );
    expect(merged.values).toHaveLength(1);
    expect(merged.values[0].source.page).toBe(5);
  });

  it("recomputes uncovered fields", () => {
    const merged = mergePartBundles(
      [
        { startPage: 1, bundle: bundle({ values: [value("A1.1", "x", 1)] }) },
        { startPage: 41, bundle: bundle({ values: [value("A2.1a", "y", 1)] }) },
      ],
      original,
    );
    expect(merged.uncoveredFields).not.toContain("A1.1");
    expect(merged.uncoveredFields).not.toContain("A2.1a");
    expect(merged.uncoveredFields).toContain("B1.2a");
  });

  it("concatenates dropped with offset pages", () => {
    const merged = mergePartBundles(
      [
        {
          startPage: 1,
          bundle: bundle({
            dropped: [
              { fieldId: "A1.1", page: 2, quote: "q", reason: "invalid_value" },
            ],
          }),
        },
        {
          startPage: 41,
          bundle: bundle({
            dropped: [
              {
                fieldId: "A1.1",
                page: 3,
                quote: "q",
                reason: "quote_too_short",
              },
              {
                fieldId: "A1.1",
                page: null,
                quote: null,
                reason: "invalid_value",
              },
            ],
          }),
        },
      ],
      original,
    );
    expect(merged.dropped.map((d) => [d.page, d.reason])).toEqual([
      [2, "invalid_value"],
      [43, "quote_too_short"],
      [null, "invalid_value"],
    ]);
  });
});
