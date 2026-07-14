/**
 * Unit tests for Path C PDF→text extraction via `unpdf`.
 *
 * Note: `unpdf` is ESM; if this suite fails under default Jest, run with
 * `--experimental-vm-modules` (runtime Next.js extraction is verified separately).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pdfBufferToText } from "@/backend/PdfToTextService";

describe("pdfBufferToText", () => {
  it("extracts text from the Path C sample inventory PDF fixture", async () => {
    const buffer = readFileSync(
      resolve(process.cwd(), "tests/fixtures/path-c-sample-inventory.pdf"),
    );
    const result = await pdfBufferToText(buffer);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.text.length).toBeGreaterThan(20);
    expect(result.text.toLowerCase()).toMatch(
      /emissions|inventory|stationary|waste/,
    );
    expect(result.truncated).toBe(false);
  });

  it("enforces maxPages by truncating returned text", async () => {
    const buffer = readFileSync(
      resolve(process.cwd(), "tests/fixtures/path-c-sample-inventory.pdf"),
    );
    const full = await pdfBufferToText(buffer);
    const capped = await pdfBufferToText(buffer, { maxPages: 0 });
    expect(capped.truncated).toBe(full.pageCount > 0);
    expect(capped.text).toBe("");
    expect(capped.pageCount).toBe(full.pageCount);
  });

  it("rejects oversized buffers", async () => {
    const { MAX_FILE_SIZE } = await import("@/backend/FileValidatorService");
    const huge = Buffer.alloc(MAX_FILE_SIZE + 1);
    await expect(pdfBufferToText(huge)).rejects.toThrow(/too large/i);
  });
});
