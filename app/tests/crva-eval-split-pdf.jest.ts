import { describe, expect, it } from "@jest/globals";
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { splitPdf } from "../scripts/crva-eval/split-pdf";

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

describe("splitPdf", () => {
  it("splits a 5-page PDF into consecutive parts under the limit", async () => {
    const max = 3 * MIB;
    const pdf = await buildPdf([MIB, MIB, MIB, MIB, MIB]);
    const parts = await splitPdf(pdf, max);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].startPage).toBe(1);
    for (const part of parts)
      expect(part.buffer.length).toBeLessThanOrEqual(max);
    parts.forEach((part, i) => {
      expect(part.index).toBe(i);
      if (i > 0) {
        expect(part.startPage).toBe(
          parts[i - 1].startPage + parts[i - 1].pageCount,
        );
      }
    });
    expect(parts.reduce((sum, p) => sum + p.pageCount, 0)).toBe(5);
  }, 60_000);

  it("returns one part when the PDF fits", async () => {
    const pdf = await buildPdf([10_000, 10_000, 10_000, 10_000, 10_000]);
    const parts = await splitPdf(pdf);

    expect(parts).toHaveLength(1);
    expect(parts[0].pageCount).toBe(5);
    expect(parts[0].startPage).toBe(1);
  });

  it("throws when one page alone exceeds the limit", async () => {
    const pdf = await buildPdf([10_000, 10_000, 2 * MIB, 10_000]);
    await expect(splitPdf(pdf, MIB)).rejects.toThrow(/page 3/i);
  }, 60_000);
});
