/**
 * Reducto Deep Extract with citations on (CC-1295): one attempt uploads the
 * benchmark PDF, runs an asynchronous Extract job with Deep Extract and
 * citations, polls it and maps the answer to envelope data. The CLI is
 * reducto.ts.
 *
 * API used (Reducto docs, read 2026-11-18):
 * - POST https://platform.reducto.ai/upload, multipart `file` -> `file_id`
 *   (`reducto://...`), https://docs.reducto.ai/upload/overview.md and
 *   https://docs.reducto.ai/api-reference/upload.md
 * - POST /extract_async with `input` (the file_id), `instructions`
 *   ({ schema, system_prompt }) and `settings` ({ deep_extract: true,
 *   citations: { enabled: true }, alpha: { deep_extract_model } }) -> `job_id`,
 *   https://docs.reducto.ai/api-reference/extract-async.md,
 *   https://docs.reducto.ai/configs/extract/deep-extract.md and
 *   https://docs.reducto.ai/configs/extract/citations.md
 * - GET /job/{job_id} until `status` Completed or Failed (also Pending,
 *   InProgress, Completing, Idle); `result` is the V3 extract response with
 *   `result` (the answer) and `usage`, https://docs.reducto.ai/api-reference/retrieve-parse.md
 *   and https://docs.reducto.ai/workflows/async-overview.md
 * - GET /version: the API build, recorded in the envelope version,
 *   https://docs.reducto.ai/api-reference/get-version.md
 *
 * Each HTTP call has a 10-minute timeout. The upload and the polls are retried
 * once on 429, 5xx or timeout; POST /extract_async starts a paid job, so it is
 * retried only on 429 or 503 (common.ts requestJson). The job is polled every
 * 10 s for at most 30 minutes.
 *
 * Deep Extract model: pinned to `v3`, the default on
 * https://docs.reducto.ai/reference/model-versions (read 2026-11-18), through
 * `settings.alpha` (https://docs.reducto.ai/reference/version-pinning.md).
 *
 * With citations on, every answer leaf comes back as { value, citations }
 * (https://docs.reducto.ai/extract/response-format.md). The envelope keeps the
 * values only; the citations (pages, boxes) stay in the raw answer.
 *
 * Cost: the response reports no dollars. A per-product account reports
 * `usage.usage_breakdown` (pages, fields); cost = extract pages x prices.json
 * `vendors["reducto/deep-extract"].perPage`, the Deep Extract list price of $40
 * per 1,000 pages (https://reducto.ai/pricing and
 * https://docs.reducto.ai/reference/credit-usage.md, read 2026-11-18). Cost is
 * n/a for a credit-based account (`usage.credits` without `usage_breakdown`,
 * https://docs.reducto.ai/reference/pricing-migration.md: no published price
 * per credit) and for a dense extraction over 100 fields per page, which may
 * carry a per-field surcharge whose amount is not published.
 */
import type { EnvelopeData } from "@/backend/ingestion-benchmark/pipelines/rows-dir";
import {
  CALL_TIMEOUT_MS,
  CallError,
  asEnvelopeData,
  envelopeInstructions,
  envelopeSchema,
  pdfForm,
  pollJob,
  requestJson,
  type AttemptRecord,
  type PollOptions,
  type VendorAttempt,
} from "./common";

const BASE_URL = "https://platform.reducto.ai";
export const REDUCTO_PIPELINE = "reducto/extract";
export const REDUCTO_MODE = "reducto/deep-extract";
const DEEP_EXTRACT_MODEL = "v3";
export const REDUCTO_MODEL = `deep_extract_model ${DEEP_EXTRACT_MODEL}`;
/** Fields per page above which Reducto may add an unpublished surcharge. */
const DENSE_FIELDS_PER_PAGE = 100;
const DONE = new Set(["Completed", "Failed"]);

/** Every { value, citations } leaf of a citations-on answer replaced by its value. */
export function unwrapCitations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrapCitations);
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value);
    if ("value" in value && "citations" in value && keys.length === 2) {
      return unwrapCitations((value as { value: unknown }).value);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        unwrapCitations(child),
      ]),
    );
  }
  return value;
}

