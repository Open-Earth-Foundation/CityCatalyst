import { describe, expect, it } from "@jest/globals";
import {
  CRVA_CAPACITY_CATEGORIES,
  CRVA_FIELD_IDS,
  CRVA_FIELD_LABELS,
  CrvaDraftBundleSchema,
  type CrvaFieldId,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import type { OcrCache } from "../scripts/crva-eval/ocr-cache";
import {
  assembleMircoBundle,
  mircoItems,
  mircoRunStats,
  mircoUsage,
  type MircoItem,
} from "../scripts/crva-mirco/convert";
import {
  CRVA_VALUE_RULES,
  CRVA_VALUE_SHAPES,
} from "@/backend/ingest/plugins/ccra/extract-crva-fields";
import {
  CRVA_ITEM_SCHEMAS,
  crvaJsonSchema,
  crvaUserPrompt,
} from "../scripts/crva-mirco/inputs";

// Schema JSON is read by path in assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonObject = Record<string, any>;

describe("crvaJsonSchema", () => {
  const schema = crvaJsonSchema() as JsonObject;
  const ids = CRVA_FIELD_IDS as CrvaFieldId[];

  it("is a Draft 2020-12 root object with the 12 v0 fields required", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(CRVA_FIELD_IDS);
    expect(Object.keys(schema.properties)).toEqual(CRVA_FIELD_IDS);
  });

  it.each(ids)("%s is an array of its item schema, labelled", (id) => {
    const property = schema.properties[id];
    expect(property.type).toBe("array");
    expect(property.items).toEqual(CRVA_ITEM_SCHEMAS[id]);
    expect(property.description).toContain(CRVA_FIELD_LABELS[id]);
  });

  it("drops the A1.2a instruction to include the report itself", () => {
    expect(schema.properties["A1.2a"].description).not.toContain(
      "Include the report itself",
    );
  });

  it.each(ids)("%s item keys match CRVA_VALUE_SHAPES", (id) => {
    const shape = CRVA_VALUE_SHAPES[id];
    const item = CRVA_ITEM_SCHEMAS[id] as JsonObject;
    if (!shape.startsWith("{")) {
      expect(item).toEqual({ type: "string" });
      return;
    }
    const keys = [...shape.matchAll(/"(\w+)":/g)].map((m) => m[1]);
    expect(Object.keys(item.properties)).toEqual(keys);
    expect(item.required).toEqual(keys);
    expect(item.additionalProperties).toBe(false);
  });

  it("pins enums, nullable year and string lists", () => {
    const items = CRVA_ITEM_SCHEMAS as Record<string, JsonObject>;
    for (const id of ["D1.1a", "D1.2a"]) {
      expect(items[id].properties.category.enum).toEqual([
        ...CRVA_CAPACITY_CATEGORIES,
      ]);
    }
    expect(items["A1.2a"].properties.year).toEqual({
      type: ["integer", "null"],
    });
    for (const key of ["hazards", "affected"]) {
      expect(items["E1.1a"].properties[key]).toEqual({
        type: "array",
        items: { type: "string" },
      });
    }
  });
});

const OCR: OcrCache = {
  file: "report.pdf",
  pageCount: 2,
  ocrModel: "mistral-ocr-test",
  partRanges: [{ startPage: 1, pageCount: 2, bytes: 10 }],
  pages: new Map([
    [1, "La ciudad limita con el Río de la Plata."],
    [2, "Las olas de calor afectan a las personas mayores del barrio."],
  ]),
  figures: [],
};

function field(pointer: string, quotes: [number, string][], status = "found") {
  return {
    field_id: pointer,
    status,
    observations:
      status === "found"
        ? [
            {
              value: "x",
              unit: null,
              year: null,
              geography: null,
              evidence: quotes.map(([pdf_page, quote]) => ({
                pdf_page,
                printed_page: null,
                quote,
              })),
              notes: [],
            },
          ]
        : [],
    searched_pages: [1, 2],
    explanation: "",
  };
}

const HEAT = {
  hazard: "Olas de calor",
  group: "Personas mayores",
  description: "Las olas de calor afectan a las personas mayores",
};

describe("mircoItems", () => {
  it("groups leaf outcomes into one item per array index", () => {
    const result = {
      data: { "C1.1a": [HEAT], "A1.1": ["Río de la Plata"] },
      fields: [
        field("/C1.1a/0/hazard", [[2, "Las olas de calor"]]),
        field("/C1.1a/0/description", [
          [2, "Las olas de calor"],
          [2, "personas mayores del barrio"],
        ]),
        field("/A1.1/0", [[1, "limita con el Río de la Plata"]]),
        field("/A2.1a/0", [], "not_found_after_search"),
      ],
    };
    const { items, badPointers } = mircoItems(result);
    expect(badPointers).toBe(0);
    expect(items).toEqual([
      {
        fieldId: "C1.1a",
        index: 0,
        value: HEAT,
        evidence: [
          { page: 2, quote: "Las olas de calor" },
          { page: 2, quote: "personas mayores del barrio" },
        ],
      },
      {
        fieldId: "A1.1",
        index: 0,
        value: "Río de la Plata",
        evidence: [{ page: 1, quote: "limita con el Río de la Plata" }],
      },
    ]);
  });

  it("counts unknown fields, bad indexes and missing values", () => {
    const result = {
      data: { "A1.1": ["a"] },
      fields: [
        field("/Z9.9/0", [[1, "q"]]),
        field("/A1.1/x", [[1, "q"]]),
        field("/A1.1/5", [[1, "q"]]),
      ],
    };
    expect(mircoItems(result)).toEqual({ items: [], badPointers: 3 });
  });

  it("returns nothing for a missing result", () => {
    expect(mircoItems(null)).toEqual({ items: [], badPointers: 0 });
    expect(mircoItems({})).toEqual({ items: [], badPointers: 0 });
  });
});

