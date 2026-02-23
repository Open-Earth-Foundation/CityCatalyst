/**
 * Type declarations for pdf-parse (no bundled types).
 * Optional: install @types/pdf-parse for full typings.
 */
declare module "pdf-parse" {
  interface PdfParseOptions {
    max?: number;
    pagerender?: (pageData: unknown) => string;
    version?: string;
  }

  interface PdfParseResult {
    numpages: number;
    numrender: number;
    text: string;
    info?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    version?: string;
  }

  function pdfParse(
    buffer: Buffer,
    options?: PdfParseOptions,
  ): Promise<PdfParseResult>;

  export = pdfParse;
}
