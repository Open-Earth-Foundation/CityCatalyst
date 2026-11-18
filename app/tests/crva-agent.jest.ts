import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
import {
  prepareWorkspace,
  statsFromAgent,
  type AgentRunResult,
} from "../scripts/crva-agent/run-stats";

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

describe("prepareWorkspace", () => {
  const ocr: OcrCache = {
    file: "plan.pdf",
    pageCount: 2,
    ocrModel: "m",
    partRanges: [],
    pages: new Map([
      [1, "uno"],
      [2, "dos"],
    ]),
    figures: [],
  };

  async function inTempDir(fn: (dir: string, pdf: string) => Promise<void>) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "crva-ws-test-"));
    const pdf = path.join(dir, "source.pdf");
    await writeFile(pdf, "%PDF-fake");
    const ws = path.join(dir, "ws");
    try {
      await fn(ws, pdf);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it("variant A holds one page file per OCR page and an empty output/", () =>
    inTempDir(async (ws, pdf) => {
      await prepareWorkspace("A", ws, ocr, pdf);
      expect((await readdir(ws)).sort()).toEqual(["output", "pages"]);
      expect((await readdir(path.join(ws, "pages"))).sort()).toEqual([
        "page-001.md",
        "page-002.md",
      ]);
      expect(
        await readFile(path.join(ws, "pages", "page-002.md"), "utf8"),
      ).toBe("dos");
      expect(await readdir(path.join(ws, "output"))).toEqual([]);
    }));

  it("variant B holds the PDF as doc.pdf and an empty output/", () =>
    inTempDir(async (ws, pdf) => {
      await prepareWorkspace("B", ws, ocr, pdf);
      expect((await readdir(ws)).sort()).toEqual(["doc.pdf", "output"]);
      expect(await readFile(path.join(ws, "doc.pdf"), "utf8")).toBe(
        "%PDF-fake",
      );
      expect(await readdir(path.join(ws, "output"))).toEqual([]);
    }));
});

describe("statsFromAgent", () => {
  const ocr: OcrCache = {
    file: "plan.pdf",
    pageCount: 3,
    ocrModel: "m",
    partRanges: [{ startPage: 1, pageCount: 3, bytes: 10 }],
    pages: new Map([[1, "El financiamiento del plan climatico"]]),
    figures: [],
  };
  const result: AgentRunResult = {
    outputText: "",
    usage: { promptTokens: 100, completionTokens: 20 },
    modelTurns: 7,
    toolCalls: 12,
  };

  it("an empty output file is an ok run with 0 values", () => {
    const bundle = assembleBundle({
      file: "plan.pdf",
      candidates: [],
      badLines: 0,
      ocr,
      extractionModel: "gpt-test",
    });
    const stats = statsFromAgent(2, result, bundle, 1.5, ocr);
    expect(stats).toMatchObject({
      run: 2,
      status: "ok",
      minutes: 1.5,
      llmCalls: 7,
      modelTurns: 7,
      toolCalls: 12,
      promptTokens: 100,
      completionTokens: 20,
      parts: 1,
      ocrPages: 3,
      valuesKept: 0,
      fieldsWithValue: 0,
    });
    expect(stats.partRanges).toEqual(ocr.partRanges);
    expect(stats.error).toBeUndefined();
  });

  it("counts kept and dropped values from the bundle", () => {
    const bundle = assembleBundle({
      file: "plan.pdf",
      candidates: [
        {
          fieldId: "A1.1",
          value: "Ciudad",
          page: 1,
          quote: "El financiamiento del plan",
        },
        {
          fieldId: "A1.1",
          value: "Ciudad",
          page: 1,
          quote: "texto que no aparece en la pagina",
        },
      ],
      badLines: 0,
      ocr,
      extractionModel: "gpt-test",
    });
    const stats = statsFromAgent(1, result, bundle, 1, ocr);
    expect(stats.valuesKept).toBe(1);
    expect(stats.valuesDropped).toBe(1);
    expect(stats.droppedByReason).toEqual({ quote_not_on_page: 1 });
    expect(stats.fieldsWithValue).toBe(1);
  });

  it("no output file is a failed run", () => {
    const stats = statsFromAgent(
      1,
      { ...result, outputText: null },
      null,
      1,
      ocr,
    );
    expect(stats.status).toBe("failed");
    expect(stats.error).toBe("no output file");
    expect(stats.valuesKept).toBe(0);
  });

  it("a cap error is a failed run with that error", () => {
    const stats = statsFromAgent(
      1,
      { ...result, error: "max turns 150" },
      null,
      1,
      ocr,
    );
    expect(stats.status).toBe("failed");
    expect(stats.error).toBe("max turns 150");
  });
});
