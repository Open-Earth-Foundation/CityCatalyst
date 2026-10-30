import { describe, expect, it } from "@jest/globals";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import {
  CCRA_MAX_PDF_BYTES,
  CcraIngestPlugin,
} from "@/backend/ingest/plugins/CcraIngestPlugin";
import {
  normalizeForQuoteMatch,
  verifyQuotes,
} from "@/backend/ingest/plugins/ccra/verify-quotes";
import { splitOcrPages } from "@/backend/ingest/plugins/ccra/extract-crva-fields";
import type { CrvaDraftBundle } from "@/backend/ingest/plugins/ccra/draft-schema";
import type { LLMClient } from "@/backend/llm";
import type { MistralOcrResult } from "@/backend/MistralOcrService";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";
const PDF = Buffer.from("%PDF-1.7\nfake");

const PAGE_1 =
  "# Riesgos\nLas olas de calor afectan a las personas mayores de Madrid.";
const PAGE_2 =
  "![img-0.jpeg](img-0.jpeg)\nFigura 1. Mapa de calor\nEl informe usa datos de 2010 del censo municipal.";

function ocrResult(): MistralOcrResult {
  return {
    markdown: `<!-- page: 1 -->\n${PAGE_1}\n\n<!-- page: 2 -->\n${PAGE_2}`,
    pageCount: 2,
    model: "mistral-ocr-test",
    structured: {
      document: {
        page_count: 2,
        pages: [
          { page_index: 0, blocks: [], images: [] },
          {
            page_index: 1,
            blocks: [
              { block_id: "b-image", related_image_id: "img-0.jpeg" },
              { block_id: "b-caption", content: "Figura 1. Mapa de calor" },
            ],
            images: [{ image_id: "img-0.jpeg" }],
          },
        ],
        relationships: [
          {
            type: "caption_of_image",
            from_block_id: "b-caption",
            to_block_id: "b-image",
          },
        ],
      },
    },
  } as unknown as MistralOcrResult;
}

const HAZARD = {
  fieldId: "B1.2a",
  value: { name: "Olas de calor", description: "Episodios de calor extremo" },
  page: 1,
  quote: "Las olas de calor afectan a las personas mayores",
};
const OLD_SOURCE = {
  fieldId: "A1.2a",
  value: { name: "Censo municipal", year: 2010 },
  page: 2,
  quote: "datos de 2010 del censo municipal",
};

type Reply = { content: string; finishReason?: string };

function fakeLlm(reply: (prompt: string) => Reply): {
  llm: () => LLMClient;
  calls: string[];
} {
  const calls: string[] = [];
  const client = {
    complete: async ({ messages }: { messages: { content: string }[] }) => {
      const prompt = messages[1].content;
      calls.push(prompt);
      const { content, finishReason = "stop" } = reply(prompt);
      return { content, raw: { choices: [{ finish_reason: finishReason }] } };
    },
    getConfig: () => ({ model: "test-model" }),
  } as unknown as LLMClient;
  return { llm: () => client, calls };
}

/** Answers each field group with the values whose field it asks for. */
function valuesReply(values: Array<{ fieldId: string }>) {
  return (prompt: string): Reply => ({
    content: JSON.stringify({
      values: values.filter((v) => prompt.includes(`- ${v.fieldId} (`)),
    }),
  });
}

async function runPlugin(
  llm: () => LLMClient,
  buffer: Buffer = PDF,
  now = new Date("2026-10-30"),
) {
  const store = new MemoryIngestStore();
  const runner = new IngestRunner(store);
  const urls: string[] = [];
  const plugin = new CcraIngestPlugin({
    resolveDocumentUrl: () => "https://example.org/crva.pdf",
    ocr: async (url) => {
      urls.push(url);
      return ocrResult();
    },
    llm,
    now: () => now,
  });
  const job = await runner.enqueue({
    moduleId: "ccra",
    scope: { cityId: CITY_ID },
    dryRun: true,
    files: [{ name: "madrid.pdf", buffer }],
  });
  const finished = await runner.run(job.id, plugin);
  const [item] = await store.listItems(job.id);
  const review = item.result?.review as
    | {
        bundle: CrvaDraftBundle;
        coverage: { coveredCount: number; fieldCount: number };
        warnings: string[];
      }
    | undefined;
  return { finished, item, review, urls };
}

