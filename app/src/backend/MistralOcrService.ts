import { z } from "zod";
import { getPdfOcrConfig } from "@/backend/PdfOcrConfig";

const responseSchema = z.object({
  model: z.string().optional(),
  pages: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      markdown: z.string(),
    }),
  ),
});

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
};

export function mergeMistralPages(
  response: unknown,
  requestedModel: string,
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

  if (!pages.some((page) => page.markdown.trim().length > 0)) {
    throw new MistralOcrError(
      "empty_result",
      true,
      "Mistral OCR returned no Markdown content",
    );
  }

  return {
    markdown: pages
      .map((page) => `<!-- page: ${page.index + 1} -->\n${page.markdown}`)
      .join("\n\n"),
    pageCount: pages.length,
    model: parsed.data.model || requestedModel,
  };
}

export async function convertPdfUrlToMarkdown(
  documentUrl: string,
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
      body: JSON.stringify({
        model: config.model,
        document: { type: "document_url", document_url: documentUrl },
        include_image_base64: false,
      }),
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
  return mergeMistralPages(payload, config.model);
}
