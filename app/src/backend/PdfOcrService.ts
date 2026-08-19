import { createHash, randomUUID } from "node:crypto";
import { literal, Op } from "sequelize";
import { db } from "@/models";
import type {
  ImportedInventoryFile,
  ImportedInventoryFileAttributes,
} from "@/models/ImportedInventoryFile";
import type { PdfOcrJob, PdfOcrStatus } from "@/models/PdfOcrJob";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import {
  convertPdfUrlToMarkdown,
  MistralOcrError,
} from "@/backend/MistralOcrService";
import {
  getPdfOcrConfig,
  getPdfOcrRetryDelayMs,
} from "@/backend/pdf-ocr-config";
import { extractInventoryRowsFromDocument } from "@/backend/InventoryExtractionService";
import { ImportStatusEnum } from "@/util/enums";
import { logger } from "@/services/logger";
import {
  syncGHGIImportedInventorySource,
  syncGHGIOcrArtifact,
  syncPendingGHGIOcrArtifacts,
  withdrawGHGIImportCatalog,
} from "@/backend/GHGINativeInputCatalogService";

const INVENTORY_SOURCE_TYPE = "inventory_import" as const;
const CONCEPT_NOTE_SOURCE_TYPE = "concept_note_upload" as const;
export const DIRECT_MARKDOWN_MODEL = "direct_markdown" as const;
export type ConceptNoteSourceFormat = "pdf" | "markdown";

export function conceptNotePdfSourceKey(uploadId: string): string {
  return `pdf-ocr/sources/${CONCEPT_NOTE_SOURCE_TYPE}/${uploadId}/source.pdf`;
}

function resultKey(
  sourceType: string,
  sourceId: string,
  resultRevision: number | string,
): string {
  return `pdf-ocr/results/${sourceType}/${sourceId}/${resultRevision}/combined_markdown.md`;
}

export function normalizeConceptNoteMarkdown(markdown: string): string {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (normalized.includes("\0")) {
    throw new PdfSourceError(
      "invalid_markdown_source",
      "Markdown source cannot contain NUL bytes",
    );
  }
  if (!normalized.trim()) {
    throw new PdfSourceError(
      "empty_markdown_source",
      "Markdown source must contain non-whitespace text",
    );
  }
  return normalized;
}

export function getConceptNoteSourceFormat(job: {
  model?: string | null;
}): ConceptNoteSourceFormat {
  return job.model === DIRECT_MARKDOWN_MODEL ? "markdown" : "pdf";
}

export class PdfSourceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function sanitizedMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "PDF OCR failed";
}

export async function enqueueInventoryPdfOcr(
  importedFile: ImportedInventoryFile,
): Promise<PdfOcrJob> {
  const [job] = await db.models.PdfOcrJob.findOrCreate({
    where: {
      sourceType: INVENTORY_SOURCE_TYPE,
      sourceId: importedFile.id,
    },
    defaults: {
      sourceType: INVENTORY_SOURCE_TYPE,
      sourceId: importedFile.id,
      status: "queued",
      attemptCount: 0,
      runAfter: new Date(),
      deliveryAttemptCount: 0,
    },
  });
  await importedFile.update({
    importStatus: ImportStatusEnum.EXTRACTING,
    errorLog: null,
    lastUpdated: new Date(),
  });
  await syncGHGIImportedInventorySource(importedFile);
  return job;
}

export async function enqueueConceptNotePdfOcr(
  uploadId: string,
): Promise<PdfOcrJob> {
  const [job] = await db.models.PdfOcrJob.findOrCreate({
    where: {
      sourceType: CONCEPT_NOTE_SOURCE_TYPE,
      sourceId: uploadId,
    },
    defaults: {
      sourceType: CONCEPT_NOTE_SOURCE_TYPE,
      sourceId: uploadId,
      status: "queued",
      attemptCount: 0,
      runAfter: new Date(),
      deliveryTarget: "climate_advisor",
      deliveryStatus: "pending",
      deliveryAttemptCount: 0,
    },
  });
  return job;
}

