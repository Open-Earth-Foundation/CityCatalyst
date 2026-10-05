import { createHash } from "node:crypto";

import type { PdfOcrAnnotationMode } from "@/models/PdfOcrJob";
import {
  parseVisualAnnotation,
  type VisualAnnotation,
} from "@/backend/MistralVisualAnnotation";

export const STRUCTURED_DOCUMENT_SCHEMA_VERSION =
  "citycatalyst.structured-document.1" as const;

const BINARY_PAYLOAD_KEYS = new Set(["image_base64"]);
type NormalizedType =
  | "title"
  | "heading"
  | "header"
  | "footer"
  | "text"
  | "list"
  | "table"
  | "image"
  | "caption"
  | "other";

const PROVIDER_TYPE_MAP: Record<string, NormalizedType> = {
  title: "title",
  heading: "heading",
  header: "header",
  footer: "footer",
  text: "text",
  paragraph: "text",
  list: "list",
  table: "table",
  image: "image",
  figure: "image",
  caption: "caption",
};

const CAPTION_HINT = /^\s*(figure|fig\.|table|tbl\.)\s*\d+/i;
const IMAGE_REF = /!\[[^\]]*\]\(([^)]+)\)/;
const HEADING_PREFIX = /^(#{1,6})(?:\s|$)/;

export class StructuredDocumentError extends Error {
  constructor(
    public readonly code:
      | "malformed_response"
      | "annotation_invalid"
      | "structured_artifact_too_large",
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "StructuredDocumentError";
  }
}

export type BoundingBoxPx = {
  top_left_x: number;
  top_left_y: number;
  bottom_right_x: number;
  bottom_right_y: number;
};

export type BoundingBoxNorm = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type BlockHierarchy = {
  level: number | null;
  parent_block_id: string | null;
  provenance: "provider" | "derived" | "absent";
};

export type StoredVisualAnnotation = {
  source: "image_annotation";
  quantitative_reliability: "unverified";
  page_index: number;
  image_id: string;
  bbox_px: BoundingBoxPx;
  bbox_norm: BoundingBoxNorm;
  provider_annotation: VisualAnnotation;
};

export type NormalizedBlock = {
  block_id: string;
  page_index: number;
  reading_order_index: number;
  provider_type: string | null;
  normalized_type: NormalizedType;
  hierarchy: BlockHierarchy;
  content: string;
  confidence: number | null;
  confidence_metric: "average_content_confidence_score" | null;
  bbox_px: BoundingBoxPx;
  bbox_norm: BoundingBoxNorm;
  related_image_id: string | null;
  related_table_id: string | null;
};

export type NormalizedImage = {
  image_id: string;
  page_index: number;
  bbox_px: BoundingBoxPx;
  bbox_norm: BoundingBoxNorm;
  image_sha256: string | null;
  annotation: StoredVisualAnnotation | null;
};

export type NormalizedTable = {
  table_id: string;
  page_index: number;
  content: string | null;
  bbox_px: BoundingBoxPx | null;
  bbox_norm: BoundingBoxNorm | null;
};

export type DocumentRelationship = {
  id: string;
  type: "caption_of_image" | "caption_of_table" | "provider";
  from_block_id: string;
  to_block_id: string;
  page_index: number;
  provenance: "provider" | "derived";
  rule: string;
};

export type StructuredDocument = {
  schema_version: typeof STRUCTURED_DOCUMENT_SCHEMA_VERSION;
  annotation_mode: PdfOcrAnnotationMode;
  provider: {
    name: "mistral";
    requested_model: string;
    returned_model: string | null;
    payload: Record<string, unknown>;
  };
  document: {
    page_count: number;
    pages: Array<{
      page_index: number;
      dimensions: {
        width: number;
        height: number;
        dpi: number | null;
      };
      header: string | null;
      footer: string | null;
      markdown: string;
      blocks: NormalizedBlock[];
      tables: NormalizedTable[];
      images: NormalizedImage[];
    }>;
    relationships: DocumentRelationship[];
  };
};

type PageDimensions = { width: number; height: number; dpi: number | null };

export function buildStructuredDocument(
  response: unknown,
  options: {
    annotationMode: PdfOcrAnnotationMode;
    requestedModel: string;
  },
): StructuredDocument {
  if (!isRecord(response)) {
    throw malformed("Mistral OCR response must be an object");
  }
  const pagesRaw = response.pages;
  if (!Array.isArray(pagesRaw) || pagesRaw.length === 0) {
    throw malformed("Mistral OCR returned no pages");
  }

  const pages = pagesRaw.map((page, index) => {
    if (!isRecord(page)) throw malformed(`Page ${index} must be an object`);
    return page;
  });
  pages.sort((a, b) => requiredIndex(a) - requiredIndex(b));
  for (let index = 0; index < pages.length; index += 1) {
    if (requiredIndex(pages[index]) !== index) {
      throw malformed("Mistral OCR page indexes must be unique and contiguous");
    }
  }

  const providerPayload = stripBinaryPayload(response);
  const normalizedPages = pages.map((page) => normalizePage(page));
  const relationships = normalizedPages.flatMap((page) => [
    ...providerRelationships(page),
    ...derivedCaptionRelationships(page),
  ]);
  assertRelationshipTargets(normalizedPages, relationships);
  assertAnnotationContract(normalizedPages, options.annotationMode);

  return {
    schema_version: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
    annotation_mode: options.annotationMode,
    provider: {
      name: "mistral",
      requested_model: options.requestedModel,
      returned_model:
        typeof response.model === "string" ? response.model : null,
      payload: providerPayload,
    },
    document: {
      page_count: normalizedPages.length,
      pages: normalizedPages.map(({ providerRelationships: _ignored, ...page }) => {
        void _ignored;
        return page;
      }),
      relationships,
    },
  };
}

type NormalizedPage = StructuredDocument["document"]["pages"][number] & {
  providerRelationships: DocumentRelationship[];
};

function normalizePage(page: Record<string, unknown>): NormalizedPage {
  const pageIndex = requiredIndex(page);
  const dimensions = requiredDimensions(page.dimensions, pageIndex);
  const normalized = normalizeBlocks(page.blocks, pageIndex, dimensions);
  const blocks = normalized.blocks;
  assignHierarchy(blocks, normalized.providerLevels);
  const images = normalizeImages(page.images, pageIndex, dimensions);
  const tables = normalizeTables(page.tables, pageIndex, dimensions);
  linkKnownReferences(blocks, images, tables, pageIndex);
  return {
    page_index: pageIndex,
    dimensions,
    header: optionalText(page.header, `page ${pageIndex} header`),
    footer: optionalText(page.footer, `page ${pageIndex} footer`),
    markdown: requiredText(page.markdown, `page ${pageIndex} markdown`),
    blocks,
    tables,
    images,
    providerRelationships: readProviderRelationships(
      page.relationships,
      pageIndex,
    ),
  };
}

function normalizeBlocks(
  raw: unknown,
  pageIndex: number,
  dimensions: PageDimensions,
): { blocks: NormalizedBlock[]; providerLevels: Array<number | null> } {
  if (raw == null) {
    throw malformed(`Page ${pageIndex} is missing blocks`);
  }
  if (!Array.isArray(raw)) {
    throw malformed(`Page ${pageIndex} blocks must be an array`);
  }
  const providerLevels: Array<number | null> = [];
  const blocks = raw.map((block, readingOrderIndex) => {
    if (!isRecord(block)) {
      throw malformed(
        `Page ${pageIndex} block ${readingOrderIndex} must be an object`,
      );
    }
    const content =
      block.content == null
        ? ""
        : requiredText(
            block.content,
            `page ${pageIndex} block ${readingOrderIndex} content`,
          );
    const providerType =
      block.type == null
        ? null
        : requiredText(block.type, `page ${pageIndex} block type`);
    const boxes = requiredBoxes(
      block,
      dimensions,
      `page ${pageIndex} block ${readingOrderIndex}`,
    );
    const relatedImage = IMAGE_REF.exec(content);
    const providerImageId = optionalIdentifier(block.image_id);
    const markdownImageId = relatedImage?.[1] ?? null;
    if (
      providerImageId &&
      markdownImageId &&
      providerImageId !== markdownImageId
    ) {
      throw malformed(
        `Page ${pageIndex} block ${readingOrderIndex} image id does not match its markdown reference`,
      );
    }
    providerLevels.push(readProviderLevel(block.level));
    const confidence = readAverageContentConfidence(block.confidence_scores);
    const normalized: NormalizedBlock = {
      block_id: `p${pageIndex}-b${readingOrderIndex}`,
      page_index: pageIndex,
      reading_order_index: readingOrderIndex,
      provider_type: providerType,
      normalized_type: mapNormalizedType(providerType, content),
      hierarchy: {
        level: null,
        parent_block_id: null,
        provenance: "absent",
      },
      content,
      confidence: confidence?.value ?? null,
      confidence_metric: confidence?.metric ?? null,
      bbox_px: boxes.bbox_px,
      bbox_norm: boxes.bbox_norm,
      related_image_id: providerImageId ?? markdownImageId,
      related_table_id: optionalIdentifier(block.table_id),
    };
    return normalized;
  });
  return { blocks, providerLevels };
}

function assignHierarchy(
  blocks: NormalizedBlock[],
  providerLevels: Array<number | null>,
): void {
  const headingStack: NormalizedBlock[] = [];
  blocks.forEach((block, index) => {
    const providerLevel = providerLevels[index] ?? null;
    const derivedLevel = providerLevel == null ? headingLevel(block) : null;
    const level = providerLevel ?? derivedLevel;
    while (
      headingStack.length > 0 &&
      level != null &&
      (headingStack[headingStack.length - 1].hierarchy.level ?? 0) >= level
    ) {
      headingStack.pop();
    }
    const parent = headingStack[headingStack.length - 1];
    const parentId =
      parent && parent.block_id !== block.block_id ? parent.block_id : null;
    block.hierarchy = {
      level,
      parent_block_id: parentId,
      provenance:
        providerLevel != null && parentId == null
          ? "provider"
          : providerLevel != null || derivedLevel != null || parentId != null
            ? "derived"
            : "absent",
    };
    if (
      level != null &&
      (block.normalized_type === "title" ||
        block.normalized_type === "heading" ||
        providerLevel != null)
    ) {
      headingStack.push(block);
    }
  });
}

function readProviderLevel(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function headingLevel(block: NormalizedBlock): number | null {
  const match = HEADING_PREFIX.exec(block.content.trim());
  if (match) return match[1].length;
  if (block.normalized_type === "title") return 1;
  return null;
}

function normalizeImages(
  raw: unknown,
  pageIndex: number,
  dimensions: PageDimensions,
): NormalizedImage[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw malformed(`Page ${pageIndex} images must be an array`);
  }
  const seen = new Set<string>();
  return raw.map((image, index) => {
    if (!isRecord(image)) {
      throw malformed(`Page ${pageIndex} image ${index} must be an object`);
    }
    const imageId =
      typeof image.id === "string" && image.id.length > 0
        ? image.id
        : `img-p${pageIndex}-${index}`;
    if (seen.has(imageId)) {
      throw malformed(`Duplicate image id ${imageId}`);
    }
    seen.add(imageId);
    const boxes = requiredBoxes(
      image,
      dimensions,
      `page ${pageIndex} image ${imageId}`,
    );
    const annotation = readStoredAnnotation(
      image.image_annotation,
      pageIndex,
      imageId,
      boxes,
    );
    const imageSha = imageSha256(image);
    return {
      image_id: imageId,
      page_index: pageIndex,
      bbox_px: boxes.bbox_px,
      bbox_norm: boxes.bbox_norm,
      image_sha256: imageSha,
      annotation,
    };
  });
}

function normalizeTables(
  raw: unknown,
  pageIndex: number,
  dimensions: PageDimensions,
): NormalizedTable[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw malformed(`Page ${pageIndex} tables must be an array`);
  }
  const seen = new Set<string>();
  return raw.map((table, index) => {
    if (!isRecord(table)) {
      throw malformed(`Page ${pageIndex} table ${index} must be an object`);
    }
    const tableId =
      typeof table.id === "string" && table.id.length > 0
        ? table.id
        : `table-p${pageIndex}-${index}`;
    if (seen.has(tableId)) {
      throw malformed(`Duplicate table id ${tableId}`);
    }
    seen.add(tableId);
    const content = tableContent(table);
    const hasAnyCorner = ["top_left_x", "top_left_y", "bottom_right_x", "bottom_right_y"].some(
      (key) => table[key] != null,
    );
    const boxes = hasAnyCorner
      ? requiredBoxes(table, dimensions, `page ${pageIndex} table ${tableId}`)
      : null;
    return {
      table_id: tableId,
      page_index: pageIndex,
      content,
      bbox_px: boxes?.bbox_px ?? null,
      bbox_norm: boxes?.bbox_norm ?? null,
    };
  });
}