describe("CcraIngestPlugin", () => {
  it("stops at review with sourced, unconfirmed drafts and no commit", async () => {
    const { llm } = fakeLlm(valuesReply([HAZARD]));
    const { finished, item, review, urls } = await runPlugin(llm);

    expect(urls).toEqual(["https://example.org/crva.pdf"]);
    expect(finished.status).toBe("awaiting_review");
    expect(finished.awaitingReviewCount).toBe(1);
    expect(item.status).toBe("awaiting_review");
    expect(item.stage).toBe("decide");
    expect(review?.bundle.values).toEqual([
      {
        fieldId: "B1.2a",
        value: HAZARD.value,
        source: { file: "madrid.pdf", page: 1, quote: HAZARD.quote },
        origin: "ai_draft",
        confirmed: false,
      },
    ]);
  });

  it("commit always throws", async () => {
    const plugin = new CcraIngestPlugin({ resolveDocumentUrl: () => "x" });
    await expect(plugin.commit()).rejects.toMatchObject({
      code: "commit_failed",
    });
  });

  it("drops a quote that is not on its cited page and reports it", async () => {
    const invented = { ...HAZARD, quote: "Las inundaciones destruyeron todo" };
    const wrongPage = { ...HAZARD, page: 2 };
    const { llm } = fakeLlm(valuesReply([invented, wrongPage]));
    const { finished, review } = await runPlugin(llm);

    expect(finished.status).toBe("awaiting_review");
    expect(review?.bundle.values).toEqual([]);
    expect(review?.bundle.dropped).toEqual([
      expect.objectContaining({
        fieldId: "B1.2a",
        reason: "quote_not_on_page",
      }),
      expect.objectContaining({
        fieldId: "B1.2a",
        reason: "quote_not_on_page",
      }),
    ]);
  });

  it("drops a value that does not match its field schema", async () => {
    const rated = { ...HAZARD, value: { name: "Olas de calor" } };
    const { llm } = fakeLlm(valuesReply([rated]));
    const { review } = await runPlugin(llm);

    expect(review?.bundle.values).toEqual([]);
    expect(review?.bundle.dropped[0]?.reason).toBe("invalid_value");
  });

  it("warns about source data over 10 years old", async () => {
    const { llm } = fakeLlm(valuesReply([OLD_SOURCE]));
    const { item } = await runPlugin(llm);

    expect(item.warnings).toContain(
      "Data source over 10 years old (X.1): Censo municipal (2010)",
    );
  });

  it("does not warn at exactly 10 years", async () => {
    const { llm } = fakeLlm(valuesReply([OLD_SOURCE]));
    const { item } = await runPlugin(llm, PDF, new Date("2020-06-01"));

    expect(item.warnings.join()).not.toContain("over 10 years");
  });

  it("warns about each required field the document does not cover", async () => {
    const { llm } = fakeLlm(valuesReply([HAZARD]));
    const { item, review } = await runPlugin(llm);

    expect(review?.coverage).toMatchObject({ coveredCount: 1, fieldCount: 12 });
    expect(review?.bundle.uncoveredFields).toContain("E1.1a");
    expect(review?.bundle.uncoveredFields).not.toContain("B1.2a");
    expect(item.warnings).toContain(
      "Required field not covered: E1.1a Key risks",
    );
  });

  it("fails the item when a response is truncated", async () => {
    const { llm } = fakeLlm(() => ({
      content: '{"values": [',
      finishReason: "length",
    }));
    const { finished, item } = await runPlugin(llm);

    expect(finished.status).toBe("failed");
    expect(item.status).toBe("failed");
    expect(item.errorCode).toBe("validation_failed");
    expect(item.errorLog).toContain("truncated");
  });

  it("fails the item on a response that is not JSON", async () => {
    const { llm } = fakeLlm(() => ({ content: "no json" }));
    const { item } = await runPlugin(llm);

    expect(item.status).toBe("failed");
    expect(item.errorCode).toBe("validation_failed");
  });

  it("lists figures with caption and page and never sends them to the LLM", async () => {
    const { llm, calls } = fakeLlm(valuesReply([]));
    const { review } = await runPlugin(llm);

    expect(review?.bundle.figures).toEqual([
      { page: 2, imageId: "img-0.jpeg", caption: "Figura 1. Mapa de calor" },
    ]);
    expect(calls.join()).not.toContain("img-0.jpeg");
  });

  it("rejects a PDF over the ccra size limit before OCR", async () => {
    const { llm, calls } = fakeLlm(valuesReply([]));
    const big = Buffer.concat([PDF, Buffer.alloc(CCRA_MAX_PDF_BYTES)]);
    const { item, urls } = await runPlugin(llm, big);

    expect(item.errorCode).toBe("file_too_large");
    expect(urls).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("rejects a file that is not a PDF", async () => {
    const store = new MemoryIngestStore();
    const runner = new IngestRunner(store);
    const job = await runner.enqueue({
      moduleId: "ccra",
      scope: { cityId: CITY_ID },
      files: [{ name: "notes.csv", buffer: Buffer.from("a,b\n") }],
    });
    await runner.run(
      job.id,
      new CcraIngestPlugin({ resolveDocumentUrl: () => "x" }),
    );
    const [item] = await store.listItems(job.id);

    expect(item.errorCode).toBe("unsupported_extension");
  });
});

describe("verifyQuotes", () => {
  it("matches across ligatures and broken whitespace", () => {
    const pages = new Map([[1, "La planiﬁcación   urbana\nde   Madrid"]]);
    const value = {
      fieldId: "A1.1",
      value: "Madrid",
      source: { file: "f", page: 1, quote: "planificación urbana de Madrid" },
      origin: "ai_draft",
      confirmed: false,
    } as const;

    expect(verifyQuotes([value], pages).verified).toEqual([value]);
    expect(normalizeForQuoteMatch("a­b\n c")).toBe("ab c");
  });

  it("matches a quote that dropped the OCR emphasis markup", () => {
    const pages = new Map([[1, "**Desempleo.** Tasa de desempleo registrado"]]);
    const value = {
      fieldId: "A1.1",
      value: "Madrid",
      source: {
        file: "f",
        page: 1,
        quote: "Desempleo. Tasa de desempleo registrado",
      },
      origin: "ai_draft",
      confirmed: false,
    } as const;

    expect(verifyQuotes([value], pages).verified).toEqual([value]);
  });

  it("rejects a quote too short to prove anything", () => {
    const value = {
      fieldId: "A1.1",
      value: "Madrid",
      source: { file: "f", page: 1, quote: "Madrid" },
      origin: "ai_draft",
      confirmed: false,
    } as const;

    expect(
      verifyQuotes([value], new Map([[1, "Madrid"]])).dropped[0]?.reason,
    ).toBe("quote_too_short");
  });
});

describe("splitOcrPages", () => {
  it("keeps an out-of-order marker in the page text", () => {
    const pages = splitOcrPages(
      "<!-- page: 1 -->\nuno <!-- page: 9 -->\n\n<!-- page: 2 -->\ndos",
      2,
    );

    expect(pages.get(1)).toContain("<!-- page: 9 -->");
    expect(pages.get(2)).toBe("dos");
  });

  it("fails when a page marker is missing", () => {
    expect(() => splitOcrPages("<!-- page: 1 -->\nuno", 2)).toThrow(
      "no marker for page 2",
    );
  });
});
