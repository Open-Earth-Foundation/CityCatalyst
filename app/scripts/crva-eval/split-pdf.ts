import { PDFDocument } from "pdf-lib";
import type { PdfPart } from "./types";

// The adapter rejects files above 20 MiB, so parts stay safely below that.
export const DEFAULT_MAX_PART_BYTES = 15 * 1024 * 1024;

const mib = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

async function buildPart(
  source: PDFDocument,
  pageIndexes: number[],
): Promise<Buffer> {
  const part = await PDFDocument.create();
  const pages = await part.copyPages(source, pageIndexes);
  pages.forEach((page) => part.addPage(page));
  return Buffer.from(await part.save());
}

/** Splits a PDF into consecutive parts of at most `maxPartBytes` each. */
export async function splitPdf(
  buffer: Buffer,
  maxPartBytes: number = DEFAULT_MAX_PART_BYTES,
): Promise<PdfPart[]> {
  const source = await PDFDocument.load(buffer);
  const total = source.getPageCount();

  if (buffer.length <= maxPartBytes) {
    return [{ index: 0, startPage: 1, pageCount: total, buffer }];
  }

  const parts: PdfPart[] = [];
  let start = 0;
  let current: { pages: number[]; buffer: Buffer } | null = null;

  const closePart = () => {
    if (!current) return;
    parts.push({
      index: parts.length,
      startPage: start + 1,
      pageCount: current.pages.length,
      buffer: current.buffer,
    });
    start += current.pages.length;
    current = null;
  };

  for (let page = 0; page < total; page++) {
    const pages: number[] = [...(current?.pages ?? []), page];
    const saved = await buildPart(source, pages);
    if (saved.length <= maxPartBytes) {
      current = { pages, buffer: saved };
      continue;
    }
    if (!current) {
      throw new Error(
        `Page ${page + 1} alone is ${mib(saved.length)} MiB, above the ${mib(maxPartBytes)} MiB part limit`,
      );
    }
    // Page does not fit: close the part before it and retry it in a new one.
    closePart();
    page--;
  }
  closePart();
  return parts;
}
