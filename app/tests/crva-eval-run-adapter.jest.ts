import { describe, expect, it } from "@jest/globals";
import { PDFDocument } from "pdf-lib";
import { CcraIngestPlugin } from "@/backend/ingest/plugins/CcraIngestPlugin";
import type { LLMClient } from "@/backend/llm";
import type { MistralOcrResult } from "@/backend/MistralOcrService";
import { recordingClient } from "../scripts/crva-eval/llm-recorder";
import {
  runOnce,
  shouldStartRun,
  runsTableMarkdown,
  type RunStats,
} from "../scripts/crva-eval/run-adapter";
import { splitPdf } from "../scripts/crva-eval/split-pdf";

async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return Buffer.from(await doc.save());
}

/** A limit that fits one page but not two, so a 2-page PDF splits in 2. */
async function twoPartLimit(): Promise<number> {
  const one = (await makePdf(1)).length;
  const two = (await makePdf(2)).length;
  return Math.floor((one + two) / 2);
}

/** OCR stub: one text page per PDF page, text names the part it came from. */
function fakeOcr() {
  let call = 0;
  return async (url: string): Promise<MistralOcrResult> => {
    const part = ++call;
    const bytes = Buffer.from(url.split(",")[1], "base64");
    const pageCount = (await PDFDocument.load(bytes)).getPageCount();
    const markdown = Array.from(
      { length: pageCount },
      (_, i) =>
        `<!-- page: ${i + 1} -->\nTexto de la parte ${part} sobre olas de calor`,
    ).join("\n\n");
    return {
      markdown,
      pageCount,
      model: "ocr-test",
      structured: {
        document: { page_count: pageCount, pages: [], relationships: [] },
      },
    } as unknown as MistralOcrResult;
  };
}

/** LLM stub: answers B1.2a with a quote taken from the part text. */
function fakeLlm(): () => LLMClient {
  const client = {
    complete: async (options: { messages: { content: string }[] }) => {
      const prompt = options.messages[1].content;
      const part = /Texto de la parte (\d+)/.exec(prompt)?.[1];
      const values =
        part && prompt.includes("- B1.2a (")
          ? [
              {
                fieldId: "B1.2a",
                value: { name: `Olas ${part}`, description: "Calor extremo" },
                page: 1,
                quote: `Texto de la parte ${part} sobre olas de calor`,
              },
            ]
          : [];
      return {
        content: JSON.stringify({ values }),
        usage: { promptTokens: 10, completionTokens: 2 },
        raw: { choices: [{ finish_reason: "stop" }] },
      };
    },
    getConfig: () => ({ models: { crva_extraction: { name: "test-model" } } }),
  } as unknown as LLMClient;
  return () => client;
}

const plugin = (ocr: ReturnType<typeof fakeOcr>) => (llm: () => LLMClient) =>
  new CcraIngestPlugin({ ocr, llm, now: () => new Date("2026-10-30") });

describe("recordingClient", () => {
  it("records tokens and finish reasons", async () => {
    const { client, calls } = recordingClient(fakeLlm()());
    await client.complete({
      use: "crva_extraction",
      messages: [{ content: "s" }, { content: "u" }],
    } as never);
    expect(calls[0]).toEqual({
      promptTokens: 10,
      completionTokens: 2,
      finishReason: "stop",
    });
  });
});

describe("runOnce", () => {
  it("runs every part and merges", async () => {
    const pdf = await makePdf(2);
    const maxPartBytes = await twoPartLimit();
    expect(await splitPdf(pdf, maxPartBytes)).toHaveLength(2);

    const { bundle, stats } = await runOnce({
      pdf,
      fileName: "city.pdf",
      run: 1,
      maxPartBytes,
      llm: fakeLlm(),
      plugin: plugin(fakeOcr()),
    });

    expect(stats.parts).toBe(2);
    expect(stats.status).toBe("ok");
    expect(stats.ocrPages).toBe(2);
    expect(stats.llmCalls).toBeGreaterThan(0);
    expect(stats.nonStopFinishes).toBe(0);
    expect(stats.valuesKept).toBe(2);
    expect(stats.fieldsWithValue).toBe(1);
    // Part 2 starts on original page 2, so its page-1 quote moves to page 2.
    expect(bundle?.values.map((v) => v.source.page)).toEqual([1, 2]);
    expect(bundle?.file).toBe("city.pdf");
  });

  it("reads the bundle from the review draft", async () => {
    const { bundle, warnings, stats } = await runOnce({
      pdf: await makePdf(1),
      fileName: "city.pdf",
      run: 1,
      llm: fakeLlm(),
      plugin: plugin(fakeOcr()),
    });
    // Warnings come from validating the merged bundle: 11 uncovered fields.
    expect(bundle?.values).toHaveLength(1);
    expect(warnings.filter((w) => w.startsWith("Required field"))).toHaveLength(
      11,
    );
    expect(stats.warnings).toBe(warnings.length);
  });

  it("retries a failed part twice, then fails the run", async () => {
    const failing = async (): Promise<MistralOcrResult> => {
      throw new Error("ocr down");
    };
    const result = await runOnce({
      pdf: await makePdf(1),
      fileName: "city.pdf",
      run: 3,
      llm: fakeLlm(),
      plugin: plugin(failing),
    });
    expect(result.bundle).toBeNull();
    expect(result.stats.status).toBe("failed");
    expect(result.stats.run).toBe(3);
    expect(result.stats.retries).toBe(2);
    expect(result.stats.error).toContain("ocr down");
  });

  it("succeeds after one retry", async () => {
    const good = fakeOcr();
    let first = true;
    const flaky = async (url: string) => {
      if (first) {
        first = false;
        throw new Error("blip");
      }
      return good(url);
    };
    const { stats } = await runOnce({
      pdf: await makePdf(1),
      fileName: "city.pdf",
      run: 1,
      llm: fakeLlm(),
      plugin: plugin(flaky),
    });
    expect(stats.status).toBe("ok");
    expect(stats.retries).toBe(1);
  });
});

describe("runsTableMarkdown", () => {
  it("dropped share counts all reasons", () => {
    const stats = {
      run: 1,
      status: "ok",
      minutes: 1.5,
      parts: 1,
      retries: 0,
      ocrPages: 48,
      promptTokens: 100,
      completionTokens: 20,
      llmCalls: 18,
      nonStopFinishes: 0,
      valuesKept: 83,
      valuesDropped: 1,
      droppedByReason: { quote_not_on_page: 1 },
      fieldsWithValue: 12,
      figures: 8,
      warnings: 10,
    } satisfies RunStats;
    const table = runsTableMarkdown([stats]);
    expect(table).toContain("1.2%");
    expect(table).toContain("Run 1");
  });
});

describe("shouldStartRun", () => {
  it("stops once the wanted runs completed", () => {
    expect(shouldStartRun(3, 2, 0)).toBe(true);
    expect(shouldStartRun(3, 3, 1)).toBe(false);
  });

  it("stops after 2 failed runs", () => {
    expect(shouldStartRun(3, 0, 1)).toBe(true);
    expect(shouldStartRun(3, 0, 2)).toBe(false);
  });
});
