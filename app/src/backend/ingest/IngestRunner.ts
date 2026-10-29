import { createHash } from "node:crypto";
import {
  coarseKindsFromExtensions,
  detectCoarseFileKind,
} from "./coarse-kind";
import type { IngestDocumentPool } from "./document-pool";
import type { IngestPlugin } from "./plugin";
import type { IngestStore } from "./store";
import { expandIngestInputs } from "./unpack-zip";
import {
  IngestItemError,
  type IngestFileInput,
  type IngestItemRecord,
  type IngestJobRecord,
  type IngestModuleId,
  type IngestScope,
  type IngestStage,
  type IngestVisibility,
} from "./types";

export interface EnqueueIngestJobInput {
  moduleId: IngestModuleId;
  files: IngestFileInput[];
  dryRun?: boolean;
  visibility?: IngestVisibility;
  uploadedByUserId?: string | null;
  scope: IngestScope;
}

function hasScope(scope: IngestScope): boolean {
  return Boolean(scope.organizationId || scope.projectId || scope.cityId);
}

function contentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export class IngestRunner {
  constructor(
    private readonly store: IngestStore,
    private readonly documentPool?: IngestDocumentPool,
  ) {}

  async enqueue(input: EnqueueIngestJobInput): Promise<IngestJobRecord> {
    if (!hasScope(input.scope)) {
      throw new IngestItemError("missing_scope");
    }

    const files = await expandIngestInputs(input.files);
    const job = await this.store.createJob({
      moduleId: input.moduleId,
      dryRun: input.dryRun ?? false,
      visibility: input.visibility ?? "city",
      organizationId: input.scope.organizationId ?? null,
      projectId: input.scope.projectId ?? null,
      cityId: input.scope.cityId ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
    });

    for (const file of files) {
      await this.store.createItem({
        jobId: job.id,
        originalFileName: file.name,
        buffer: file.buffer,
        contentHash: contentHash(file.buffer),
        targetCityId: input.scope.cityId ?? null,
        targetInventoryId: input.scope.inventoryId ?? null,
      });
    }

    return this.store.updateJob(job.id, { totalCount: files.length });
  }

  async run(jobId: string, plugin: IngestPlugin): Promise<IngestJobRecord> {
    const job = await this.store.getJob(jobId);
    if (!job) {
      throw new Error(`Ingest job ${jobId} not found`);
    }
    if (plugin.moduleId !== job.moduleId) {
      throw new Error(
        `Plugin ${plugin.moduleId} cannot run job for module ${job.moduleId}`,
      );
    }

    await this.store.updateJob(jobId, { status: "running" });
    const items = await this.store.listItems(jobId);
    for (const item of items) {
      await this.runItem(job, item, plugin);
    }
    return this.summarize(jobId);
  }

  private async runItem(
    job: IngestJobRecord,
    item: IngestItemRecord,
    plugin: IngestPlugin,
  ): Promise<void> {
    let scope: IngestScope = {
      organizationId: job.organizationId,
      projectId: job.projectId,
      cityId: job.cityId,
      inventoryId: item.targetInventoryId,
    };

    try {
      await this.setStage(item.id, "receive");

      await this.setStage(item.id, "store");
      if (!job.dryRun && this.documentPool) {
        const current = await this.requireItem(item.id);
        if (!current.contentHash || !current.buffer) {
          throw new IngestItemError("commit_failed", "Missing bytes to store");
        }
        const stored = await this.documentPool.store({
          contentHash: current.contentHash,
          originalFileName: current.originalFileName,
          buffer: current.buffer,
          scope,
          uploadedByUserId: job.uploadedByUserId ?? null,
          visibility: job.visibility,
        });
        await this.documentPool.publishPathB(stored.document);
        await this.store.updateItem(item.id, {
          documentId: stored.document.id,
        });
      }

      await this.setStage(item.id, "match");
      const matched = await plugin.match?.({
        job,
        item: await this.requireItem(item.id),
        scope,
      });
      if (matched) {
        await this.store.updateItem(item.id, {
          ...(matched.targetCityId !== undefined
            ? { targetCityId: matched.targetCityId }
            : {}),
          ...(matched.targetInventoryId !== undefined
            ? { targetInventoryId: matched.targetInventoryId }
            : {}),
          ...(matched.coverageYears
            ? { coverageYears: matched.coverageYears }
            : {}),
          ...(matched.warnings?.length
            ? { warnings: matched.warnings }
            : {}),
        });
        const afterMatch = await this.requireItem(item.id);
        scope = {
          ...scope,
          cityId: afterMatch.targetCityId ?? scope.cityId,
          inventoryId: afterMatch.targetInventoryId ?? scope.inventoryId,
        };
      }

      await this.setStage(item.id, "detect");
      const current = await this.requireItem(item.id);
      const coarse = detectCoarseFileKind(
        current.originalFileName,
        current.buffer,
      );
      await this.store.updateItem(item.id, { coarseKind: coarse });
      if (coarse === "unknown") {
        throw new IngestItemError("unsupported_extension");
      }
      const allowedKinds = coarseKindsFromExtensions(plugin.allowedExtensions);
      if (!allowedKinds.includes(coarse)) {
        throw new IngestItemError("unsupported_extension");
      }
      await plugin.detect(
        { job, item: await this.requireItem(item.id), scope },
        coarse,
      );

      await this.setStage(item.id, "parse");
      const parsed = await plugin.parse({
        job,
        item: await this.requireItem(item.id),
        scope,
      });

      await this.setStage(item.id, "adapt");
      const adapted = await plugin.adapt(
        { job, item: await this.requireItem(item.id), scope },
        parsed,
      );

      await this.setStage(item.id, "validate");
      const validation = await plugin.validate(
        { job, item: await this.requireItem(item.id), scope },
        adapted,
      );
      if (validation?.warnings?.length) {
        await this.store.updateItem(item.id, {
          warnings: validation.warnings,
        });
      }

      await this.setStage(item.id, "decide");
      const policy = plugin.approvalPolicy(
        { job, item: await this.requireItem(item.id), scope },
        adapted,
      );
      if (policy === "reject") {
        throw new IngestItemError("validation_failed", "Plugin rejected file");
      }
      if (policy === "review") {
        const summary = await plugin.reviewSummary?.(
          { job, item: await this.requireItem(item.id), scope },
          adapted,
        );
        await this.store.updateItem(item.id, {
          status: "awaiting_review",
          stage: "decide",
          result: summary ? { review: summary } : { awaitingReview: true },
        });
        return;
      }

      await this.setStage(item.id, "commit");
      if (job.dryRun) {
        await this.store.updateItem(item.id, {
          status: "skipped",
          stage: "commit",
          errorCode: "dry_run",
          errorLog: "dryRun stops before commit and catalog registration",
        });
        return;
      }
      const result = await plugin.commit(
        { job, item: await this.requireItem(item.id), scope },
        adapted,
      );

      await this.setStage(item.id, "publish");
      // Path A/B catalog registration is CC-955 / plugin commit, not Core.

      await this.store.updateItem(item.id, {
        status: "completed",
        stage: "publish",
        result: result ?? { committed: true },
      });
    } catch (err) {
      const code =
        err instanceof IngestItemError ? err.code : "commit_failed";
      await this.store.updateItem(item.id, {
        status: "failed",
        errorCode: code,
        errorLog: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async setStage(itemId: string, stage: IngestStage): Promise<void> {
    await this.store.updateItem(itemId, { status: "running", stage });
  }

  private async requireItem(itemId: string): Promise<IngestItemRecord> {
    const item = await this.store.getItem(itemId);
    if (!item) {
      throw new Error(`Ingest item ${itemId} not found`);
    }
    return item;
  }

  private async summarize(jobId: string): Promise<IngestJobRecord> {
    const items = await this.store.listItems(jobId);
    const completedCount = items.filter((i) => i.status === "completed").length;
    const failedCount = items.filter((i) => i.status === "failed").length;
    const skippedCount = items.filter((i) => i.status === "skipped").length;
    const awaitingReviewCount = items.filter(
      (i) => i.status === "awaiting_review",
    ).length;
    const status =
      failedCount === items.length && items.length > 0
        ? "failed"
        : awaitingReviewCount > 0
          ? "awaiting_review"
          : "completed";
    return this.store.updateJob(jobId, {
      status,
      completedCount,
      failedCount,
      skippedCount,
      awaitingReviewCount,
    });
  }
}
