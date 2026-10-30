import type { MatchableCity } from "@/backend/BulkInventoryImportMatcher";
import { matchFile } from "@/backend/BulkInventoryImportMatcher";
import type { ECRFImportResult } from "@/backend/ECRFImportService";
import FileValidatorService, {
  type ValidationResult,
} from "@/backend/FileValidatorService";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import {
  buildBulkInventoryImportResult,
  classifyBulkInventoryFile,
  type BulkInventoryAcceptedKind,
} from "@/backend/InventoryFileAutoImportService";
import InventoryImportService from "@/backend/InventoryImportService";
import type { CoarseFileKind } from "../coarse-kind";
import type {
  IngestMatchResult,
  IngestPlugin,
  IngestPluginContext,
} from "../plugin";
import { IngestItemError } from "../types";

export type GhgiDetectedFormat = {
  kind: BulkInventoryAcceptedKind;
  detectedType: string;
  validation: ValidationResult;
};

export type GhgiAdaptedPayload = {
  kind: BulkInventoryAcceptedKind;
  importResult: ECRFImportResult;
  originalFileName: string;
};

export interface GhgiIngestPluginDeps {
  validateStructure?: (file: File) => Promise<ValidationResult>;
  buildImportResult?: typeof buildBulkInventoryImportResult;
  importEcrf?: typeof InventoryImportService.importECRFData;
  matchFile?: typeof matchFile;
  resolveInventoryId?: (args: {
    cityId: string;
    year: number;
  }) => Promise<string | null>;
  cities?: MatchableCity[];
}

function fileTypeOf(filename: string): "xlsx" | "csv" | "pdf" | "unknown" {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "csv" || ext === "pdf") {
    return ext;
  }
  return "unknown";
}

function toFile(buffer: Buffer, originalFileName: string): File {
  const fileType = fileTypeOf(originalFileName);
  const mime =
    fileType === "unknown"
      ? "application/octet-stream"
      : InventoryFileStorageService.mimeTypeForFileType(fileType);
  return new File([new Uint8Array(buffer)], originalFileName, { type: mime });
}

/**
 * GHGI structured import (eCRF / near-eCRF). PDF, CIRIS, BIOMATEC, and
 * mapping/AI formats are unknown_format so they never call OpenAI.
 */
export class GhgiIngestPlugin implements IngestPlugin {
  readonly moduleId = "ghgi" as const;
  readonly allowedExtensions = ["xlsx", "csv"] as const;
  private readonly detections = new Map<string, GhgiDetectedFormat>();
  private readonly deps: GhgiIngestPluginDeps;

  constructor(deps: GhgiIngestPluginDeps = {}) {
    this.deps = deps;
  }

  async match(ctx: IngestPluginContext): Promise<IngestMatchResult | void> {
    if (ctx.item.targetInventoryId && ctx.item.targetCityId) {
      return;
    }
    if (!this.deps.cities?.length) {
      return;
    }
    const matcher = this.deps.matchFile ?? matchFile;
    const result = matcher(
      {
        originalFileName: ctx.item.originalFileName,
        fileSizeBytes: ctx.item.buffer?.length,
      },
      { cities: this.deps.cities },
    );
    if (result.error) {
      throw new IngestItemError("validation_failed", result.error);
    }
    let targetInventoryId = ctx.item.targetInventoryId ?? null;
    if (result.cityId && result.year != null && this.deps.resolveInventoryId) {
      targetInventoryId = await this.deps.resolveInventoryId({
        cityId: result.cityId,
        year: result.year,
      });
    }
    return {
      targetCityId: result.cityId,
      targetInventoryId,
      coverageYears: result.year != null ? [result.year] : [],
      warnings: result.warnings,
    };
  }