function readStoredAnnotation(
  raw: unknown,
  pageIndex: number,
  imageId: string,
  boxes: { bbox_px: BoundingBoxPx; bbox_norm: BoundingBoxNorm },
): StoredVisualAnnotation | null {
  if (raw == null) return null;
  const providerAnnotation = parseVisualAnnotation(raw);
  if (!providerAnnotation) return null;
  return {
    source: "image_annotation",
    quantitative_reliability: "unverified",
    page_index: pageIndex,
    image_id: imageId,
    bbox_px: boxes.bbox_px,
    bbox_norm: boxes.bbox_norm,
    provider_annotation: providerAnnotation,
  };
}

function assertAnnotationContract(
  pages: NormalizedPage[],
  annotationMode: PdfOcrAnnotationMode,
): void {
  if (annotationMode !== "visual_context") return;
  for (const page of pages) {
    for (const image of page.images) {
      if (!image.annotation) {
        throw annotationInvalid(
          `Requested annotation is missing for image ${image.image_id}`,
        );
      }
    }
    for (const block of page.blocks) {
      if (!isImageRegion(block)) continue;
      const image = page.images.find(
        (candidate) => candidate.image_id === block.related_image_id,
      );
      if (!image?.annotation) {
        throw annotationInvalid(
          `Requested annotation is missing for figure ${block.block_id}`,
        );
      }
    }
  }
}

