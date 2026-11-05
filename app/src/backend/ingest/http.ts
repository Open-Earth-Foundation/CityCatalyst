import createHttpError from "http-errors";
import type { AppSession } from "@/lib/auth";
import {
  assertCanAccessIngestItem,
  assertCanManageIngestDocument,
} from "./access";
import { SequelizeIngestDocumentPool } from "./IngestDocumentPoolService";
import { IngestAgent } from "./agent";
import { IngestRunner } from "./IngestRunner";
import { SequelizeIngestStore } from "./IngestStoreService";

export function createIngestRunner(): IngestRunner {
  return new IngestRunner(
    new SequelizeIngestStore(),
    new SequelizeIngestDocumentPool(),
  );
}

export function createIngestAgent(): IngestAgent {
  const store = new SequelizeIngestStore();
  return new IngestAgent(
    new IngestRunner(store, new SequelizeIngestDocumentPool()),
    store,
  );
}

export function createIngestRuntime(): {
  store: SequelizeIngestStore;
  runner: IngestRunner;
} {
  const store = new SequelizeIngestStore();
  return {
    store,
    runner: new IngestRunner(store, new SequelizeIngestDocumentPool()),
  };
}

export async function loadIngestReviewContext(
  itemId: string,
  session: AppSession | null,
) {
  const store = new SequelizeIngestStore();
  const item = await store.getItem(itemId);
  if (!item) {
    throw new createHttpError.NotFound("Ingest item not found");
  }
  const job = await store.getJob(item.jobId);
  if (!job) {
    throw new createHttpError.NotFound("Ingest job not found");
  }
  await assertCanAccessIngestItem(session, job, item);
  return { store, item, job, runner: createIngestRunner() };
}

export async function loadManagedIngestDocument(
  documentId: string,
  session: AppSession | null,
) {
  const pool = new SequelizeIngestDocumentPool();
  const document = await pool.get(documentId);
  if (!document) {
    throw new createHttpError.NotFound("Ingest document not found");
  }
  await assertCanManageIngestDocument(session, document);
  return { pool, document };
}
