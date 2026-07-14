/**
 * PDF to text for Path C (AI extraction). Extracts raw text from PDF buffer for LLM input.
 *
 * Uses `unpdf` (serverless-friendly pdf.js) instead of `pdf-parse`. The latter's vendored
 * pdf.js breaks when bundled by Next.js Turbopack with misleading "bad XRef entry" errors
 * even on valid PDFs. `unpdf` is kept external via `serverExternalPackages` as a safeguard.
 *
 * Inputs: PDF `Buffer` (size already capped at upload via MAX_FILE_SIZE).
 * Outputs: trimmed text, page count, truncated flag when pageCount exceeds maxPages.
 */
import { extractText } from "unpdf";
import { MAX_FILE_SIZE } from "./FileValidatorService";

/** Max pages to extract; beyond this we truncate to avoid LLM timeout. */
export const PDF_MAX_PAGES = 100;

export interface PdfToTextResult {
  text: string;
  pageCount: number;
  truncated: boolean;
}

/**
 * Normalize unpdf text output (string or per-page string[]) into one document string.
 *
 * @param text - Merged string or page array from extractText
 */
function normalizeExtractedText(text: string | string[]): string {
  if (Array.isArray(text)) {
    return text.filter(Boolean).join("\n");
  }
  return typeof text === "string" ? text : "";
}

/**
 * Extract text content from a PDF buffer for use in AI extraction.
 *
 * @param buffer - PDF file buffer
 * @param options - Optional maxPages (default PDF_MAX_PAGES); buffer already validated for size (MAX_FILE_SIZE) at upload
 * @returns Extracted text and metadata; text may be truncated if page count exceeds maxPages
 * @throws Error when buffer exceeds MAX_FILE_SIZE or the PDF cannot be parsed
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

  const result = await extractText(new Uint8Array(buffer), {
    mergePages: true,
  });
  const pageCount =
    typeof result.totalPages === "number" ? result.totalPages : 0;
  const truncated = pageCount > maxPages;
  const text = normalizeExtractedText(result.text).trim();

  return {
    text,
    pageCount,
    truncated,
  };
}