function isImageRegion(block: NormalizedBlock): boolean {
  const providerType = block.provider_type?.toLowerCase();
  return (
    block.normalized_type === "image" ||
    providerType === "image" ||
    providerType === "figure"
  );
}

function derivedCaptionRelationships(page: NormalizedPage): DocumentRelationship[] {
  const maxGap = page.dimensions.height * 0.1;
  const relationships: DocumentRelationship[] = [];
  page.blocks.forEach((block, index) => {
    if (block.normalized_type !== "image" && block.normalized_type !== "table") {
      return;
    }
    const candidates = [-1, 1]
      .map((offset) => page.blocks[index + offset])
      .filter(
        (neighbor): neighbor is NormalizedBlock =>
          !!neighbor &&
          neighbor.normalized_type === "caption" &&
          Math.abs(neighbor.reading_order_index - block.reading_order_index) ===
            1,
      )
      .map((neighbor) => ({ neighbor, gap: verticalGap(block, neighbor) }))
      .filter((candidate) => candidate.gap <= maxGap)
      .sort((a, b) => a.gap - b.gap);
    if (candidates.length === 0) return;
    if (
      candidates.length > 1 &&
      Math.abs(candidates[0].gap - candidates[1].gap) < 1e-9
    ) {
      return;
    }
    const caption = candidates[0].neighbor;
    relationships.push({
      id: `rel-p${page.page_index}-${block.block_id}-${caption.block_id}`,
      type:
        block.normalized_type === "image"
          ? "caption_of_image"
          : "caption_of_table",
      from_block_id: caption.block_id,
      to_block_id: block.block_id,
      page_index: page.page_index,
      provenance: "derived",
      rule: "nearest_caption_same_page",
    });
  });
  return relationships;
}

