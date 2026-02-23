/**
 * PDF to text for Path C (AI extraction). Extracts raw text from PDF buffer for LLM input.
 * Uses pdf-parse; enforces max pages and size to avoid timeouts.
 */
/// <reference path="./pdf-parse.d.ts" />

import pdfParse from "pdf-parse";
import { MAX_FILE_SIZE } from "./FileValidatorService";

/** Max pages to extract; beyond this we truncate to avoid LLM timeout. */
export const PDF_MAX_PAGES = 100;

export interface PdfToTextResult {
  text: string;
  pageCount: number;
  truncated: boolean;
}

/**
 * Extract text content from a PDF buffer for use in AI extraction.
 * @param buffer - PDF file buffer
 * @param options - Optional maxPages (default PDF_MAX_PAGES); buffer already validated for size (MAX_FILE_SIZE) at upload
 * @returns Extracted text and metadata; text may be truncated if page count exceeds maxPages
 */
export async function pdfBufferToText(
  buffer: Buffer,
  options?: { maxPages?: number },
): Promise<PdfToTextResult> {
  const maxPages = options?.maxPages ?? PDF_MAX_PAGES;

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(
      `PDF too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
    );
  }

  const data = await pdfParse(buffer, { max: maxPages });
  const text = typeof data.text === "string" ? data.text : "";
  const pageCount = typeof data.numpages === "number" ? data.numpages : 0;
  const truncated = pageCount > maxPages;

  return {
    text: text.trim() || "",
    pageCount,
    truncated,
  };
}