  async detect(
    ctx: IngestPluginContext,
    coarse: CoarseFileKind,
  ): Promise<void> {
    if (coarse === "pdf" || coarse === "md" || coarse === "zip") {
      throw new IngestItemError(
        "unknown_format",
        `GHGI bulk path does not accept ${coarse}`,
      );
    }
    const buffer = ctx.item.buffer;
    if (!buffer) {
      throw new IngestItemError("validation_failed", "Empty file");
    }
    const fileType = fileTypeOf(ctx.item.originalFileName);
    if (fileType === "pdf" || fileType === "unknown") {
      throw new IngestItemError("unknown_format", `not_ecrf:${fileType}`);
    }
    const validate =
      this.deps.validateStructure ??
      ((file: File) => FileValidatorService.validateFileStructure(file));
    const validation = await validate(
      toFile(buffer, ctx.item.originalFileName),
    );
    const classified = classifyBulkInventoryFile(validation);
    if (classified.kind === "not_ecrf" || classified.kind === "multi_city") {
      throw new IngestItemError(
        "unknown_format",
        `not_ecrf:${classified.detectedType}`,
      );
    }
    this.detections.set(ctx.item.id, {
      kind: classified.kind,
      detectedType: classified.detectedType,
      validation,
    });
  }

  async parse(ctx: IngestPluginContext): Promise<Buffer> {
    if (!ctx.item.buffer) {
      throw new IngestItemError("validation_failed", "Empty file");
    }
    return ctx.item.buffer;
  }

  async adapt(
    ctx: IngestPluginContext,
    parsed: unknown,
  ): Promise<GhgiAdaptedPayload> {
    const detection = this.detections.get(ctx.item.id);
    if (!detection) {
      throw new IngestItemError("unknown_format", "Detect did not run");
    }
    const buffer = Buffer.isBuffer(parsed) ? parsed : ctx.item.buffer;
    if (!buffer) {
      throw new IngestItemError("validation_failed", "Empty file");
    }
    const fileType = fileTypeOf(ctx.item.originalFileName);
    if (fileType !== "xlsx" && fileType !== "csv") {
      throw new IngestItemError("unknown_format", `not_ecrf:${fileType}`);
    }
    const build =
      this.deps.buildImportResult ?? buildBulkInventoryImportResult;
    const importResult = await build({
      kind: detection.kind,
      buffer,
      fileType,
      validation: detection.validation,
      inventoryYear: ctx.item.coverageYears[0] ?? undefined,
    });
    return {
      kind: detection.kind,
      importResult,
      originalFileName: ctx.item.originalFileName,
    };
  }

  async validate(
    _ctx: IngestPluginContext,
    adapted: unknown,
  ): Promise<{ warnings?: string[] }> {
    const payload = adapted as GhgiAdaptedPayload;
    if (!payload?.importResult || payload.importResult.validRowCount === 0) {
      throw new IngestItemError("validation_failed", "No valid eCRF rows");
    }
    return { warnings: payload.importResult.warnings };
  }

  approvalPolicy(
    _ctx: IngestPluginContext,
    adapted: unknown,
  ): "auto" | "review" | "reject" {
    const payload = adapted as GhgiAdaptedPayload;
    if (payload.kind === "ecrf" || payload.kind === "near-ecrf") {
      return "auto";
    }
    return "reject";
  }

  async commit(
    ctx: IngestPluginContext,
    adapted: unknown,
  ): Promise<Record<string, unknown>> {
    const payload = adapted as GhgiAdaptedPayload;
    const inventoryId = ctx.item.targetInventoryId ?? ctx.scope.inventoryId;
    if (!inventoryId) {
      throw new IngestItemError(
        "validation_failed",
        "Item is not matched to an inventory",
      );
    }
    const importEcrf =
      this.deps.importEcrf ??
      InventoryImportService.importECRFData.bind(InventoryImportService);
    const summary = await importEcrf(inventoryId, payload.importResult, {
      defaultActivityDataSource: payload.originalFileName,
    });
    return {
      committed: true,
      kind: payload.kind,
      importedRows: summary.importedRows,
      skippedRows: summary.skippedRows,
    };
  }
}