function providerRelationships(page: NormalizedPage): DocumentRelationship[] {
  return page.providerRelationships;
}

function readProviderRelationships(
  raw: unknown,
  pageIndex: number,
): DocumentRelationship[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw malformed(`Page ${pageIndex} relationships must be an array`);
  }
  return raw.map((relationship, index) => {
    if (!isRecord(relationship)) {
      throw malformed(`Page ${pageIndex} relationship ${index} is invalid`);
    }
    const from = requiredText(
      relationship.from_block_id,
      `relationship ${index} from_block_id`,
    );
    const to = requiredText(
      relationship.to_block_id,
      `relationship ${index} to_block_id`,
    );
    return {
      id:
        typeof relationship.id === "string"
          ? relationship.id
          : `provider-rel-p${pageIndex}-${index}`,
      type: "provider",
      from_block_id: from,
      to_block_id: to,
      page_index: pageIndex,
      provenance: "provider",
      rule: "provider",
    };
  });
}

function assertRelationshipTargets(
  pages: NormalizedPage[],
  relationships: DocumentRelationship[],
): void {
  const blockIds = new Set(pages.flatMap((page) => page.blocks.map((block) => block.block_id)));
  const imageIds = new Set(pages.flatMap((page) => page.images.map((image) => image.image_id)));
  const tableIds = new Set(pages.flatMap((page) => page.tables.map((table) => table.table_id)));
  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.related_image_id && !imageIds.has(block.related_image_id)) {
        throw malformed(
          `Block ${block.block_id} references missing image ${block.related_image_id}`,
        );
      }
      if (block.related_table_id && !tableIds.has(block.related_table_id)) {
        throw malformed(
          `Block ${block.block_id} references missing table ${block.related_table_id}`,
        );
      }
    }
  }
  for (const relationship of relationships) {
    if (
      !blockIds.has(relationship.from_block_id) ||
      !blockIds.has(relationship.to_block_id)
    ) {
      throw malformed(
        `Relationship ${relationship.id} references a missing block`,
      );
    }
  }
}

