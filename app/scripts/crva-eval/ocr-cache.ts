import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  convertPdfUrlToMarkdown,
  type MistralOcrResult,
} from "@/backend/MistralOcrService";
import type { CrvaFigure } from "@/backend/ingest/plugins/ccra/draft-schema";
import { splitOcrPages } from "@/backend/ingest/plugins/ccra/extract-crva-fields";
import { listFigures } from "@/backend/ingest/plugins/CcraIngestPlugin";
import { DEFAULT_MAX_PART_BYTES, splitPdf } from "./split-pdf";
import type { PartRange } from "./types";

/** Mistral OCR of one PDF, kept per page of the original PDF. */
export interface OcrCache {
  file: string;
  pageCount: number;
  ocrModel: string;
  partRanges: PartRange[];
  /** 1-based page number in the original PDF to page text. */
  pages: Map<number, string>;
  figures: CrvaFigure[];
}

const pageFile = (page: number) => `page-${String(page).padStart(3, "0")}.md`;

/** Runs OCR once per part, so the agent and the quote check share one text. */
export async function ocrPdf(
  pdf: Buffer,
  file: string,
  opts: {
    maxPartBytes?: number;
    ocr?: (dataUrl: string) => Promise<MistralOcrResult>;
  } = {},
): Promise<OcrCache> {
  const ocr = opts.ocr ?? ((url: string) => convertPdfUrlToMarkdown(url));
  const parts = await splitPdf(
    pdf,
    opts.maxPartBytes ?? DEFAULT_MAX_PART_BYTES,
  );
  const pages = new Map<number, string>();
  const figures: CrvaFigure[] = [];
  let ocrModel = "";

  for (const part of parts) {
    const result = await ocr(
      `data:application/pdf;base64,${part.buffer.toString("base64")}`,
    );
    const offset = part.startPage - 1;
    ocrModel = result.model;
    for (const [page, text] of splitOcrPages(result)) {
      pages.set(page + offset, text);
    }
    for (const figure of listFigures(result)) {
      figures.push({ ...figure, page: figure.page + offset });
    }
  }

  return {
    file,
    pageCount: parts.reduce((sum, p) => sum + p.pageCount, 0),
    ocrModel,
    partRanges: parts.map((p) => ({
      startPage: p.startPage,
      pageCount: p.pageCount,
      bytes: p.buffer.length,
    })),
    pages,
    figures,
  };
}

export async function writeOcrCache(
  dir: string,
  cache: OcrCache,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const { pages, ...meta } = cache;
  await Promise.all(
    [...pages].map(([page, text]) =>
      writeFile(path.join(dir, pageFile(page)), text),
    ),
  );
  await writeFile(path.join(dir, "ocr.json"), JSON.stringify(meta, null, 2));
}

export async function readOcrCache(dir: string): Promise<OcrCache> {
  const meta = JSON.parse(await readFile(path.join(dir, "ocr.json"), "utf8"));
  const pages = new Map<number, string>();
  for (const name of await readdir(dir)) {
    const match = /^page-(\d+)\.md$/.exec(name);
    if (match) {
      pages.set(Number(match[1]), await readFile(path.join(dir, name), "utf8"));
    }
  }
  return { ...meta, pages: new Map([...pages].sort((a, b) => a[0] - b[0])) };
}
