import { describe, expect, it } from "@jest/globals";
import {
  agentInstructions,
  type Variant,
} from "../scripts/crva-agent/instructions";
import {
  assembleBundle,
  parseValuesJsonl,
} from "../scripts/crva-agent/assemble";
import {
  CRVA_FIELD_IDS,
  CrvaDraftBundleSchema,
  type CrvaFieldId,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import {
  CRVA_VALUE_RULES,
  crvaFieldList,
} from "@/backend/ingest/plugins/ccra/extract-crva-fields";
import type { OcrCache } from "../scripts/crva-eval/ocr-cache";

describe("agentInstructions", () => {
  const variants: Variant[] = ["A", "B"];

  it.each(variants)("variant %s has fields, rules and output contract", (v) => {
    const text = agentInstructions(v, 12);
    for (const id of CRVA_FIELD_IDS) expect(text).toContain(id);
    for (const line of crvaFieldList(CRVA_FIELD_IDS as CrvaFieldId[]).split(
      "\n",
    ))
      expect(text).toContain(line);
    for (const rule of CRVA_VALUE_RULES) expect(text).toContain(rule);
    expect(text).toContain("output/values.jsonl");
    expect(text).toContain("the quote is copied exactly from that page");
    expect(text).not.toContain("OPENAI_API_KEY");
  });

  it("describes each variant's own layout", () => {
    const a = agentInstructions("A", 12);
    expect(a).toContain("pages/page-001.md");
    expect(a).toContain("the file number is the page number");
    const b = agentInstructions("B", 12);
    expect(b).toContain("doc.pdf");
    expect(b).toContain("tesseract -l spa+eng");
    expect(b).toContain("pdftoppm");
    expect(b).toContain("view_image");
    expect(b).toContain("page = 1-based PDF page index");
  });
});

describe("parseValuesJsonl", () => {
  it("ignores blank lines and counts bad lines", () => {
    const text = `{"a":1}\nnot json\n\n{"b":2}\n`;
    expect(parseValuesJsonl(text)).toEqual({
      candidates: [{ a: 1 }, { b: 2 }],
      badLines: 1,
    });
  });
});

describe("assembleBundle", () => {
  const ocr: OcrCache = {
    file: "plan.pdf",
    pageCount: 2,
    ocrModel: "mistral-ocr-test",
    partRanges: [],
    pages: new Map([
      [1, "El ﬁnanciamiento   del plan"],
      [2, "otra pagina"],
    ]),
    figures: [{ page: 2, imageId: "img-1", caption: null }],
  };
  const good = {
    fieldId: "A1.1",
    value: "Ciudad",
    page: 1,
    quote: "El financiamiento del plan",
  };

  it("applies v0 checks and builds a valid bundle", () => {
    const bundle = assembleBundle({
      file: "plan.pdf",
      candidates: [good, { ...good, fieldId: "Z9" }, { ...good, page: 999 }],
      badLines: 1,
      ocr,
      extractionModel: "gpt-test",
    });
    expect(bundle.values.map((v) => v.fieldId)).toEqual(["A1.1"]);
    expect(bundle.dropped.map((d) => d.reason).sort()).toEqual([
      "invalid_value",
      "invalid_value",
      "quote_not_on_page",
    ]);
    expect(bundle.ocrModel).toBe("mistral-ocr-test");
    expect(bundle.extractionModel).toBe("gpt-test");
    expect(bundle.uncoveredFields).not.toContain("A1.1");
    expect(bundle.uncoveredFields).toHaveLength(CRVA_FIELD_IDS.length - 1);
    expect(bundle.figures).toEqual(ocr.figures);
    expect(() => CrvaDraftBundleSchema.parse(bundle)).not.toThrow();
  });
});