describe("assembleMircoBundle", () => {
  const build = (items: MircoItem[], badPointers = 0) =>
    assembleMircoBundle({
      file: OCR.file,
      items,
      badPointers,
      ocr: OCR,
      extractionModel: "gpt-6.1-sol",
    });

  it("keeps the first evidence that passes the quote check", () => {
    const bundle = build([
      {
        fieldId: "C1.1a",
        index: 0,
        value: HEAT,
        evidence: [
          { page: 1, quote: "not on any page" },
          { page: 2, quote: "afectan a las personas mayores" },
        ],
      },
    ]);
    expect(bundle.values).toHaveLength(1);
    expect(bundle.values[0]).toMatchObject({
      fieldId: "C1.1a",
      source: { page: 2, quote: "afectan a las personas mayores" },
    });
    expect(bundle.dropped).toEqual([]);
    expect(() => CrvaDraftBundleSchema.parse(bundle)).not.toThrow();
  });

  it("counts one drop for an item with no passing quote", () => {
    const bundle = build([
      {
        fieldId: "A1.1",
        index: 0,
        value: "x",
        evidence: [
          { page: 1, quote: "nope one" },
          { page: 2, quote: "nope two" },
        ],
      },
    ]);
    expect(bundle.values).toEqual([]);
    expect(bundle.dropped).toHaveLength(1);
  });

  it("adds invalid_value drops for bad pointers and dedupes values", () => {
    const item: MircoItem = {
      fieldId: "A1.1",
      index: 0,
      value: "Río de la Plata",
      evidence: [{ page: 1, quote: "Río de la Plata" }],
    };
    const bundle = build([item, { ...item, index: 1 }], 2);
    expect(bundle.values).toHaveLength(1);
    expect(bundle.dropped).toEqual([
      { fieldId: "unknown", page: null, quote: null, reason: "invalid_value" },
      { fieldId: "unknown", page: null, quote: null, reason: "invalid_value" },
    ]);
    expect(bundle.uncoveredFields).toEqual(
      CRVA_FIELD_IDS.filter((id) => id !== "A1.1"),
    );
  });
});

describe("mircoUsage", () => {
  it("maps Agents API usage keys", () => {
    expect(
      mircoUsage({
        input_tokens: 100,
        output_tokens: 20,
        input_tokens_details: { cached_tokens: 40 },
        output_tokens_details: { reasoning_tokens: 5 },
      }),
    ).toEqual({
      promptTokens: 100,
      completionTokens: 20,
      cachedInputTokens: 40,
      reasoningTokens: 5,
    });
  });

  it("returns zeros for missing usage", () => {
    expect(mircoUsage(undefined)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
    });
  });
});

describe("mircoRunStats", () => {
  it("marks a null result as failed", () => {
    const stats = mircoRunStats({
      run: 1,
      envelope: { result: null, execution_status: "repair_error" },
      bundle: null,
      minutes: 3,
      ocr: OCR,
      ocrOn: false,
    });
    expect(stats.status).toBe("failed");
    expect(stats.error).toContain("repair_error");
  });

  it("counts turns, OCR pages and values for an ok run", () => {
    const bundle = assembleMircoBundle({
      file: OCR.file,
      items: [
        {
          fieldId: "A1.1",
          index: 0,
          value: "Río de la Plata",
          evidence: [{ page: 1, quote: "Río de la Plata" }],
        },
      ],
      badPointers: 1,
      ocr: OCR,
      extractionModel: "gpt-6.1-sol",
    });
    const envelope = {
      result: { data: {}, fields: [] },
      execution_status: "completed",
      repair: { repairs: 2 },
      usage: { input_tokens: 10, output_tokens: 3 },
    };
    const on = mircoRunStats({
      run: 1,
      envelope,
      bundle,
      minutes: 12.5,
      ocr: OCR,
      ocrOn: true,
    });
    expect(on).toMatchObject({
      status: "ok",
      minutes: 12.5,
      parts: 1,
      retries: 0,
      ocrPages: 2,
      llmCalls: 3,
      modelTurns: 3,
      promptTokens: 10,
      completionTokens: 3,
      valuesKept: 1,
      valuesDropped: 1,
      droppedByReason: { invalid_value: 1 },
      fieldsWithValue: 1,
    });
    const off = mircoRunStats({
      run: 1,
      envelope,
      bundle,
      minutes: 12.5,
      ocr: OCR,
      ocrOn: false,
    });
    expect(off.ocrPages).toBe(0);
  });
});

describe("crvaUserPrompt", () => {
  it("keeps the default text and adds every v0 value rule", () => {
    const prompt = crvaUserPrompt("<role>Default</role>");
    expect(prompt.startsWith("<role>Default</role>")).toBe(true);
    for (const rule of CRVA_VALUE_RULES) expect(prompt).toContain(rule);
  });
});
