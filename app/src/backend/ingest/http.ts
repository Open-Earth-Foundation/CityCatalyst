import createHttpError from "http-errors";
import type { AppSession } from "@/lib/auth";
import { assertCanAccessIngestItem } from "./access";
import { IngestRunner } from "./IngestRunner";
import { SequelizeIngestStore } from "./IngestStoreService";

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
  return { store, item, job, runner: new IngestRunner(store) };
}