export async function registerConceptNoteMarkdownUpload(
  uploadId: string,
  markdown: string,
): Promise<PdfOcrJob> {
  const now = new Date();
  const normalized = normalizeConceptNoteMarkdown(markdown);
  const resultBuffer = Buffer.from(normalized, "utf8");
  const resultSha256 = createHash("sha256").update(resultBuffer).digest("hex");
  const resultS3Key = resultKey(
    CONCEPT_NOTE_SOURCE_TYPE,
    uploadId,
    `direct-${resultSha256}`,
  );

  const existing = await getConceptNotePdfOcrJob(uploadId);
  if (existing) {
    requireDirectMarkdownIdentity(existing, { resultS3Key, resultSha256 });
    return existing;
  }

  await InventoryFileStorageService.putTextFile(resultS3Key, normalized);

  const [job, created] = await db.models.PdfOcrJob.findOrCreate({
    where: {
      sourceType: CONCEPT_NOTE_SOURCE_TYPE,
      sourceId: uploadId,
    },
    defaults: {
      sourceType: CONCEPT_NOTE_SOURCE_TYPE,
      sourceId: uploadId,
      status: "succeeded",
      attemptCount: 0,
      model: DIRECT_MARKDOWN_MODEL,
      pageCount: null,
      resultS3Key,
      resultSizeBytes: resultBuffer.byteLength,
      resultSha256,
      startedAt: now,
      completedAt: now,
      deliveryTarget: "climate_advisor",
      deliveryStatus: "pending",
      deliveryAttemptCount: 0,
      deliveryRunAfter: now,
    },
  });
  if (!created) {
    requireDirectMarkdownIdentity(job, { resultS3Key, resultSha256 });
  }

  return job;
}

export async function cloneConceptNotePdfOcrBindings(
  uploads: Array<{
    sourceUploadId: string;
    destinationUploadId: string;
  }>,
): Promise<void> {
  if (!uploads.length) return;
  if (!db.sequelize) throw new Error("Database not initialized");

  await db.sequelize.transaction(async (transaction) => {
    const sourceJobs = await db.models.PdfOcrJob.findAll({
      where: {
        sourceType: CONCEPT_NOTE_SOURCE_TYPE,
        sourceId: { [Op.in]: uploads.map((upload) => upload.sourceUploadId) },
      },
      transaction,
    });
    const sources = new Map(sourceJobs.map((job) => [job.sourceId, job]));
    const now = new Date();

    for (const upload of uploads) {
      const source = sources.get(upload.sourceUploadId);
      if (
        !source ||
        source.status !== "succeeded" ||
        !source.resultS3Key ||
        !source.resultSha256
      ) {
        throw new PdfSourceError(
          "concept_note_source_binding_unavailable",
          "A completed Concept Note source binding was not found",
        );
      }
      const [destination, created] = await db.models.PdfOcrJob.findOrCreate({
        where: {
          sourceType: CONCEPT_NOTE_SOURCE_TYPE,
          sourceId: upload.destinationUploadId,
        },
        defaults: {
          sourceType: CONCEPT_NOTE_SOURCE_TYPE,
          sourceId: upload.destinationUploadId,
          status: "succeeded",
          attemptCount: 0,
          model: source.model,
          pageCount: source.pageCount,
          resultS3Key: source.resultS3Key,
          resultSizeBytes: source.resultSizeBytes,
          resultSha256: source.resultSha256,
          startedAt: now,
          completedAt: now,
          deliveryTarget: "climate_advisor",
          deliveryStatus: "delivered",
          deliveryAttemptCount: 0,
          deliveredAt: now,
        },
        transaction,
      });
      if (
        !created &&
        (destination.status !== "succeeded" ||
          destination.resultS3Key !== source.resultS3Key ||
          destination.resultSha256 !== source.resultSha256 ||
          destination.model !== source.model ||
          destination.pageCount !== source.pageCount)
      ) {
        throw new PdfSourceError(
          "concept_note_source_binding_conflict",
          "The duplicated Concept Note source binding does not match",
        );
      }
    }
  });
}

export async function deleteConceptNotePdfOcrBindings(
  uploadIds: string[],
): Promise<void> {
  if (!uploadIds.length) return;
  await db.models.PdfOcrJob.destroy({
    where: {
      sourceType: CONCEPT_NOTE_SOURCE_TYPE,
      sourceId: { [Op.in]: uploadIds },
    },
  });
}

function requireDirectMarkdownIdentity(
  job: PdfOcrJob,
  expected: { resultS3Key: string; resultSha256: string },
): void {
  if (
    job.model !== DIRECT_MARKDOWN_MODEL ||
    job.resultS3Key !== expected.resultS3Key ||
    job.resultSha256 !== expected.resultSha256 ||
    job.pageCount !== null
  ) {
    throw new PdfSourceError(
      "markdown_identity_conflict",
      "Markdown result identity cannot change",
    );
  }
}

