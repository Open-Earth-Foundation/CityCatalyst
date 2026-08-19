import { createHash } from "node:crypto";
import { Op } from "sequelize";

import { db } from "@/models";
import type { ImportedInventoryFile } from "@/models/ImportedInventoryFile";
import type { PdfOcrJob } from "@/models/PdfOcrJob";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import { registerNativeInput } from "@/backend/NativeInputCatalogService";
import { logger } from "@/services/logger";

const GHGI_MODULE = "ghgi" as const;

type ImportedFileCatalogMetadata = {
  importedFileId: string;
  fileType: ImportedInventoryFile["fileType"];
  originalFileName: string;
  storage: "s3" | "bytea";
};

function sourceMetadata(
  importedFile: ImportedInventoryFile,
): ImportedFileCatalogMetadata {
  return {
    importedFileId: importedFile.id,
    fileType: importedFile.fileType,
    originalFileName: importedFile.originalFileName,
    storage: importedFile.s3Key ? "s3" : "bytea",
  };
}

export function buildGHGIImportedInventorySourceInput(
  importedFile: ImportedInventoryFile,
  contentDigest?: string | null,
) {
  return {
    kind: "inventory_source_file",
    owningModule: GHGI_MODULE,
    sourceType: "imported_inventory_file",
    sourceId: importedFile.id,
    userId: importedFile.userId,
    inventoryId: importedFile.inventoryId,
    cityId: importedFile.cityId,
    contentDigest: contentDigest ?? null,
    markdownReady: false,
    labels: sourceMetadata(importedFile),
  } as const;
}

export async function registerGHGIImportedInventorySource(
  importedFile: ImportedInventoryFile,
  contentDigest?: string | null,
) {
  return registerNativeInput(
    buildGHGIImportedInventorySourceInput(importedFile, contentDigest),
  );
}

export async function resolveGHGIImportedInventorySourceDigest(
  importedFile: ImportedInventoryFile,
): Promise<string | null> {
  if (importedFile.contentDigest) return importedFile.contentDigest;

  const buffer =
    await InventoryFileStorageService.resolveImportedFileBuffer(importedFile);
  if (!buffer) return null;

  const contentDigest = createHash("sha256").update(buffer).digest("hex");
  await importedFile.update({ contentDigest });
  return contentDigest;
}

export async function registerGHGIInventory(
  importedFile: ImportedInventoryFile,
) {
  if (importedFile.importStatus !== "completed") {
    throw new Error("Only completed GHGI imports can enter the catalog");
  }

  return registerNativeInput({
    kind: "inventory_import",
    owningModule: GHGI_MODULE,
    sourceType: "inventory",
    sourceId: importedFile.inventoryId,
    userId: importedFile.userId,
    inventoryId: importedFile.inventoryId,
    cityId: importedFile.cityId,
    labels: {
      importedFileId: importedFile.id,
      completedAt: importedFile.completedAt?.toISOString() ?? null,
    },
  });
}

export function buildGHGIInventoryInput(importedFile: ImportedInventoryFile) {
  if (importedFile.importStatus !== "completed") {
    throw new Error("Only completed GHGI imports can enter the catalog");
  }

  return {
    kind: "inventory_import",
    owningModule: GHGI_MODULE,
    sourceType: "inventory",
    sourceId: importedFile.inventoryId,
    userId: importedFile.userId,
    inventoryId: importedFile.inventoryId,
    cityId: importedFile.cityId,
    labels: {
      importedFileId: importedFile.id,
      completedAt: importedFile.completedAt?.toISOString() ?? null,
    },
  } as const;
}

export async function registerGHGIOcrArtifact(job: PdfOcrJob) {
  const input = await buildGHGIOcrArtifactInput(job);
  return registerNativeInput(input);
}

export async function buildGHGIOcrArtifactInput(job: PdfOcrJob) {
  if (
    job.sourceType !== "inventory_import" ||
    job.status !== "succeeded" ||
    !job.resultS3Key ||
    !job.resultSha256 ||
    job.pageCount == null
  ) {
    throw new Error(
      "Only successful GHGI OCR jobs with a result digest and page count can enter the catalog",
    );
  }

  const importedFile = await db.models.ImportedInventoryFile.findByPk(
    job.sourceId,
  );
  if (!importedFile) {
    throw new Error("GHGI OCR source file no longer exists");
  }

  return {
    kind: "inventory_ocr",
    owningModule: GHGI_MODULE,
    sourceType: "pdf_ocr_job",
    sourceId: job.id,
    userId: importedFile.userId,
    inventoryId: importedFile.inventoryId,
    cityId: importedFile.cityId,
    contentDigest: job.resultSha256,
    markdownReady: true,
    labels: {
      importedFileId: importedFile.id,
      pageCount: job.pageCount,
      resultSizeBytes: job.resultSizeBytes ?? null,
      model: job.model ?? null,
    },
  } as const;
}

