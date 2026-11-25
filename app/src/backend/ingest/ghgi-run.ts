import { logger } from "@/services/logger";
import { GhgiIngestPlugin } from "./plugins/GhgiIngestPlugin";
import { IngestRunner } from "./IngestRunner";
import { startModuleIngest } from "./start";
import type { IngestStore } from "./store";
import type { IngestItemRecord, IngestJobRecord } from "./types";

/**
 * Run one GHGI file on the shared runner. Used by Chile bulk and
 * deterministic wizard approve. PDF / BIOMATEC stay unknown_format;
 * CIRIS with eCRF_3 commits as eCRF (CC-1217).
 */
export async function ingestGhgiBuffer(input: {
  buffer: Buffer;
  originalFileName: string;
  cityId?: string | null;
  inventoryId?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  userId: string;
  dryRun?: boolean;
  runner: IngestRunner;
  store: IngestStore;
  plugin?: GhgiIngestPlugin;
}): Promise<{ job: IngestJobRecord; item: IngestItemRecord }> {
  logger.info(
    {
      ingest: true,
      fileName: input.originalFileName,
      cityId: input.cityId ?? null,
      inventoryId: input.inventoryId ?? null,
      dryRun: input.dryRun ?? false,
    },
    "[ingest] ghgi buffer starting on the runner",
  );
  const { job, items } = await startModuleIngest({
    moduleId: "ghgi",
    files: [{ name: input.originalFileName, buffer: input.buffer }],
    scope: {
      cityId: input.cityId,
      inventoryId: input.inventoryId,
      projectId: input.projectId,
      organizationId: input.organizationId,
    },
    userId: input.userId,
    dryRun: input.dryRun,
    runner: input.runner,
    store: input.store,
    plugin: input.plugin ?? new GhgiIngestPlugin(),
  });
  const item = items[0];
  if (!item) {
    throw new Error("GHGI ingest produced no items");
  }
  return { job, item };
}

export function shouldCommitViaGhgiRunner(file: {
  fileType?: string | null;
  validationResults?: unknown;
}): boolean {
  if (file.fileType === "pdf") return false;
  const validation = (file.validationResults ?? {}) as Record<string, unknown>;
  if (validation.isBIOMATEC) return false;
  if (validation.cirisWithoutEcrf) return false;
  if (validation.adapterType === "near-ecrf") return true;
  if (validation.processingResults) return true;
  // CIRIS Path A stores isCIRIS + processingResults; isCIRIS alone is enough
  // when approve re-parses before processingResults is written.
  if (validation.isCIRIS === true) return true;
  return false;
}

export function bulkErrorFromIngestItem(item: IngestItemRecord): {
  code: string;
  message: string;
} {
  const message = item.errorLog ?? item.errorCode ?? "import_failed";
  if (
    item.errorCode === "unknown_format" &&
    /not_ecrf/i.test(message)
  ) {
    return { code: "not_ecrf", message };
  }
  return { code: item.errorCode ?? "import_failed", message };
}
