import { describe, expect, it } from "@jest/globals";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";

const MIB = 1024 * 1024;

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Random pixels do not compress, so the PNG is roughly `bytes` large.
function randomPng(bytes: number): Buffer {
  const width = 512;
  const height = Math.ceil(bytes / (width * 3));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rows = Buffer.concat(
    Array.from({ length: height }, () =>
      Buffer.concat([Buffer.from([0]), randomBytes(width * 3)]),
    ),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows, { level: 0 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function buildPdf(pageBytes: number[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const bytes of pageBytes) {
    const page = doc.addPage([200, 200]);
    const image = await doc.embedPng(randomPng(bytes));
    page.drawImage(image, { x: 0, y: 0, width: 200, height: 200 });
  }
  return Buffer.from(await doc.save());
}

import type { MistralOcrResult } from "../src/backend/MistralOcrService";
import {
  ocrPdf,
  readOcrCache,
  writeOcrCache,
} from "../scripts/crva-eval/ocr-cache";

// Stub OCR: page n of a part reads "local n", except the last page of each part,
// which has no text. Every part has one figure on its local page 1.
async function stubOcr(dataUrl: string): Promise<MistralOcrResult> {
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  const count = (await PDFDocument.load(bytes)).getPageCount();
  const markdown = Array.from(
    { length: count },
    (_, i) =>
      `<!-- page: ${i + 1} -->\n${i === count - 1 ? "" : `local ${i + 1}`}\n`,
  ).join("");
  const pages = Array.from({ length: count }, (_, i) => ({
    page_index: i,
    header: null,
    footer: null,
    blocks: [],
    images: i === 0 ? [{ image_id: `img-${count}-${i}` }] : [],
  }));
  return {
    markdown,
    pageCount: count,
    model: "stub-ocr",
    structured: { document: { pages, relationships: [] } },
  } as unknown as MistralOcrResult;
}

describe("ocr cache", () => {
  it("offsets part pages and figures to the original page numbers", async () => {
    const pdf = await buildPdf([MIB, MIB, MIB, MIB, MIB, MIB]);
    const cache = await ocrPdf(pdf, "doc.pdf", {
      maxPartBytes: 2.5 * MIB,
      ocr: stubOcr,
    });

    expect(cache.partRanges.length).toBe(3);
    expect(cache.pageCount).toBe(6);
    expect(cache.ocrModel).toBe("stub-ocr");
    const second = cache.partRanges[1];
    expect(cache.pages.get(second.startPage)).toBe("local 1");
    expect(cache.figures.map((f) => f.page)).toEqual(
      cache.partRanges.map((r) => r.startPage),
    );
    expect([...cache.pages.keys()]).toEqual([1, 2, 3, 4, 5, 6]);
  }, 60_000);

  it("round-trips through the directory and names pages with 3 digits", async () => {
    const pdf = await buildPdf([MIB, MIB, MIB, MIB, MIB, MIB, MIB]);
    const cache = await ocrPdf(pdf, "doc.pdf", {
      maxPartBytes: 3.5 * MIB,
      ocr: stubOcr,
    });
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocr-cache-"));
    try {
      await writeOcrCache(dir, cache);
      expect(await readFile(path.join(dir, "page-007.md"), "utf8")).toBe(
        cache.pages.get(7),
      );
      expect(await readOcrCache(dir)).toEqual(cache);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("writes an empty file for a page without text", async () => {
    const pdf = await buildPdf([10_000, 10_000]);
    const cache = await ocrPdf(pdf, "doc.pdf", { ocr: stubOcr });
    expect(cache.pages.get(2)).toBe("");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocr-cache-"));
    try {
      await writeOcrCache(dir, cache);
      expect(await readFile(path.join(dir, "page-002.md"), "utf8")).toBe("");
      expect((await readOcrCache(dir)).pages.get(2)).toBe("");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
