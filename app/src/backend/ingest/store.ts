import type { IngestItemRecord, IngestJobRecord } from "./types";

export interface CreateIngestJobInput
  extends Omit<
    IngestJobRecord,
    | "id"
    | "status"
    | "totalCount"
    | "completedCount"
    | "failedCount"
    | "skippedCount"
    | "awaitingReviewCount"
    | "errorCode"
    | "errorLog"
  > {
  id?: string;
}

export interface CreateIngestItemInput
  extends Omit<
    IngestItemRecord,
    "id" | "status" | "warnings" | "coverageYears" | "stage" | "result"
  > {
  id?: string;
  warnings?: string[];
  coverageYears?: number[];
}

export interface IngestStore {
  createJob(input: CreateIngestJobInput): Promise<IngestJobRecord>;
  getJob(jobId: string): Promise<IngestJobRecord | null>;
  updateJob(
    jobId: string,
    patch: Partial<IngestJobRecord>,
  ): Promise<IngestJobRecord>;
  createItem(input: CreateIngestItemInput): Promise<IngestItemRecord>;
  getItem(itemId: string): Promise<IngestItemRecord | null>;
  listItems(jobId: string): Promise<IngestItemRecord[]>;
  updateItem(
    itemId: string,
    patch: Partial<IngestItemRecord>,
  ): Promise<IngestItemRecord>;
}
