import { z } from "zod";
import { getPdfOcrConfig } from "@/backend/pdf-ocr-config";
import { bboxAnnotationFormat } from "@/backend/MistralVisualAnnotation";
import {
  buildStructuredDocument,
  StructuredDocumentError,
  type StructuredDocument,
} from "@/backend/StructuredDocumentArtifact";
import type { PdfOcrAnnotationMode } from "@/models/PdfOcrJob";

const responseSchema = z.object({
  model: z.string().optional(),
  pages: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      markdown: z.string(),
      header: z.string().nullish(),
      footer: z.string().nullish(),
      tables: z
        .array(z.object({ id: z.string(), content: z.string() }))
        .optional(),
    }),
  ),
});

const TABLE_PLACEHOLDER_PATTERN = /^tbl-[\w-]+\.md$/;

function tableReferenceId(path: string): string | null {
  return TABLE_PLACEHOLDER_PATTERN.test(path) ? path.slice(0, -3) : null;
}

function tableId(value: string): string | null {
  return tableReferenceId(value.endsWith(".md") ? value : `${value}.md`);
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assemblePageMarkdown(
  page: z.infer<typeof responseSchema>["pages"][number],
  tablePages: Map<string, Set<number>>,
): string {
  const pageTables = new Map<string, string>();
  for (const table of page.tables ?? []) {
    const id = tableId(table.id);
    if (!id || pageTables.has(id)) {
      throw new MistralOcrError(
        "invalid_table_reference",
        true,
        "Mistral OCR returned a duplicate or invalid table ID",
      );
    }
    if (!table.content.trim()) {
      throw new MistralOcrError(
        "invalid_table_reference",
        true,
        "Mistral OCR returned a table without Markdown content",
      );
    }
    pageTables.set(id, table.content);
  }

  const resolved = new Set<string>();
  const resolveTables = (text: string): string =>
    text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (link, _label: string, target: string) => {
        const id = tableReferenceId(target);
        if (!id) return link;

        const content = pageTables.get(id);
        if (content === undefined) {
          const matchingPages = tablePages.get(id);
          const code = matchingPages?.size
            ? "cross_page_table_reference"
            : "missing_table_reference";
          throw new MistralOcrError(
            code,
            true,
            matchingPages?.size
              ? "Mistral OCR table placeholder refers to a table on another page"
              : "Mistral OCR table placeholder has no matching table",
          );
        }
        if (resolved.has(id)) {
          throw new MistralOcrError(
            "invalid_table_reference",
            true,
            "Mistral OCR returned a duplicate table placeholder",
          );
        }
        resolved.add(id);
        return content;
      },
    );

  // Header and footer are returned separately by Mistral (extract_header /
  // extract_footer). Blank sections are skipped so a page without them keeps
  // its body-only output byte for byte.
  const hasHeaderOrFooter = hasText(page.header) || hasText(page.footer);
  const markdown = hasHeaderOrFooter
    ? [page.header, page.markdown, page.footer]
        .filter(hasText)
        .map(resolveTables)
        .join("\n\n")
    : resolveTables(page.markdown);

  if (resolved.size !== pageTables.size) {
    throw new MistralOcrError(
      "unplaced_table",
      true,
      "Mistral OCR returned a table without a Markdown placeholder",
    );
  }
  return markdown;
}

export class MistralOcrError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "MistralOcrError";
  }
}

export type MistralOcrResult = {
  markdown: string;
  pageCount: number;
  model: string;
  structured: StructuredDocument;
};

export function buildMistralOcrRequest(
  documentUrl: string,
  model: string,
  annotationMode: PdfOcrAnnotationMode,
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    model,
    document: { type: "document_url", document_url: documentUrl },
    include_blocks: true,
    confidence_scores_granularity: "block",
    extract_header: true,
    extract_footer: true,
    table_format: "markdown",
    include_image_base64: false,
  };
  if (annotationMode === "visual_context") {
    request.bbox_annotation_format = bboxAnnotationFormat();
  }
  return request;
}

export function mergeMistralPages(
  response: unknown,
  requestedModel: string,
  annotationMode: PdfOcrAnnotationMode = "none",
): MistralOcrResult {
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success || parsed.data.pages.length === 0) {
    throw new MistralOcrError(
      "malformed_response",
      true,
      "Mistral OCR returned an invalid page response",
    );
  }

  const pages = [...parsed.data.pages].sort((a, b) => a.index - b.index);
  for (let index = 0; index < pages.length; index += 1) {
    if (pages[index].index !== index) {
      throw new MistralOcrError(
        "malformed_response",
        true,
        "Mistral OCR page indexes must be unique and contiguous",
      );
    }
  }

  if (
    !pages.some(
      (page) =>
        hasText(page.markdown) || hasText(page.header) || hasText(page.footer),
    )
  ) {
    throw new MistralOcrError(
      "empty_result",
      true,
      "Mistral OCR returned no Markdown content",
    );
  }

  const tablePages = new Map<string, Set<number>>();
  for (const page of pages) {
    for (const table of page.tables ?? []) {
      const id = tableId(table.id);
      if (!id) continue;
      const matchingPages = tablePages.get(id) ?? new Set<number>();
      matchingPages.add(page.index);
      tablePages.set(id, matchingPages);
    }
  }
  if (
    [...tablePages.values()].some((matchingPages) => matchingPages.size > 1)
  ) {
    throw new MistralOcrError(
      "invalid_table_reference",
      true,
      "Mistral OCR returned duplicate table IDs across pages",
    );
  }
  const markdown = pages
    .map(
      (page) =>
        `<!-- page: ${page.index + 1} -->\n${assemblePageMarkdown(page, tablePages)}`,
    )
    .join("\n\n");

  let structured: StructuredDocument;
  try {
    structured = buildStructuredDocument(response, {
      annotationMode,
      requestedModel,
    });
  } catch (error) {
    if (error instanceof StructuredDocumentError) {
      throw new MistralOcrError(error.code, error.retryable, error.message);
    }
    throw error;
  }

  return {
    markdown,
    pageCount: pages.length,
    model: parsed.data.model || requestedModel,
    structured,
  };
}

export async function convertPdfUrlToMarkdown(
  documentUrl: string,
  annotationMode: PdfOcrAnnotationMode = "none",
): Promise<MistralOcrResult> {
  const config = getPdfOcrConfig();
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new MistralOcrError(
      "mistral_not_configured",
      false,
      "MISTRAL_API_KEY is not configured",
    );
  }

  let response: Response;
  try {
    response = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildMistralOcrRequest(documentUrl, config.model, annotationMode),
      ),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new MistralOcrError(
      timedOut ? "mistral_timeout" : "mistral_network_error",
      true,
      timedOut ? "Mistral OCR request timed out" : "Mistral OCR request failed",
    );
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const code =
      response.status === 401 || response.status === 403
        ? "mistral_authentication_failed"
        : retryable
          ? "mistral_transient_error"
          : "invalid_pdf_source";
    throw new MistralOcrError(
      code,
      retryable,
      `Mistral OCR request failed with status ${response.status}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MistralOcrError(
      "malformed_response",
      true,
      "Mistral OCR returned invalid JSON",
    );
  }
  return mergeMistralPages(payload, config.model, annotationMode);
}