const num = (value: unknown) => (typeof value === "number" ? value : null);

/** Usage, pages and cost of a finished extract response. */
function recordUsage(
  usage: Record<string, unknown>,
  perPage: number | null,
  record: AttemptRecord,
): void {
  const breakdown = usage.usage_breakdown as
    Record<string, unknown> | undefined;
  const pages = num(breakdown?.extract_pages) ?? num(usage.num_pages) ?? 0;
  const fields = num(breakdown?.extract_fields) ?? num(usage.num_fields) ?? 0;
  record.pages = pages;
  record.usage = {
    ...record.usage,
    num_pages: num(usage.num_pages),
    num_fields: num(usage.num_fields),
    credits: num(usage.credits),
    extract_model: breakdown?.extract_model ?? null,
    extract_pages: num(breakdown?.extract_pages),
    extract_fields: num(breakdown?.extract_fields),
  };
  const dense = pages > 0 && fields / pages > DENSE_FIELDS_PER_PAGE;
  record.costUsd =
    breakdown && perPage !== null && !dense ? pages * perPage : null;
}

export async function reductoAttempt(
  { entry, pdf, apiKey, price, record }: Parameters<VendorAttempt>[0],
  opts: PollOptions = {},
): Promise<EnvelopeData> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const call = { retryDelayMs: opts.retryDelayMs };

  // Best effort: the envelope version names the API build when it answers.
  let apiVersion: string | null = null;
  try {
    const response = await fetch(`${BASE_URL}/version`, {
      headers,
      signal: AbortSignal.timeout(60_000),
    });
    const body: unknown = response.ok ? await response.json() : null;
    if (typeof body === "string") apiVersion = body;
  } catch {
    // version unknown
  }
  record.raw.apiVersion = apiVersion;
  record.version = apiVersion
    ? `${REDUCTO_MODEL} (API ${apiVersion})`
    : REDUCTO_MODEL;

  const upload = await requestJson(
    `${BASE_URL}/upload`,
    { method: "POST", headers, body: pdfForm(pdf, entry.fileName) },
    call,
  );
  const fileId = upload.body.file_id;
  // The presigned URL is a credential: only the file id is kept.
  record.raw.upload = { file_id: fileId };
  if (typeof fileId !== "string") {
    throw new CallError("upload answer has no file_id");
  }

  const created = await requestJson(
    `${BASE_URL}/extract_async`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: fileId,
        instructions: {
          schema: envelopeSchema(),
          system_prompt: envelopeInstructions(entry.year),
        },
        settings: {
          deep_extract: true,
          citations: { enabled: true },
          alpha: { deep_extract_model: DEEP_EXTRACT_MODEL },
        },
      }),
    },
    { ...call, billing: true },
  );
  record.raw.create = created.body;
  const jobId = created.body.job_id;
  if (typeof jobId !== "string") {
    throw new CallError("extract_async answer has no job_id");
  }

  const { job, polls } = await pollJob(
    async () => {
      const response = await requestJson(
        `${BASE_URL}/job/${encodeURIComponent(jobId)}`,
        { headers },
        call,
      );
      record.raw.job = response.body;
      return response.body;
    },
    (current) => DONE.has(String(current.status)),
    {
      pollMs: opts.pollMs ?? 10_000,
      deadlineMs: opts.deadlineMs ?? 3 * CALL_TIMEOUT_MS,
    },
  );
  record.usage.polls = polls;
  if (job.status === "Failed") {
    const error = job.error as { name?: string } | null | undefined;
    throw new CallError(
      `job failed: ${[error?.name, job.reason].filter(Boolean).join(" ") || "no reason"}`,
    );
  }

  const result = job.result as Record<string, unknown> | null | undefined;
  if (typeof result?.usage === "object" && result.usage !== null) {
    recordUsage(
      result.usage as Record<string, unknown>,
      price?.perPage ?? null,
      record,
    );
  }
  let answer = unwrapCitations(result?.result);
  // Without citations the V3 answer may be a one-item list.
  if (Array.isArray(answer) && answer.length === 1) answer = answer[0];
  return asEnvelopeData(answer);
}
