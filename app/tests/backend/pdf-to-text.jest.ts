/**
 * Unit tests for Path C PDF→text extraction (pdf-parse via server-external load).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pdfBufferToText } from "@/backend/PdfToTextService";

describe("pdfBufferToText", () => {
  it("extracts text from the Path C sample inventory PDF fixture", async () => {
    const buffer = readFileSync(
      resolve(process.cwd(), "tmp-import-fixtures/05-path-c-sample-inventory.pdf"),
    );
    const result = await pdfBufferToText(buffer);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.text.length).toBeGreaterThan(20);
    expect(result.text.toLowerCase()).toMatch(/emissions|inventory|stationary|waste/);
  });

  it("rejects oversized buffers", async () => {
    const { MAX_FILE_SIZE } = await import("@/backend/FileValidatorService");
    const huge = Buffer.alloc(MAX_FILE_SIZE + 1);
    await expect(pdfBufferToText(huge)).rejects.toThrow(/too large/i);
  });
});
