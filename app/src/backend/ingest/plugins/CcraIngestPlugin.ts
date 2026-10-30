import { createLLMClient, type LLMClient } from "@/backend/llm";
import {
  convertPdfUrlToMarkdown,
  type MistralOcrResult,
} from "@/backend/MistralOcrService";
import type { CoarseFileKind } from "../coarse-kind";
import type { IngestPlugin, IngestPluginContext } from "../plugin";
import { IngestItemError } from "../types";
import {
  CRVA_FIELD_IDS,
  CRVA_FIELD_LABELS,
  type CrvaDraftBundle,
  type CrvaFigure,
} from "./ccra/draft-schema";
import {
  dedupeValues,
  extractCrvaFields,
  splitOcrPages,
} from "./ccra/extract-crva-fields";
import { verifyQuotes } from "./ccra/verify-quotes";

/** Separate from the inventory limit (`getPdfOcrConfig().maxSourcePdfBytes`). */
export const CCRA_MAX_PDF_BYTES = 20 * 1024 * 1024;

const MAX_SOURCE_AGE_YEARS = 10;

export interface CcraIngestPluginOptions {
  /** OCR needs a URL and the item holds bytes (document pool: CC-955). */
  resolveDocumentUrl: (ctx: IngestPluginContext) => Promise<string> | string;
  ocr?: (documentUrl: string) => Promise<MistralOcrResult>;
  llm?: () => LLMClient;
  now?: () => Date;
}

function failItem(prefix: string, err: unknown): never {
  if (err instanceof IngestItemError) throw err;
  const detail = err instanceof Error ? err.message : String(err);
  throw new IngestItemError("validation_failed", `${prefix}: ${detail}`);
}

function listFigures(ocr: MistralOcrResult): CrvaFigure[] {
  const { pages, relationships } = ocr.structured.document;
  const blocks = new Map(
    pages.flatMap((page) =>
      page.blocks.map((block) => [block.block_id, block] as const),
    ),
  );
  const captions = new Map<string, string>();
  for (const link of relationships) {
    const imageId = blocks.get(link.to_block_id)?.related_image_id;
    const caption = blocks.get(link.from_block_id)?.content;
    if (link.type === "caption_of_image" && imageId && caption) {
      captions.set(imageId, caption);
    }
  }
  return pages.flatMap((page) =>
    page.images.map((image) => ({
      page: page.page_index + 1,
      imageId: image.image_id,
      caption: captions.get(image.image_id) ?? null,
    })),
  );
}

/**
 * CRVA draft producer. Stops at review and never commits, because no CRVA
 * system of record exists yet. Text only: figures go to human review.
 */
export class CcraIngestPlugin implements IngestPlugin {
  readonly moduleId = "ccra" as const;
  readonly allowedExtensions = ["pdf"] as const;

  constructor(private readonly options: CcraIngestPluginOptions) {}

  detect(ctx: IngestPluginContext, coarse: CoarseFileKind): void {
    if (coarse !== "pdf") {
      throw new IngestItemError(
        "unknown_format",
        `CRVA plugin has no format for ${coarse}`,
      );
    }
    const { buffer } = ctx.item;
    if (!buffer) {
      throw new IngestItemError(
        "validation_failed",
        "File bytes are missing, so the size limit cannot be checked",
      );
    }
    if (buffer.length > CCRA_MAX_PDF_BYTES) {
      throw new IngestItemError("file_too_large");
    }
    if (buffer.toString("latin1", 0, 5) !== "%PDF-") {
      throw new IngestItemError("unknown_format", "File is not a PDF");
    }
  }

  async parse(ctx: IngestPluginContext): Promise<MistralOcrResult> {
    const ocr = this.options.ocr ?? ((url) => convertPdfUrlToMarkdown(url));
    try {
      return await ocr(await this.options.resolveDocumentUrl(ctx));
    } catch (err) {
      failItem("OCR failed", err);
    }
  }

  async adapt(
    ctx: IngestPluginContext,
    parsed: unknown,
  ): Promise<CrvaDraftBundle> {
    const ocr = parsed as MistralOcrResult;
    const file = ctx.item.originalFileName;
    try {
      const client = (this.options.llm ?? createLLMClient)();
      const model = process.env.LLM_EXTRACTION_MODEL?.trim() || undefined;
      const pages = splitOcrPages(ocr);
      const extracted = await extractCrvaFields({ client, model, file, pages });
      const { verified, dropped } = verifyQuotes(extracted.values, pages);
      const values = dedupeValues(verified);
      const covered = new Set(values.map((value) => value.fieldId as string));
      return {
        file,
        pageCount: ocr.pageCount,
        ocrModel: ocr.model,
        extractionModel: model ?? client.getConfig().model,
        values,
        uncoveredFields: CRVA_FIELD_IDS.filter((id) => !covered.has(id)),
        figures: listFigures(ocr),
        dropped: [...extracted.dropped, ...dropped],
      };
    } catch (err) {
      failItem("Extraction failed", err);
    }
  }

  async validate(
    _ctx: IngestPluginContext,
    adapted: unknown,
  ): Promise<{ warnings: string[] }> {
    return { warnings: this.buildWarnings(adapted as CrvaDraftBundle) };
  }

  approvalPolicy(): "review" {
    return "review";
  }

  reviewSummary(
    _ctx: IngestPluginContext,
    adapted: unknown,
  ): Record<string, unknown> {
    const bundle = adapted as CrvaDraftBundle;
    return {
      bundle,
      coverage: {
        fieldCount: CRVA_FIELD_IDS.length,
        coveredCount: CRVA_FIELD_IDS.length - bundle.uncoveredFields.length,
        valueCount: bundle.values.length,
        droppedCount: bundle.dropped.length,
        figureCount: bundle.figures.length,
      },
      warnings: this.buildWarnings(bundle),
    };
  }

  async commit(): Promise<never> {
    throw new IngestItemError(
      "commit_failed",
      "CRVA has no system of record; drafts stop at review",
    );
  }

  private buildWarnings(bundle: CrvaDraftBundle): string[] {
    const currentYear = (this.options.now?.() ?? new Date()).getFullYear();
    const warnings = bundle.uncoveredFields.map(
      (id) => `Required field not covered: ${id} ${CRVA_FIELD_LABELS[id]}`,
    );
    for (const { fieldId, value, source } of bundle.values) {
      if (fieldId !== "A1.2a") continue;
      if (value.year === null) {
        warnings.push(`Data source has no year: ${value.name}`);
        continue;
      }
      if (currentYear - value.year > MAX_SOURCE_AGE_YEARS) {
        warnings.push(
          `Data source over ${MAX_SOURCE_AGE_YEARS} years old (X.1): ${value.name} (${value.year})`,
        );
      }
      const yearInQuote = new RegExp(`(?<!\\d)${value.year}(?!\\d)`);
      if (value.year > currentYear || !yearInQuote.test(source.quote)) {
        warnings.push(
          `Data source year not verified: ${value.name} (${value.year})`,
        );
      }
    }
    return warnings;
  }
}
