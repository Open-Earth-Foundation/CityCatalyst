import { Op } from "sequelize";
import { db } from "@/models";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import { logger } from "@/services/logger";
import {
  cutoffDate,
  readRetentionConfig,
  type RetentionConfig,
} from "@/util/gdpr/retention-config";
import type { RetentionPolicyResult } from "@/backend/gdpr/RetentionService";

export interface WithdrawnByteClock {
  withdrawnAt?: Date | null;
  bytesPurgedAt?: Date | null;
}

/** Withdrawn bytes are due once they are older than the retention window. */
export function isWithdrawnBytesDue(
  document: WithdrawnByteClock,
  now: Date,
  days: number,
): boolean {
  if (!document.withdrawnAt || document.bytesPurgedAt) return false;
  return document.withdrawnAt.getTime() < cutoffDate(now, days).getTime();
}

function emptyResult(): RetentionPolicyResult {
  return { matched: 0, applied: 0, failed: 0 };
}

/**
 * Drop S3 objects and pool blobs for documents withdrawn longer than
 * INGEST_WITHDRAWN_DOCUMENT_DAYS (default 365). The catalog row stays so
 * values can still say the source was withdrawn.
 * No-ops unless GDPR_RETENTION_ENABLED=true, same switch as the other policies.
 */
export async function purgeWithdrawnDocumentBytes(
  now = new Date(),
  config: RetentionConfig = readRetentionConfig(),
): Promise<RetentionPolicyResult> {
  const result = emptyResult();
  if (!config.enabled) return result;

  const cutoff = cutoffDate(now, config.withdrawnDocumentDays);
  const documents = await db.models.IngestDocument.findAll({
    where: {
      withdrawnAt: { [Op.lt]: cutoff },
      bytesPurgedAt: { [Op.is]: null },
    },
    limit: config.batchSize,
  });
  result.matched = documents.length;

  for (const document of documents) {
    try {
      const where: Record<string, unknown> = {
        kind: "cnb_upload",
        labels: { [Op.contains]: { documentId: document.id } },
      };
      const catalogs = await db.models.NativeInputCatalog.findAll({ where });
      await db.sequelize!.transaction(async (transaction) => {
        await db.models.RetentionActionLog.create(
          {
            policyKey: "withdrawn_document_bytes",
            action: "purge_document_bytes",
            subjectType: "ingest_document",
            subjectId: document.id,
            dryRun: config.dryRun,
            details: {
              s3Key: document.s3Key ?? null,
              uploadIds: catalogs.map((row) => row.sourceId),
            },
          },
          { transaction },
        );
        if (config.dryRun) return;
        for (const catalog of catalogs) {
          await InventoryFileStorageService.deleteConceptNoteSource(
            catalog.sourceId,
          );
        }
        if (document.s3Key && catalogs.length === 0) {
          await InventoryFileStorageService.deleteFile(document.s3Key);
        }
        await document.update(
          { data: null, s3Key: null, bytesPurgedAt: now },
          { transaction },
        );
      });
      if (!config.dryRun) result.applied += 1;
    } catch (err) {
      result.failed += 1;
      logger.error(
        { err, documentId: document.id },
        "Retention failed to purge withdrawn document bytes",
      );
    }
  }

  return result;
}
