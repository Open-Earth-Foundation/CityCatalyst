import { randomUUID } from "node:crypto";
import type {
  CreateIngestItemInput,
  CreateIngestJobInput,
  IngestStore,
} from "./store";
import type { IngestItemRecord, IngestJobRecord } from "./types";

export class MemoryIngestStore implements IngestStore {
  private readonly jobs = new Map<string, IngestJobRecord>();
  private readonly items = new Map<string, IngestItemRecord>();

  async createJob(input: CreateIngestJobInput): Promise<IngestJobRecord> {
    const job: IngestJobRecord = {
      ...input,
      id: input.id ?? randomUUID(),
      status: "pending",
      totalCount: 0,
      completedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      awaitingReviewCount: 0,
    };
    this.jobs.set(job.id, job);
    return { ...job };
  }

  async getJob(jobId: string): Promise<IngestJobRecord | null> {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  async updateJob(
    jobId: string,
    patch: Partial<IngestJobRecord>,
  ): Promise<IngestJobRecord> {
    const current = this.jobs.get(jobId);
    if (!current) {
      throw new Error(`Ingest job ${jobId} not found`);
    }
    const next = { ...current, ...patch, id: current.id };
    this.jobs.set(jobId, next);
    return { ...next };
  }

  async createItem(input: CreateIngestItemInput): Promise<IngestItemRecord> {
    const item: IngestItemRecord = {
      ...input,
      id: input.id ?? randomUUID(),
      status: "pending",
      warnings: input.warnings ?? [],
      coverageYears: input.coverageYears ?? [],
    };
    this.items.set(item.id, item);
    return { ...item, buffer: item.buffer };
  }

  async getItem(itemId: string): Promise<IngestItemRecord | null> {
    const item = this.items.get(itemId);
    return item ? { ...item, buffer: item.buffer } : null;
  }

  async listItems(jobId: string): Promise<IngestItemRecord[]> {
    return [...this.items.values()]
      .filter((item) => item.jobId === jobId)
      .map((item) => ({ ...item, buffer: item.buffer }));
  }

  async updateItem(
    itemId: string,
    patch: Partial<IngestItemRecord>,
  ): Promise<IngestItemRecord> {
    const current = this.items.get(itemId);
    if (!current) {
      throw new Error(`Ingest item ${itemId} not found`);
    }
    const next = { ...current, ...patch, id: current.id };
    this.items.set(itemId, next);
    return { ...next, buffer: next.buffer };
  }
}