function linkKnownReferences(
  blocks: NormalizedBlock[],
  images: NormalizedImage[],
  tables: NormalizedTable[],
  pageIndex: number,
): void {
  const imageIds = new Set(images.map((image) => image.image_id));
  const tableIds = new Set(tables.map((table) => table.table_id));
  for (const block of blocks) {
    if (block.related_image_id && !imageIds.has(block.related_image_id)) {
      throw malformed(
        `Page ${pageIndex} block ${block.block_id} references missing image ${block.related_image_id}`,
      );
    }
    if (block.related_table_id && !tableIds.has(block.related_table_id)) {
      throw malformed(
        `Page ${pageIndex} block ${block.block_id} references missing table ${block.related_table_id}`,
      );
    }
  }
}

function mapNormalizedType(
  providerType: string | null,
  content: string,
): NormalizedType {
  if (providerType) {
    const mapped = PROVIDER_TYPE_MAP[providerType.toLowerCase()];
    if (mapped) return mapped;
  }
  if (CAPTION_HINT.test(content)) return "caption";
  return "other";
}

function requiredBoxes(
  raw: Record<string, unknown>,
  dimensions: PageDimensions,
  label: string,
): { bbox_px: BoundingBoxPx; bbox_norm: BoundingBoxNorm } {
  const bbox_px = {
    top_left_x: requiredCoordinate(raw.top_left_x, `${label} top_left_x`),
    top_left_y: requiredCoordinate(raw.top_left_y, `${label} top_left_y`),
    bottom_right_x: requiredCoordinate(
      raw.bottom_right_x,
      `${label} bottom_right_x`,
    ),
    bottom_right_y: requiredCoordinate(
      raw.bottom_right_y,
      `${label} bottom_right_y`,
    ),
  };
  if (
    bbox_px.bottom_right_x < bbox_px.top_left_x ||
    bbox_px.bottom_right_y < bbox_px.top_left_y ||
    bbox_px.top_left_x < 0 ||
    bbox_px.top_left_y < 0 ||
    bbox_px.bottom_right_x > dimensions.width ||
    bbox_px.bottom_right_y > dimensions.height
  ) {
    throw malformed(`${label} has coordinates outside the page`);
  }
  return {
    bbox_px,
    bbox_norm: {
      x0: bbox_px.top_left_x / dimensions.width,
      y0: bbox_px.top_left_y / dimensions.height,
      x1: bbox_px.bottom_right_x / dimensions.width,
      y1: bbox_px.bottom_right_y / dimensions.height,
    },
  };
}