export async function claimPdfOcrJobs(owner: string): Promise<PdfOcrJob[]> {
  if (!db.sequelize) throw new Error("Database not initialized");
  const config = getPdfOcrConfig();
  const now = new Date();
  return db.sequelize.transaction(async (transaction) => {
    const jobs = await db.models.PdfOcrJob.findAll({
      where: {
        [Op.or]: [
          {
            status: "queued",
            attemptCount: { [Op.lt]: config.maxAttempts },
            [Op.or]: [{ runAfter: null }, { runAfter: { [Op.lte]: now } }],
          },
          {
            status: "running",
            attemptCount: { [Op.lt]: config.maxAttempts },
            leaseExpiresAt: { [Op.lte]: now },
          },
        ],
      },
      order: [
        ["runAfter", "ASC NULLS FIRST"],
        ["leaseExpiresAt", "ASC NULLS LAST"],
        ["created", "ASC"],
      ],
      limit: Math.min(config.batchSize, config.concurrency),
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    const leaseExpiresAt = new Date(now.getTime() + config.leaseSeconds * 1000);
    for (const job of jobs) {
      await job.update(
        {
          status: "running",
          attemptCount: job.attemptCount + 1,
          leaseOwner: owner,
          leaseExpiresAt,
          heartbeatAt: now,
          startedAt: job.startedAt || now,
          runAfter: null,
          errorCode: null,
          errorMessage: null,
        },
        { transaction },
      );
    }
    return jobs;
  });
}

export async function claimInventoryExtractionJobs(
  owner: string,
): Promise<PdfOcrJob[]> {
  if (!db.sequelize) throw new Error("Database not initialized");
  const config = getPdfOcrConfig();
  const now = new Date();
  return db.sequelize.transaction(async (transaction) => {
    // Reuse the durable OCR job lease for Markdown-to-rows extraction so
    // overlapping cron runs cannot process the same result twice. Import
    // status is user-visible workflow state, not an atomic worker claim.
    const jobs = await db.models.PdfOcrJob.findAll({
      where: {
        sourceType: INVENTORY_SOURCE_TYPE,
        sourceId: {
          // Filter import eligibility before LIMIT so unrelated unfinished
          // imports cannot hide later OCR results that are ready to extract.
          [Op.in]: literal(`(
            SELECT "id"
            FROM "public"."ImportedInventoryFile"
            WHERE "file_type" = 'pdf'
              AND "import_status" = '${ImportStatusEnum.EXTRACTING}'
          )`),
        },
        status: "succeeded",
        resultS3Key: { [Op.ne]: null },
        [Op.or]: [{ leaseOwner: null }, { leaseExpiresAt: { [Op.lt]: now } }],
      },
      order: [
        ["completedAt", "ASC"],
        ["sourceId", "ASC"],
      ],
      limit: config.batchSize,
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    const leaseExpiresAt = new Date(now.getTime() + config.leaseSeconds * 1000);
    for (const job of jobs) {
      await job.update(
        {
          leaseOwner: owner,
          leaseExpiresAt,
          heartbeatAt: now,
        },
        { transaction },
      );
    }
    return jobs;
  });
}

async function heartbeat(
  job: PdfOcrJob,
  owner: string,
  status: PdfOcrStatus,
): Promise<boolean> {
  const config = getPdfOcrConfig();
  const now = new Date();
  const [updated] = await db.models.PdfOcrJob.update(
    {
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + config.leaseSeconds * 1000),
    },
    {
      where: {
        sourceType: job.sourceType,
        sourceId: job.sourceId,
        status,
        leaseOwner: owner,
      },
    },
  );
  return updated === 1;
}

async function validateSource(
  s3Key: string,
  knownSize?: number,
): Promise<void> {
  const config = getPdfOcrConfig();
  if (knownSize !== undefined && knownSize > config.maxSourcePdfBytes) {
    throw new PdfSourceError("pdf_too_large", "PDF exceeds the OCR size limit");
  }
  const metadata = await InventoryFileStorageService.getFileMetadata(s3Key);
  if (Number(metadata.ContentLength || 0) > config.maxSourcePdfBytes) {
    throw new PdfSourceError("pdf_too_large", "PDF exceeds the OCR size limit");
  }
  if (metadata.ContentType && metadata.ContentType !== "application/pdf") {
    throw new PdfSourceError(
      "invalid_pdf_source",
      "PDF source has an invalid content type",
    );
  }
  const prefix = await InventoryFileStorageService.getFilePrefix(s3Key, 5);
  if (prefix.toString("ascii") !== "%PDF-") {
    throw new PdfSourceError(
      "invalid_pdf_source",
      "Uploaded source is not a PDF",
    );
  }
}

async function resolvePdfSource(job: PdfOcrJob): Promise<{
  s3Key: string;
  knownSize?: number;
}> {
  if (job.sourceType === CONCEPT_NOTE_SOURCE_TYPE) {
    return { s3Key: conceptNotePdfSourceKey(job.sourceId) };
  }
  const importedFile = await db.models.ImportedInventoryFile.findByPk(
    job.sourceId,
  );
  if (!importedFile || importedFile.fileType !== "pdf" || !importedFile.s3Key) {
    throw new PdfSourceError(
      "invalid_pdf_source",
      "PDF source no longer exists",
    );
  }
  return {
    s3Key: importedFile.s3Key,
    knownSize: Number(importedFile.fileSize),
  };
}

async function persistOcrResult(job: PdfOcrJob, owner: string): Promise<void> {
  const source = await resolvePdfSource(job);
  await validateSource(source.s3Key, source.knownSize);
  const config = getPdfOcrConfig();
  const documentUrl = await InventoryFileStorageService.createSignedDownloadUrl(
    source.s3Key,
    config.presignedUrlSeconds,
  );
  const result = await convertPdfUrlToMarkdown(documentUrl);
  const resultS3Key = resultKey(job.sourceType, job.sourceId, job.attemptCount);
  const resultBuffer = Buffer.from(result.markdown, "utf8");
  await InventoryFileStorageService.putTextFile(resultS3Key, result.markdown);
  const completedAt = new Date();
  const [updated] = await db.models.PdfOcrJob.update(
    {
      status: "succeeded",
      model: result.model,
      pageCount: result.pageCount,
      resultS3Key,
      resultSizeBytes: resultBuffer.byteLength,
      resultSha256: createHash("sha256").update(resultBuffer).digest("hex"),
      completedAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    },
    {
      where: {
        sourceType: job.sourceType,
        sourceId: job.sourceId,
        status: "running",
        leaseOwner: owner,
      },
    },
  );
  if (updated !== 1) {
    throw new Error("PDF OCR lease was lost before result registration");
  }
  const completedJob = await db.models.PdfOcrJob.findByPk(job.id);
  if (completedJob) await syncGHGIOcrArtifact(completedJob);
}

async function failOrRetry(
  job: PdfOcrJob,
  owner: string,
  error: unknown,
): Promise<void> {
  const config = getPdfOcrConfig();
  const retryable =
    error instanceof MistralOcrError
      ? error.retryable
      : !(error instanceof PdfSourceError);
  const retryDelayMs = getPdfOcrRetryDelayMs(
    job.attemptCount,
    retryable,
    config.maxAttempts,
  );
  const shouldRetry = retryDelayMs !== null;
  const code =
    error instanceof MistralOcrError || error instanceof PdfSourceError
      ? error.code
      : "pdf_ocr_internal_error";
  const runAfter =
    retryDelayMs === null ? null : new Date(Date.now() + retryDelayMs);
  await db.models.PdfOcrJob.update(
    {
      status: shouldRetry ? "queued" : "failed",
      runAfter,
      errorCode: code,
      errorMessage: sanitizedMessage(error),
      completedAt: shouldRetry ? null : new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    },
    {
      where: {
        sourceType: job.sourceType,
        sourceId: job.sourceId,
        leaseOwner: owner,
      },
    },
  );
  if (!shouldRetry && job.sourceType === INVENTORY_SOURCE_TYPE) {
    await db.models.ImportedInventoryFile.update(
      {
        importStatus: ImportStatusEnum.FAILED,
        errorLog: code,
        lastUpdated: new Date(),
      },
      { where: { id: job.sourceId } },
    );
  }
  if (!retryable && error instanceof PdfSourceError) {
    try {
      await withdrawGHGIImportCatalog(job.sourceId, job.id);
    } catch (withdrawError) {
      logger.error(
        { err: withdrawError, importedFileId: job.sourceId, ocrJobId: job.id },
        "Failed to withdraw invalid GHGI catalog entries",
      );
    }
  }
}

async function runOcrJob(job: PdfOcrJob, owner: string): Promise<void> {
  const config = getPdfOcrConfig();
  const heartbeatTimer = setInterval(
    () =>
      heartbeat(job, owner, "running").catch((error) =>
        logger.error({ error }, "PDF OCR heartbeat failed"),
      ),
    config.heartbeatSeconds * 1000,
  );
  heartbeatTimer.unref();
  try {
    await persistOcrResult(job, owner);
  } catch (error) {
    logger.warn({ error, sourceId: job.sourceId }, "PDF OCR attempt failed");
    await failOrRetry(job, owner, error);
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function releaseInventoryExtractionLease(
  job: PdfOcrJob,
  owner: string,
): Promise<boolean> {
  const [updated] = await db.models.PdfOcrJob.update(
    {
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    },
    {
      where: {
        sourceType: job.sourceType,
        sourceId: job.sourceId,
        status: "succeeded",
        leaseOwner: owner,
      },
    },
  );
  return updated === 1;
}

async function finalizeInventoryExtraction(
  job: PdfOcrJob,
  owner: string,
  values: Partial<ImportedInventoryFileAttributes>,
): Promise<boolean> {
  if (!db.sequelize) throw new Error("Database not initialized");
  return db.sequelize.transaction(async (transaction) => {
    const [released] = await db.models.PdfOcrJob.update(
      {
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
      {
        where: {
          sourceType: job.sourceType,
          sourceId: job.sourceId,
          status: "succeeded",
          leaseOwner: owner,
        },
        transaction,
      },
    );
    if (released !== 1) return false;

    const [updated] = await db.models.ImportedInventoryFile.update(values, {
      where: {
        id: job.sourceId,
        importStatus: ImportStatusEnum.EXTRACTING,
      },
      transaction,
    });
    return updated === 1;
  });
}

export async function extractInventoryRowsFromStoredMarkdown(
  job: PdfOcrJob,
  owner: string,
): Promise<void> {
  if (job.status !== "succeeded" || !job.resultS3Key) {
    await releaseInventoryExtractionLease(job, owner);
    return;
  }
  const importedFile = await db.models.ImportedInventoryFile.findByPk(
    job.sourceId,
  );
  if (
    !importedFile ||
    importedFile.importStatus !== ImportStatusEnum.EXTRACTING
  ) {
    await releaseInventoryExtractionLease(job, owner);
    return;
  }
  try {
    const inventory = await db.models.Inventory.findByPk(
      importedFile.inventoryId,
    );
    const markdown = await InventoryFileStorageService.getTextFile(
      job.resultS3Key,
    );
    const targetYear =
      inventory?.year != null && Number.isInteger(Number(inventory.year))
        ? Number(inventory.year)
        : undefined;
    const rows = await extractInventoryRowsFromDocument(markdown, {
      targetYear,
      onChunkProgress: async (current, total) => {
        const renewed = await heartbeat(job, owner, "succeeded");
        if (!renewed) throw new Error("PDF extraction lease was lost");
        await importedFile.update({
          mappingConfiguration: {
            ...(importedFile.mappingConfiguration || {}),
            extractionProgress: { current, total },
          },
        });
      },
    });
    if (!rows.length)
      throw new Error("PDF does not contain extractable inventory data");
    const finalized = await finalizeInventoryExtraction(job, owner, {
      importStatus: ImportStatusEnum.WAITING_FOR_APPROVAL,
      mappingConfiguration: {
        ...(importedFile.mappingConfiguration || {}),
        rows,
        extractionProgress: undefined,
      },
      rowCount: rows.length,
      errorLog: null,
      lastUpdated: new Date(),
    });
    if (!finalized) {
      logger.warn(
        { sourceId: job.sourceId },
        "Inventory extraction lease was lost before completion",
      );
    }
  } catch (error) {
    logger.warn(
      { error, sourceId: job.sourceId },
      "Inventory extraction from OCR Markdown failed",
    );
    const finalized = await finalizeInventoryExtraction(job, owner, {
      importStatus: ImportStatusEnum.FAILED,
      errorLog: sanitizedMessage(error),
      lastUpdated: new Date(),
    });
    if (!finalized) {
      logger.warn(
        { sourceId: job.sourceId },
        "Inventory extraction lease was lost before failure registration",
      );
    }
  }
}

async function runInventoryExtractionJob(
  job: PdfOcrJob,
  owner: string,
): Promise<void> {
  const config = getPdfOcrConfig();
  const heartbeatTimer = setInterval(
    () =>
      heartbeat(job, owner, "succeeded").catch((error) =>
        logger.error({ error }, "PDF extraction heartbeat failed"),
      ),
    config.heartbeatSeconds * 1000,
  );
  heartbeatTimer.unref();
  try {
    await extractInventoryRowsFromStoredMarkdown(job, owner);
  } finally {
    clearInterval(heartbeatTimer);
  }
}

export async function processPdfOcrJobs() {
  const config = getPdfOcrConfig();
  const expiredAt = new Date();
  const exhausted = await db.models.PdfOcrJob.findAll({
    where: {
      status: "running",
      attemptCount: { [Op.gte]: config.maxAttempts },
      leaseExpiresAt: { [Op.lt]: expiredAt },
    },
    limit: config.batchSize,
  });
  for (const job of exhausted) {
    await job.update({
      status: "failed",
      errorCode: "attempts_exhausted",
      errorMessage: "PDF OCR lease expired after the final attempt",
      completedAt: expiredAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    });
    if (job.sourceType === INVENTORY_SOURCE_TYPE) {
      await db.models.ImportedInventoryFile.update(
        {
          importStatus: ImportStatusEnum.FAILED,
          errorLog: "attempts_exhausted",
          lastUpdated: expiredAt,
        },
        { where: { id: job.sourceId } },
      );
    }
  }

  const owner = `pdf-ocr-${randomUUID()}`;
  const jobs = await claimPdfOcrJobs(owner);
  await Promise.all(jobs.map((job) => runOcrJob(job, owner)));
  await syncPendingGHGIOcrArtifacts(config.batchSize);

  const extractionOwner = `pdf-extraction-${randomUUID()}`;
  const successfulJobs = await claimInventoryExtractionJobs(extractionOwner);
  await Promise.all(
    successfulJobs.map((job) =>
      runInventoryExtractionJob(job, extractionOwner),
    ),
  );
  return {
    claimed: jobs.length,
    resumed: successfulJobs.length,
    exhausted: exhausted.length,
  };
}

export async function getInventoryPdfOcrStatus(
  sourceId: string,
  importStatus?: ImportStatusEnum,
) {
  const job = await db.models.PdfOcrJob.findOne({
    where: { sourceType: INVENTORY_SOURCE_TYPE, sourceId },
  });
  if (!job) return null;
  const canRetry =
    job.status === "succeeded" && importStatus === ImportStatusEnum.FAILED;
  return {
    status: job.status,
    ...(job.errorCode ? { errorCode: job.errorCode } : {}),
    canRetry,
  };
}

export async function getConceptNotePdfOcrJob(
  uploadId: string,
): Promise<PdfOcrJob | null> {
  return db.models.PdfOcrJob.findOne({
    where: {
      sourceType: CONCEPT_NOTE_SOURCE_TYPE,
      sourceId: uploadId,
    },
  });
}

export function normalizeConceptNotePdfOcrStatus(job: PdfOcrJob): {
  status: "queued" | "processing" | "ready" | "failed";
  stage: "ocr" | "delivery" | "complete";
  canRetry: boolean;
  retryKind?: "ocr" | "delivery";
  errorCode?: string;
} {
  if (job.status === "queued") {
    return { status: "queued", stage: "ocr", canRetry: false };
  }
  if (job.status === "running") {
    return { status: "processing", stage: "ocr", canRetry: false };
  }
  if (job.status === "failed") {
    return {
      status: "failed",
      stage: "ocr",
      canRetry: true,
      retryKind: "ocr",
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
    };
  }
  if (job.deliveryStatus === "delivered") {
    return { status: "ready", stage: "complete", canRetry: false };
  }
  if (job.deliveryStatus === "failed") {
    return {
      status: "failed",
      stage: "delivery",
      canRetry: true,
      retryKind: "delivery",
      ...(job.deliveryErrorCode ? { errorCode: job.deliveryErrorCode } : {}),
    };
  }
  return { status: "processing", stage: "delivery", canRetry: false };
}

export async function retryConceptNotePdfOcr(
  job: PdfOcrJob,
): Promise<"ocr" | "delivery" | "noop"> {
  if (job.status === "failed") {
    await job.update({
      status: "queued",
      attemptCount: 0,
      runAfter: new Date(),
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      deliveryStatus: "pending",
      deliveryAttemptCount: 0,
      deliveryRunAfter: null,
      deliveredAt: null,
      deliveryErrorCode: null,
      deliveryErrorMessage: null,
    });
    return "ocr";
  }
  if (job.status === "succeeded" && job.deliveryStatus !== "delivered") {
    await job.update({
      deliveryStatus: "pending",
      deliveryRunAfter: new Date(),
      deliveryErrorCode: null,
      deliveryErrorMessage: null,
    });
    return "delivery";
  }
  return "noop";
}