async function tryCatalogSync<T>(
  operation: () => Promise<T>,
  context: Record<string, unknown>,
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    logger.error(
      { err: error, ...context },
      "GHGI NativeInputCatalog synchronization failed; it will be retried",
    );
    return null;
  }
}

export function syncGHGIImportedInventorySource(
  importedFile: ImportedInventoryFile,
  contentDigest?: string | null,
) {
  return tryCatalogSync(
    async () =>
      registerGHGIImportedInventorySource(
        importedFile,
        contentDigest ??
          (await resolveGHGIImportedInventorySourceDigest(importedFile)),
      ),
    { importedFileId: importedFile.id, catalogKind: "inventory_source_file" },
  );
}

export function syncGHGIInventory(importedFile: ImportedInventoryFile) {
  return tryCatalogSync(() => registerGHGIInventory(importedFile), {
    importedFileId: importedFile.id,
    inventoryId: importedFile.inventoryId,
    catalogKind: "inventory_import",
  });
}

export function syncGHGIOcrArtifact(job: PdfOcrJob) {
  return tryCatalogSync(() => registerGHGIOcrArtifact(job), {
    ocrJobId: job.id,
    importedFileId: job.sourceId,
    catalogKind: "inventory_ocr",
  });
}

export async function syncPendingGHGIOcrArtifacts(limit: number) {
  const registeredCatalogEntries = await db.models.NativeInputCatalog.findAll({
    where: {
      owningModule: GHGI_MODULE,
      sourceType: "pdf_ocr_job",
      availability: { [Op.ne]: "withdrawn" },
    },
    attributes: ["sourceId"],
  });
  const registeredJobIds = new Set(
    registeredCatalogEntries.map((entry) => entry.sourceId),
  );
  const batchSize = Math.max(limit, 1);
  const pendingJobs: PdfOcrJob[] = [];
  let offset = 0;

  while (pendingJobs.length < limit) {
    const jobs = await db.models.PdfOcrJob.findAll({
      where: {
        sourceType: "inventory_import",
        status: "succeeded",
        resultS3Key: { [Op.ne]: null },
        resultSha256: { [Op.ne]: null },
      },
      order: [
        ["completedAt", "ASC"],
        ["id", "ASC"],
      ],
      limit: batchSize,
      offset,
    });

    if (jobs.length === 0) break;

    pendingJobs.push(
      ...jobs.filter((job: PdfOcrJob) => !registeredJobIds.has(job.id)),
    );
    offset += jobs.length;

    if (jobs.length < batchSize) break;
  }

  return Promise.all(
    pendingJobs.slice(0, limit).map((job) => syncGHGIOcrArtifact(job)),
  );
}

export async function withdrawGHGICatalogForInventory(
  inventoryId: string,
): Promise<number> {
  const [updated] = await db.models.NativeInputCatalog.update(
    { availability: "withdrawn" },
    {
      where: {
        owningModule: GHGI_MODULE,
        inventoryId,
        availability: "active",
      },
    },
  );
  logger.info(
    { inventoryId, withdrawn: updated },
    "Withdrew GHGI catalog entries for inventory",
  );
  return updated;
}

export async function withdrawGHGICatalogForCity(
  cityId: string,
): Promise<number> {
  const [updated] = await db.models.NativeInputCatalog.update(
    { availability: "withdrawn" },
    {
      where: {
        owningModule: GHGI_MODULE,
        cityId,
        availability: "active",
      },
    },
  );
  logger.info(
    { cityId, withdrawn: updated },
    "Withdrew GHGI catalog entries for city",
  );
  return updated;
}

export async function withdrawGHGIImportCatalog(
  importedFileId: string,
  ocrJobId?: string,
): Promise<void> {
  const sourceIdentities = [
    { sourceType: "imported_inventory_file", sourceId: importedFileId },
    ...(ocrJobId ? [{ sourceType: "pdf_ocr_job", sourceId: ocrJobId }] : []),
  ];
  await db.models.NativeInputCatalog.update(
    { availability: "withdrawn" },
    {
      where: {
        owningModule: GHGI_MODULE,
        availability: "active",
        [Op.or]: sourceIdentities,
      },
    },
  );
}
