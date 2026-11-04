import { createHash } from "node:crypto";
import {
  coarseKindsFromExtensions,
  detectCoarseFileKind,
} from "./coarse-kind";
import {
  assertDocumentReusable,
  type IngestDocumentPool,
} from "./document-pool";
import {
  confirmColumnMap,
  isColumnMappingPending,
  proposeColumnMap,
} from "./column-mapping";
import type { IngestPlugin } from "./plugin";
import {
  reconcileIngestSource,
  type IngestSourceReconciliationReport,
} from "./source-reconciliation";
import type { IngestStore } from "./store";
import { expandIngestInputs } from "./unpack-zip";
import {
  buildReviewDraftEnvelope,
  bundleDigestOf,
  cloneJson,
  isReviewLockActive,
  requireReviewDraft,
  sameTargetBinding,
} from "./review-draft";
import {
  IngestItemError,
  type IngestColumnMappingInput,
  type IngestFileInput,
  type IngestItemRecord,
  type IngestJobRecord,
  type IngestModuleId,
  type IngestReviewDraftEnvelope,
  type IngestReviewTargetBinding,
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

export interface EnqueueFromDocumentInput {
  moduleId: IngestModuleId;
  documentId: string;
  dryRun?: boolean;
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

  /**
   * Reuse a pooled document. Skips store and Path B; starts at match/detect.
   */
  async enqueueFromDocument(
    input: EnqueueFromDocumentInput,
  ): Promise<IngestJobRecord> {
    if (!this.documentPool) {
      throw new IngestItemError(
        "commit_failed",
        "Document pool is required for from-document ingest",
      );
    }
    const document = await this.documentPool.get(input.documentId);
    if (!document) {
      throw new IngestItemError("document_not_found");
    }
    assertDocumentReusable(document);
    if (!document.buffer || !document.contentHash) {
      throw new IngestItemError("commit_failed", "Missing bytes to reuse");
    }

    const scope: IngestScope = {
      organizationId: input.scope.organizationId ?? document.organizationId,
      projectId: input.scope.projectId ?? document.projectId,
      cityId: input.scope.cityId ?? document.cityId,
      inventoryId: input.scope.inventoryId,
    };
    if (!hasScope(scope)) {
      throw new IngestItemError("missing_scope");
    }

    const job = await this.store.createJob({
      moduleId: input.moduleId,
      dryRun: input.dryRun ?? false,
      visibility: document.visibility,
      organizationId: scope.organizationId ?? null,
      projectId: scope.projectId ?? null,
      cityId: scope.cityId ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
    });
    await this.store.createItem({
      jobId: job.id,
      originalFileName: document.originalFileName,
      buffer: document.buffer,
      contentHash: document.contentHash,
      documentId: document.id,
      targetCityId: scope.cityId ?? null,
      targetInventoryId: scope.inventoryId ?? null,
    });
    return this.store.updateJob(job.id, { totalCount: 1 });
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
      const fromDocument = Boolean(item.documentId);
      if (!fromDocument && !job.dryRun && this.documentPool) {
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
        });
        await this.addWarnings(item.id, matched.warnings);
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

      const mappingInput = await plugin.columnMapping?.(
        { job, item: await this.requireItem(item.id), scope },
        parsed,
      );
      if (mappingInput) {
        await this.setStage(item.id, "map");
        if (job.dryRun) {
          await this.skipDryRun(item.id);
          return;
        }
        await this.persistColumnMappingDraft({
          job,
          itemId: item.id,
          parsed,
          mappingInput,
          scope,
        });
        return;
      }

      await this.continueFromParsed(job, item.id, plugin, parsed, scope);
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

  private async skipDryRun(itemId: string): Promise<void> {
    await this.store.updateItem(itemId, {
      status: "skipped",
      stage: "commit",
      errorCode: "dry_run",
      errorLog: "dryRun stops before commit and catalog registration",
    });
  }

  private async continueFromParsed(
    job: IngestJobRecord,
    itemId: string,
    plugin: IngestPlugin,
    parsed: unknown,
    scope: IngestScope,
  ): Promise<void> {
    await this.setStage(itemId, "adapt");
    const adapted = await plugin.adapt(
      { job, item: await this.requireItem(itemId), scope },
      parsed,
    );

    await this.setStage(itemId, "validate");
    const validation = await plugin.validate(
      { job, item: await this.requireItem(itemId), scope },
      adapted,
    );
    await this.addWarnings(itemId, validation?.warnings);
    const reconciliation = await this.reconcileAdapted(
      plugin,
      { job, item: await this.requireItem(itemId), scope },
      adapted,
    );
    if (reconciliation) {
      await this.addWarnings(
        itemId,
        reconciliation.issues.map((issue) => issue.message),
      );
    }

    await this.setStage(itemId, "decide");
    const policy = plugin.approvalPolicy(
      { job, item: await this.requireItem(itemId), scope },
      adapted,
    );
    if (policy === "reject") {
      throw new IngestItemError("validation_failed", "Plugin rejected file");
    }
    if (job.dryRun) {
      await this.skipDryRun(itemId);
      return;
    }
    if (policy === "review" || (reconciliation && !reconciliation.ok)) {
      await this.persistReviewDraft({
        job,
        itemId,
        plugin,
        adapted,
        validation,
        scope,
        reconciliation,
      });
      return;
    }

    await this.setStage(itemId, "commit");
    const result = await plugin.commit(
      { job, item: await this.requireItem(itemId), scope },
      adapted,
    );

    await this.setStage(itemId, "publish");
    await this.publishPathA(itemId, plugin);

    const current = await this.requireItem(itemId);
    const mappingDraft = current.reviewDraft;
    await this.store.updateItem(itemId, {
      status: "completed",
      stage: "publish",
      result: {
        ...(result ?? { committed: true }),
        ...(reconciliation ? { reconciliation } : {}),
        ...(mappingDraft?.columnMapping?.confirmed
          ? { columnMapping: mappingDraft.columnMapping.confirmed }
          : {}),
      },
      ...(mappingDraft
        ? {
            reviewDraft: {
              ...mappingDraft,
              decision: {
                status: "confirmed" as const,
                userId: mappingDraft.decision.userId ?? null,
                at: new Date().toISOString(),
              },
            },
          }
        : {}),
      reviewLockedByUserId: null,
      reviewLockedAt: null,
    });
  }

  private async persistColumnMappingDraft(input: {
    job: IngestJobRecord;
    itemId: string;
    parsed: unknown;
    mappingInput: IngestColumnMappingInput;
    scope: IngestScope;
  }): Promise<void> {
    const current = await this.requireItem(input.itemId);
    const proposal = proposeColumnMap(input.mappingInput);
    const envelope = buildReviewDraftEnvelope({
      payload: input.parsed,
      sourceContentHash: current.contentHash ?? "",
      targetBinding: {
        cityId: current.targetCityId ?? input.job.cityId,
        inventoryId: current.targetInventoryId ?? input.scope.inventoryId,
      },
      columnMapping: {
        status: "pending",
        proposal,
        confirmed: null,
      },
    });
    await this.store.updateItem(input.itemId, {
      status: "awaiting_review",
      stage: "map",
      result: { columnMapping: proposal },
      reviewDraft: envelope,
      reviewDraftVersion: envelope.version,
    });
  }

  private async addWarnings(
    itemId: string,
    warnings: string[] | undefined,
  ): Promise<void> {
    if (!warnings?.length) return;
    const current = await this.requireItem(itemId);
    await this.store.updateItem(itemId, {
      warnings: [...new Set([...current.warnings, ...warnings])],
    });
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

  async getReviewDraft(
    itemId: string,
    userId: string,
  ): Promise<{
    item: IngestItemRecord;
    draft: IngestReviewDraftEnvelope;
    readOnly: boolean;
    editorUserId: string | null;
  }> {
    const item = this.requireAwaitingReview(await this.requireItem(itemId));
    const draft = requireReviewDraft(item.reviewDraft);
    const lockedBy = item.reviewLockedByUserId ?? null;
    const lockHeldByOther =
      Boolean(lockedBy) &&
      lockedBy !== userId &&
      isReviewLockActive(item.reviewLockedAt);

    if (lockHeldByOther) {
      return {
        item,
        draft,
        readOnly: true,
        editorUserId: lockedBy,
      };
    }

    const next = await this.store.updateItem(itemId, {
      reviewLockedByUserId: userId,
      reviewLockedAt: new Date(),
    });
    return {
      item: next,
      draft: requireReviewDraft(next.reviewDraft),
      readOnly: false,
      editorUserId: userId,
    };
  }

  async saveReviewDraft(
    itemId: string,
    userId: string,
    input: { payload: unknown; reviewDraftVersion: number },
  ): Promise<IngestReviewDraftEnvelope> {
    const item = this.requireAwaitingReview(await this.requireItem(itemId));
    this.assertCanEditReview(item, userId);
    const current = requireReviewDraft(item.reviewDraft);
    if (current.version !== input.reviewDraftVersion) {
      throw new IngestItemError(
        "stale_review_draft",
        "Review draft version does not match",
      );
    }
    if (isColumnMappingPending(current.columnMapping)) {
      throw new IngestItemError(
        "mapping_incomplete",
        "Confirm the column map before editing the review payload",
      );
    }
    const payload = cloneJson(input.payload);
    const next: IngestReviewDraftEnvelope = {
      ...current,
      version: current.version + 1,
      bundleDigest: bundleDigestOf(payload),
      payload,
      decision: { status: "pending", userId: null, at: null },
    };
    const saved = await this.store.updateItem(itemId, {
      reviewDraft: next,
      reviewDraftVersion: next.version,
      reviewLockedByUserId: userId,
      reviewLockedAt: new Date(),
    });
    return requireReviewDraft(saved.reviewDraft);
  }

  /**
   * Commit the stored draft. Does not re-parse the file.
   * The same version confirmed twice is a no-op once the item is completed.
   */
  async confirmReview(
    itemId: string,
    plugin: IngestPlugin,
    input: {
      userId: string;
      reviewDraftVersion: number;
      targetBinding?: IngestReviewTargetBinding;
    },
  ): Promise<IngestItemRecord> {
    const item = await this.requireItem(itemId);
    const job = await this.requireJob(item.jobId);
    if (plugin.moduleId !== job.moduleId) {
      throw new Error(
        `Plugin ${plugin.moduleId} cannot confirm job for module ${job.moduleId}`,
      );
    }

    const draft = requireReviewDraft(item.reviewDraft);
    if (
      item.status === "completed" &&
      draft.version === input.reviewDraftVersion &&
      draft.decision.status === "confirmed"
    ) {
      return item;
    }

    this.requireAwaitingReview(item);
    this.assertCanEditReview(item, input.userId);
    this.assertDraftStillValid(item, draft, input);
    if (isColumnMappingPending(draft.columnMapping)) {
      throw new IngestItemError(
        "mapping_incomplete",
        "Confirm the column map before committing",
      );
    }

    const adapted = plugin.hydrateReviewDraft
      ? plugin.hydrateReviewDraft(draft.payload)
      : draft.payload;
    const scope: IngestScope = {
      organizationId: job.organizationId,
      projectId: job.projectId,
      cityId: item.targetCityId ?? job.cityId,
      inventoryId: item.targetInventoryId,
    };
    const reconciliation = await this.reconcileAdapted(
      plugin,
      { job, item, scope },
      adapted,
    );
    if (reconciliation && !reconciliation.ok) {
      throw new IngestItemError(
        "reconciliation_failed",
        "Source reconciliation failed; values cannot be committed",
      );
    }

    await this.setStage(item.id, "commit");
    const result = await plugin.commit(
      { job, item: await this.requireItem(item.id), scope },
      adapted,
    );
    const confirmed: IngestReviewDraftEnvelope = {
      ...draft,
      decision: {
        status: "confirmed",
        userId: input.userId,
        at: new Date().toISOString(),
      },
    };
    await this.publishPathA(item.id, plugin);
    const completed = await this.store.updateItem(item.id, {
      status: "completed",
      stage: "publish",
      result: result ?? { committed: true },
      reviewDraft: confirmed,
      reviewLockedByUserId: null,
      reviewLockedAt: null,
    });
    await this.summarize(job.id);
    return completed;
  }

  /**
   * Store the confirmed column map, then adapt / validate / decide.
   * Does not commit until Decide says so.
   */
  async confirmColumnMapping(
    itemId: string,
    plugin: IngestPlugin,
    input: {
      userId: string;
      reviewDraftVersion: number;
      mappings: Array<{ sourceColumn: string; taxonomyField: string }>;
    },
  ): Promise<IngestItemRecord> {
    const item = this.requireAwaitingReview(await this.requireItem(itemId));
    const job = await this.requireJob(item.jobId);
    if (plugin.moduleId !== job.moduleId) {
      throw new Error(
        `Plugin ${plugin.moduleId} cannot confirm job for module ${job.moduleId}`,
      );
    }
    this.assertCanEditReview(item, input.userId);
    const draft = requireReviewDraft(item.reviewDraft);
    this.assertDraftStillValid(item, draft, {
      reviewDraftVersion: input.reviewDraftVersion,
    });
    if (!isColumnMappingPending(draft.columnMapping) || !draft.columnMapping) {
      throw new IngestItemError(
        "mapping_incomplete",
        "Item is not waiting for a column map",
      );
    }
    const confirmed = confirmColumnMap(
      draft.columnMapping.proposal,
      input.mappings,
    );
    const next: IngestReviewDraftEnvelope = {
      ...draft,
      version: draft.version + 1,
      columnMapping: {
        status: "confirmed",
        proposal: draft.columnMapping.proposal,
        confirmed,
      },
      decision: { status: "pending", userId: null, at: null },
    };
    await this.store.updateItem(itemId, {
      reviewDraft: next,
      reviewDraftVersion: next.version,
      reviewLockedByUserId: input.userId,
      reviewLockedAt: new Date(),
      stage: "map",
    });

    const scope: IngestScope = {
      organizationId: job.organizationId,
      projectId: job.projectId,
      cityId: item.targetCityId ?? job.cityId,
      inventoryId: item.targetInventoryId,
    };
    try {
      await this.continueFromParsed(job, itemId, plugin, draft.payload, scope);
    } catch (err) {
      const code =
        err instanceof IngestItemError ? err.code : "commit_failed";
      await this.store.updateItem(itemId, {
        status: "failed",
        errorCode: code,
        errorLog: err instanceof Error ? err.message : String(err),
      });
      await this.summarize(job.id);
      throw err;
    }
    await this.summarize(job.id);
    return this.requireItem(itemId);
  }

  private async reconcileAdapted(
    plugin: IngestPlugin,
    ctx: { job: IngestJobRecord; item: IngestItemRecord; scope: IngestScope },
    adapted: unknown,
  ): Promise<IngestSourceReconciliationReport | null> {
    if (!plugin.sourceReconciliation) return null;
    const input = await plugin.sourceReconciliation(ctx, adapted);
    if (!input) return null;
    return reconcileIngestSource(input);
  }

  private async persistReviewDraft(input: {
    job: IngestJobRecord;
    itemId: string;
    plugin: IngestPlugin;
    adapted: unknown;
    validation: { warnings?: string[] } | void;
    scope: IngestScope;
    reconciliation?: IngestSourceReconciliationReport | null;
  }): Promise<void> {
    const current = await this.requireItem(input.itemId);
    const serialized = input.plugin.serializeReviewDraft
      ? input.plugin.serializeReviewDraft(input.adapted, input.validation)
      : input.adapted;
    const envelope = buildReviewDraftEnvelope({
      payload: serialized,
      sourceContentHash: current.contentHash ?? "",
      targetBinding: {
        cityId: current.targetCityId ?? input.job.cityId,
        inventoryId: current.targetInventoryId ?? input.scope.inventoryId,
      },
      columnMapping: current.reviewDraft?.columnMapping ?? null,
      version: (current.reviewDraftVersion ?? 0) + 1,
      reconciliation: input.reconciliation ?? null,
    });
    const summary = await input.plugin.reviewSummary?.(
      {
        job: input.job,
        item: current,
        scope: input.scope,
      },
      input.adapted,
    );
    await this.store.updateItem(input.itemId, {
      status: "awaiting_review",
      stage: "decide",
      result: {
        ...(summary ? { review: summary } : { awaitingReview: true }),
        ...(input.reconciliation
          ? { reconciliation: input.reconciliation }
          : {}),
      },
      reviewDraft: envelope,
      reviewDraftVersion: envelope.version,
    });
  }

  private requireAwaitingReview(item: IngestItemRecord): IngestItemRecord {
    if (item.status !== "awaiting_review") {
      throw new IngestItemError(
        "stale_review_draft",
        `Item is ${item.status}, not awaiting_review`,
      );
    }
    return item;
  }

  private assertCanEditReview(item: IngestItemRecord, userId: string): void {
    const lockedBy = item.reviewLockedByUserId ?? null;
    if (
      lockedBy &&
      lockedBy !== userId &&
      isReviewLockActive(item.reviewLockedAt)
    ) {
      throw new IngestItemError(
        "review_locked",
        "Another collaborator is editing this review",
      );
    }
  }

  private assertDraftStillValid(
    item: IngestItemRecord,
    draft: IngestReviewDraftEnvelope,
    input: {
      reviewDraftVersion: number;
      targetBinding?: IngestReviewTargetBinding;
    },
  ): void {
    const currentBinding: IngestReviewTargetBinding = {
      cityId: item.targetCityId ?? null,
      inventoryId: item.targetInventoryId ?? null,
    };
    if (draft.version !== input.reviewDraftVersion) {
      throw new IngestItemError(
        "stale_review_draft",
        "Review draft version does not match",
      );
    }
    if (new Date(draft.expiresAt).getTime() <= Date.now()) {
      throw new IngestItemError("stale_review_draft", "Review draft expired");
    }
    if (draft.sourceContentHash !== (item.contentHash ?? "")) {
      throw new IngestItemError(
        "stale_review_draft",
        "Source file bytes changed",
      );
    }
    if (draft.bundleDigest !== bundleDigestOf(draft.payload)) {
      throw new IngestItemError(
        "stale_review_draft",
        "Stored bundle digest does not match payload",
      );
    }
    if (!sameTargetBinding(draft.targetBinding, currentBinding)) {
      throw new IngestItemError(
        "stale_review_draft",
        "Target city or inventory changed",
      );
    }
    if (
      input.targetBinding &&
      !sameTargetBinding(draft.targetBinding, input.targetBinding)
    ) {
      throw new IngestItemError(
        "stale_review_draft",
        "Confirm target does not match the stored draft",
      );
    }
  }

  private async publishPathA(
    itemId: string,
    plugin: IngestPlugin,
  ): Promise<void> {
    if (!this.documentPool) return;
    const item = await this.requireItem(itemId);
    if (!item.documentId) return;
    const document = await this.documentPool.get(item.documentId);
    if (!document) return;
    await this.documentPool.publishPathA(document, {
      owningModule: plugin.moduleId,
      sourceId: item.id,
      inventoryId: item.targetInventoryId ?? null,
    });
  }

  private async requireJob(jobId: string): Promise<IngestJobRecord> {
    const job = await this.store.getJob(jobId);
    if (!job) {
      throw new Error(`Ingest job ${jobId} not found`);
    }
    return job;
  }
}
