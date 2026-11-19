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
  toV0Value,
  type MircoItem,
} from "../scripts/crva-mirco/convert";
import {
  clientArgs,
  convertEnvelope,
  failureNote,
  ocrMismatch,
  parseJobId,
} from "../scripts/crva-mirco/run-mirco";
import {
  CRVA_VALUE_RULES,
  CRVA_VALUE_SHAPES,
} from "@/backend/ingest/plugins/ccra/extract-crva-fields";
import {
  CRVA_DETAIL_RULES,
  CRVA_FIELD_GUIDE,
  CRVA_GRANULARITY_RULES,
  CRVA_ITEM_SCHEMAS,
  CRVA_MIRCO_SHAPES,
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

  it("A1.2a asks for author, title, year and an optional use", () => {
    const item = CRVA_ITEM_SCHEMAS["A1.2a"] as JsonObject;
    expect(Object.keys(item.properties)).toEqual([
      "author",
      "title",
      "year",
      "used_for",
    ]);
    expect(item.properties.used_for).toEqual({ type: ["string", "null"] });
    expect(schema.properties["A1.2a"].description).toContain('"title"');
    expect(CRVA_MIRCO_SHAPES["A1.2a"]).not.toBe(CRVA_VALUE_SHAPES["A1.2a"]);
  });

  it("only A1.2a differs from the v0 shapes", () => {
    for (const id of ids.filter((x) => x !== "A1.2a")) {
      expect(CRVA_MIRCO_SHAPES[id]).toBe(CRVA_VALUE_SHAPES[id]);
    }
  });

  it.each(ids)("%s item keys match CRVA_MIRCO_SHAPES", (id) => {
    const shape = CRVA_MIRCO_SHAPES[id];
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
    expect(mircoItems(result)).toEqual({
      items: [],
      badPointers: 3,
      ambiguousItems: 0,
    });
  });

  it("returns nothing for a missing result", () => {
    expect(mircoItems(null)).toEqual({
      items: [],
      badPointers: 0,
      ambiguousItems: 0,
    });
    expect(mircoItems({})).toEqual({
      items: [],
      badPointers: 0,
      ambiguousItems: 0,
    });
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

describe("toV0Value", () => {
  it("joins A1.2a author and title into the v0 name and keeps the year", () => {
    expect(
      toV0Value("A1.2a", {
        author: "Balay, M.",
        title: "El Río de la Plata entre la atmósfera y el mar",
        year: 1961,
        used_for: "hidrografía",
      }),
    ).toEqual({
      name: "Balay, M. — El Río de la Plata entre la atmósfera y el mar",
      year: 1961,
    });
  });

  it("uses the title alone when the author is empty", () => {
    expect(
      toV0Value("A1.2a", { author: " ", title: "Censo 2010", year: null }),
    ).toEqual({ name: "Censo 2010", year: null });
  });

  it("passes the old A1.2a shape and other fields through", () => {
    const old = { name: "INDEC", year: 2010 };
    expect(toV0Value("A1.2a", old)).toBe(old);
    expect(toV0Value("C1.1a", HEAT)).toBe(HEAT);
  });

  it("lets an A1.2a item in the new shape pass the v0 checks", () => {
    const bundle = assembleMircoBundle({
      file: OCR.file,
      items: [
        {
          fieldId: "A1.2a",
          index: 0,
          value: {
            author: "Ciudad",
            title: "Río de la Plata",
            year: 2020,
            used_for: null,
          },
          evidence: [{ page: 1, quote: "limita con el Río de la Plata" }],
        },
      ],
      badPointers: 0,
      ocr: OCR,
      extractionModel: "gpt-6.1-sol",
    });
    expect(bundle.dropped).toEqual([]);
    expect(bundle.values[0]).toMatchObject({
      fieldId: "A1.2a",
      value: { name: "Ciudad — Río de la Plata", year: 2020 },
    });
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

  it("adds the detail and granularity rules", () => {
    const prompt = crvaUserPrompt("<role>Default</role>");
    expect(CRVA_DETAIL_RULES.length).toBeGreaterThan(0);
    expect(CRVA_GRANULARITY_RULES.length).toBeGreaterThan(0);
    for (const rule of [...CRVA_DETAIL_RULES, ...CRVA_GRANULARITY_RULES]) {
      expect(prompt).toContain(rule);
    }
    expect(prompt).toContain("<detail_rules>");
    expect(prompt).toContain("<granularity_rules>");
  });

  it("has a field guide entry with an example in its item shape for every field", () => {
    const prompt = crvaUserPrompt("<role>Default</role>");
    expect(prompt).toContain("<field_guide>");
    for (const id of CRVA_FIELD_IDS as CrvaFieldId[]) {
      const guide = CRVA_FIELD_GUIDE[id];
      expect(guide.definition.length).toBeGreaterThan(20);
      expect(guide.notThis.length).toBeGreaterThan(10);
      const item = CRVA_ITEM_SCHEMAS[id] as JsonObject;
      if (item.type === "string") {
        expect(typeof guide.example).toBe("string");
      } else {
        expect(Object.keys(guide.example as object)).toEqual(
          Object.keys(item.properties),
        );
      }
      expect(prompt).toContain(`### ${id}`);
      expect(prompt).toContain(JSON.stringify(guide.example));
    }
  });

  it("says what does not belong in E1.1a and D1.2a", () => {
    expect(CRVA_FIELD_GUIDE["E1.1a"].definition).toMatch(/risk level/i);
    expect(CRVA_FIELD_GUIDE["E1.1a"].notThis).toMatch(/impact/i);
    expect(CRVA_FIELD_GUIDE["D1.2a"].notThis).toMatch(/cause/i);
    expect(CRVA_FIELD_GUIDE["A1.1"].definition).toMatch(/map/i);
    expect(CRVA_FIELD_GUIDE["A2.1a"].definition).toMatch(/map/i);
  });
});

describe("clientArgs", () => {
  const base = {
    mircoDir: "C:/m",
    city: "buenos-aires",
    pdf: "C:/r.pdf",
    schema: "C:/s.json",
    userPrompt: "C:/u.md",
    output: "C:/out/result.json",
    baseUrl: "http://127.0.0.1:8080",
  };

  it("runs Mirco's client with repair, long timeout and our inputs", () => {
    const args = clientArgs({ ...base, ocrOn: false }).join(" ");
    expect(args).toContain("-m examples.extract");
    expect(args).toContain("--city-pdf C:/r.pdf");
    expect(args).toContain("--schema C:/s.json");
    expect(args).toContain("--user-prompt-file C:/u.md");
    expect(args).toContain("--auto-repair");
    expect(args).toContain("--max-repairs 3");
    expect(args).toContain("--timeout 7200");
    expect(args).toContain("--output C:/out/result.json");
    expect(args).toContain("--base-url http://127.0.0.1:8080");
    expect(args).not.toContain("--mistral-ocr");
  });

  it("adds --mistral-ocr only when OCR is on", () => {
    expect(clientArgs({ ...base, ocrOn: true })).toContain("--mistral-ocr");
  });
});

describe("parseJobId", () => {
  it("reads the job ID from the client log", () => {
    expect(
      parseJobId(
        "INFO Accepted job abc_123; save this ID to resume polling after a disconnect.",
      ),
    ).toBe("abc_123");
    expect(parseJobId("INFO nothing here")).toBeNull();
  });
});

describe("review fixes", () => {
  it("keeps the longest passing quote of an item", () => {
    const bundle = assembleMircoBundle({
      file: OCR.file,
      items: [
        {
          fieldId: "C1.1a",
          index: 0,
          value: HEAT,
          evidence: [
            { page: 2, quote: "Las olas de calor" },
            {
              page: 2,
              quote: "Las olas de calor afectan a las personas mayores",
            },
          ],
        },
      ],
      badPointers: 0,
      ocr: OCR,
      extractionModel: "gpt-6.1-sol",
    });
    expect(bundle.values[0].source.quote).toBe(
      "Las olas de calor afectan a las personas mayores",
    );
  });

  it("skips a found outcome on an empty field array without a drop", () => {
    const result = {
      data: { "A2.1a": [] },
      fields: [field("/A2.1a", [[1, "La ciudad limita con el Río"]])],
    };
    expect(mircoItems(result)).toEqual({
      items: [],
      badPointers: 0,
      ambiguousItems: 0,
    });
  });

  it("counts populated items whose outcomes are all ambiguous", () => {
    const result = {
      data: { "A1.1": ["a", "b"] },
      fields: [
        { ...field("/A1.1/0", [[1, "q"]]), status: "ambiguous" },
        { ...field("/A1.1/1", [[1, "q"]]), status: "ambiguous" },
        field("/A1.1/1", [[1, "La ciudad limita con el Río"]]),
      ],
    };
    const { items, ambiguousItems } = mircoItems(result);
    expect(items.map((i) => i.index)).toEqual([1]);
    expect(ambiguousItems).toBe(1);
  });

  it("flags an OCR cache made from another PDF", () => {
    expect(ocrMismatch("C:/x/report.pdf", OCR)).toBeNull();
    expect(ocrMismatch("C:/x/other.pdf", OCR)).toContain("report.pdf");
  });

  it("converts a saved envelope the same way as a fresh run", () => {
    const failed = convertEnvelope({
      envelope: { result: null, execution_status: "failed" },
      ocr: OCR,
      ocrOn: false,
      minutes: 0,
    });
    expect(failed.bundle).toBeNull();
    expect(failed.stats.status).toBe("failed");
    const ok = convertEnvelope({
      envelope: {
        result: {
          data: { "A1.1": ["Río de la Plata"] },
          fields: [field("/A1.1/0", [[1, "limita con el Río de la Plata"]])],
        },
        execution_status: "completed",
      },
      ocr: OCR,
      ocrOn: true,
      minutes: 4,
    });
    expect(ok.stats.status).toBe("ok");
    expect(ok.bundle?.values).toHaveLength(1);
    expect(ok.ambiguousItems).toBe(0);
  });

  it("never tells David a failed submission is safe to repeat", () => {
    expect(failureNote(null)).toContain("uncertain");
    expect(failureNote(null)).not.toContain("not submitted");
    expect(failureNote("job_1")).toContain("job_1");
  });
});
