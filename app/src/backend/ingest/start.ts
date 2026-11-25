import { IngestAgent } from "./agent";
import { IngestRunner } from "./IngestRunner";
import { createIngestPlugin } from "./registry";
import type { IngestPlugin } from "./plugin";
import type { IngestStore } from "./store";
import {
  IngestItemError,
  type IngestFileInput,
  type IngestItemRecord,
  type IngestJobRecord,
  type IngestModuleId,
  type IngestScope,
} from "./types";

export function parseIngestDryRun(value: FormDataEntryValue | null): boolean {
  if (typeof value !== "string") return false;
  return value === "true" || value === "1";
}

export function parseIngestScope(form: FormData): IngestScope {
  const read = (key: string): string | undefined => {
    const value = form.get(key);
    if (typeof value !== "string" || !value.trim()) return undefined;
    return value.trim();
  };
  return {
    inventoryId: read("inventoryId"),
    cityId: read("cityId"),
    projectId: read("projectId"),
    organizationId: read("organizationId"),
  };
}

export async function filesFromIngestForm(
  form: FormData,
): Promise<IngestFileInput[]> {
  const entry = form.get("file");
  if (!entry || typeof entry === "string") {
    throw new IngestItemError("no_files", "File not found");
  }
  const file = entry as File;
  const buffer = Buffer.from(await file.arrayBuffer());
  return [{ name: file.name || "upload.bin", buffer }];
}

export async function startModuleIngest(input: {
  moduleId: IngestModuleId;
  files: IngestFileInput[];
  scope: IngestScope;
  userId: string;
  dryRun?: boolean;
  runner: IngestRunner;
  store: IngestStore;
  plugin?: IngestPlugin;
}): Promise<{
  job: IngestJobRecord;
  items: IngestItemRecord[];
}> {
  const agent = new IngestAgent(input.runner, input.store);
  const view = await agent.start({
    moduleId: input.moduleId,
    files: input.files,
    scope: input.scope,
    userId: input.userId,
    dryRun: input.dryRun,
    plugin: input.plugin ?? createIngestPlugin(input.moduleId),
  });
  const job = await input.store.getJob(view.job.id);
  if (!job) {
    throw new IngestItemError("commit_failed", "Ingest job not found");
  }
  const items = await input.store.listItems(job.id);
  return { job, items };
}

export function publicIngestJob(job: IngestJobRecord): Record<string, unknown> {
  return {
    id: job.id,
    moduleId: job.moduleId,
    status: job.status,
    dryRun: job.dryRun,
    totalCount: job.totalCount,
    completedCount: job.completedCount,
    failedCount: job.failedCount,
    skippedCount: job.skippedCount,
    awaitingReviewCount: job.awaitingReviewCount,
    errorCode: job.errorCode ?? null,
    errorLog: job.errorLog ?? null,
  };
}

export function publicIngestItem(item: IngestItemRecord): Record<string, unknown> {
  return {
    id: item.id,
    jobId: item.jobId,
    originalFileName: item.originalFileName,
    status: item.status,
    stage: item.stage ?? null,
    warnings: item.warnings,
    errorCode: item.errorCode ?? null,
    errorLog: item.errorLog ?? null,
    result: item.result ?? null,
    documentId: item.documentId ?? null,
    reviewDraftVersion: item.reviewDraftVersion ?? null,
    coarseKind: item.coarseKind ?? null,
  };
}