function requiredDimensions(raw: unknown, pageIndex: number): PageDimensions {
  if (!isRecord(raw)) {
    throw malformed(`Page ${pageIndex} is missing dimensions`);
  }
  const width = requiredPositive(raw.width, `page ${pageIndex} width`);
  const height = requiredPositive(raw.height, `page ${pageIndex} height`);
  const dpi =
    raw.dpi == null ? null : requiredPositive(raw.dpi, `page ${pageIndex} dpi`);
  return { width, height, dpi };
}

function readAverageContentConfidence(raw: unknown): {
  value: number;
  metric: "average_content_confidence_score";
} | null {
  if (!isRecord(raw)) return null;
  const value = raw.average_content_confidence_score;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return { value, metric: "average_content_confidence_score" };
}

function optionalIdentifier(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

function imageSha256(image: Record<string, unknown>): string | null {
  if (typeof image.image_base64 === "string") {
    return createHash("sha256").update(image.image_base64, "utf8").digest("hex");
  }
  if (typeof image.image_sha256 === "string" && /^[0-9a-f]{64}$/i.test(image.image_sha256)) {
    return image.image_sha256.toLowerCase();
  }
  return null;
}

function tableContent(table: Record<string, unknown>): string | null {
  for (const key of ["markdown", "content", "html"]) {
    const value = table[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function stripBinaryPayload(value: unknown): Record<string, unknown> {
  const stripped = stripBinary(value);
  if (!isRecord(stripped)) {
    throw malformed("Mistral OCR response must be an object");
  }
  return stripped;
}

function stripBinary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripBinary(item));
  if (!isRecord(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (BINARY_PAYLOAD_KEYS.has(key)) continue;
    copy[key] = stripBinary(nested);
  }
  return copy;
}

function verticalGap(a: NormalizedBlock, b: NormalizedBlock): number {
  if (a.bbox_px.bottom_right_y <= b.bbox_px.top_left_y) {
    return b.bbox_px.top_left_y - a.bbox_px.bottom_right_y;
  }
  if (b.bbox_px.bottom_right_y <= a.bbox_px.top_left_y) {
    return a.bbox_px.top_left_y - b.bbox_px.bottom_right_y;
  }
  return 0;
}

function requiredIndex(page: Record<string, unknown>): number {
  if (typeof page.index !== "number" || !Number.isInteger(page.index) || page.index < 0) {
    throw malformed("Mistral OCR page index must be a non-negative integer");
  }
  return page.index;
}

function requiredCoordinate(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw malformed(`${label} must be a finite number`);
  }
  return value;
}

function requiredPositive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw malformed(`${label} must be a positive number`);
  }
  return value;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string") throw malformed(`${label} must be a string`);
  return value;
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function malformed(message: string): StructuredDocumentError {
  return new StructuredDocumentError("malformed_response", true, message);
}

function annotationInvalid(message: string): StructuredDocumentError {
  return new StructuredDocumentError("annotation_invalid", true, message);
}
