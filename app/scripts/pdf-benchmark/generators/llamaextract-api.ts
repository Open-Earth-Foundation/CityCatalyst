/**
 * LlamaExtract (LlamaCloud) Agentic Plus (CC-1295): one attempt uploads the
 * benchmark PDF, runs an Extract v2 job on the `agentic_plus` tier with
 * citations, polls it and maps the answer to envelope data. The CLI is
 * llamaextract.ts.
 *
 * API used (LlamaIndex developer docs, read 2026-11-18):
 * - POST https://api.cloud.llamaindex.ai/api/v1/beta/files, multipart `file`
 *   and `purpose=extract` -> `id` (`dfl-...`),
 *   https://developers.llamaindex.ai/llamaparse/extract/api/
 * - POST /api/v2/extract with `file_input` and `configuration` ({ tier:
 *   "agentic_plus", version, data_schema, system_prompt, cite_sources }) ->
 *   `id`, https://developers.llamaindex.ai/reference/resources/extract/methods/create
 *   and https://developers.llamaindex.ai/llamaparse/extract/guides/configuring-extract/
 * - GET /api/v2/extract/{id}?expand=usage&expand=extract_metadata&expand=configuration
 *   until `status` COMPLETED, FAILED or CANCELLED (also PENDING, RUNNING);
 *   the answer is `extract_result`, citations are in `extract_metadata`,
 *   credits in `usage` (null until billing records them),
 *   https://developers.llamaindex.ai/reference/resources/extract/methods/get
 *
 * Each HTTP call has a 10-minute timeout and one retry on 429, 5xx or timeout
 * (common.ts requestJson); the job is polled every 10 s for at most 30 minutes,
 * then up to 6 more times while its credits are still null.
 *
 * Version: Extract v2 `version: "latest"`; the docs publish no list of version
 * names to pin (changelog, Oct 2026: the `continuous` versions were retired in
 * favour of `latest` or dated releases), so the envelope version records the
 * version the job reports back in its configuration.
 *
 * Instructions: LlamaExtract refuses a `system_prompt` over 10,000 characters
 * (422, 2026-11-18) and a schema root description over 16,000 (schema
 * validation, same day); envelopeInstructions() is about 26,000. So
 * llamaInstructions() sends the <role>, <task> and <input> sections of the
 * built-in prompt plus the year lines as `system_prompt`, the <taxonomy>
 * section as the schema root description, and leaves out <output> and
 * <example_output>: the built-in model's own answer format, which the year
 * lines tell every vendor to ignore for the JSON schema. Every schema field is
 * kept: POST /api/v2/extract/schema/validation returned the envelope schema
 * unchanged (2026-11-18).
 *
 * Cost: credits reported by the job x prices.json
 * `vendors["llamaextract/agentic-plus"].perCredit` ($1.50 per 1,000 credits,
 * pay as you go); when the credits never arrive, billed pages x `perPage`
 * ($0.09: Agentic Plus 50 credits plus Agentic parse 10 credits per page),
 * https://developers.llamaindex.ai/llamaparse/general/pricing/#extraction
 * (read 2026-11-18). n/a without either.
 */
import { SYSTEM_PROMPT } from "@/backend/extraction-system-prompt";
import type { EnvelopeData } from "@/backend/ingestion-benchmark/pipelines/rows-dir";
import {
  CALL_TIMEOUT_MS,
  CallError,
  asEnvelopeData,
  envelopeSchema,
  envelopeYearLines,
  pdfForm,
  pollJob,
  requestJson,
  sleep,
  type PollOptions,
  type VendorAttempt,
} from "./common";

const BASE_URL = "https://api.cloud.llamaindex.ai";
export const LLAMA_PIPELINE = "llamaextract";
export const LLAMA_MODE = "llamaextract/agentic-plus";
const TIER = "agentic_plus";
const VERSION = "latest";
export const LLAMA_MODEL = `tier ${TIER}`;
const DONE = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
/** Extra polls of a completed job while its credits are still null. */
const CREDIT_POLLS = 6;

const MAX_SYSTEM_PROMPT = 10_000;
const MAX_ROOT_DESCRIPTION = 16_000;

const num = (value: unknown) => (typeof value === "number" ? value : null);

function promptSection(tag: string): string {
  const start = SYSTEM_PROMPT.indexOf(`<${tag}>`);
  const end = SYSTEM_PROMPT.indexOf(`</${tag}>`);
  if (start < 0 || end < start) {
    throw new Error(`built-in prompt has no <${tag}> section`);
  }
  return SYSTEM_PROMPT.slice(start, end + `</${tag}>`.length);
}

/** The envelope task within LlamaExtract's prompt and description limits (see above). */
export function llamaInstructions(targetYear: number): {
  systemPrompt: string;
  schema: object;
} {
  const systemPrompt = [
    ...["role", "task", "input"].map(promptSection),
    ...envelopeYearLines(targetYear),
  ].join("\n\n");
  const description = promptSection("taxonomy");
  if (
    systemPrompt.length > MAX_SYSTEM_PROMPT ||
    description.length > MAX_ROOT_DESCRIPTION
  ) {
    throw new Error("instructions exceed LlamaExtract's length limits");
  }
  return { systemPrompt, schema: { ...envelopeSchema(), description } };
}

export async function llamaExtractAttempt(
  { entry, pdf, apiKey, price, record }: Parameters<VendorAttempt>[0],
  opts: PollOptions = {},
): Promise<EnvelopeData> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const call = { retryDelayMs: opts.retryDelayMs };
  const pollMs = opts.pollMs ?? 10_000;
  record.version = `${LLAMA_MODEL} version ${VERSION}`;
  const instructions = llamaInstructions(entry.year);

  const upload = await requestJson(
    `${BASE_URL}/api/v1/beta/files`,
    {
      method: "POST",
      headers,
      body: pdfForm(pdf, entry.fileName, { purpose: "extract" }),
    },
    call,
  );
  const fileId = upload.body.id;
  // Only the id: a file answer can carry signed download URLs.
  record.raw.upload = { id: fileId };
  if (typeof fileId !== "string") {
    throw new CallError("file upload answer has no id");
  }

  const created = await requestJson(
    `${BASE_URL}/api/v2/extract`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        file_input: fileId,
        configuration: {
          tier: TIER,
          version: VERSION,
          data_schema: instructions.schema,
          system_prompt: instructions.systemPrompt,
          cite_sources: true,
        },
      }),
    },
    call,
  );
  record.raw.create = created.body;
  const jobId = created.body.id;
  if (typeof jobId !== "string") {
    throw new CallError("extract answer has no job id");
  }

  const jobUrl = new URL(
    `${BASE_URL}/api/v2/extract/${encodeURIComponent(jobId)}`,
  );
  for (const expand of ["usage", "extract_metadata", "configuration"]) {
    jobUrl.searchParams.append("expand", expand);
  }
  const getJob = async () => {
    const response = await requestJson(jobUrl.toString(), { headers }, call);
    record.raw.job = response.body;
    return response.body;
  };
  let { job, polls } = await pollJob(
    getJob,
    (current) => DONE.has(String(current.status)),
    { pollMs, deadlineMs: opts.deadlineMs ?? 3 * CALL_TIMEOUT_MS },
  );
  const credits = () =>
    num((job.usage as Record<string, unknown> | undefined)?.credits);
  for (
    let i = 0;
    job.status === "COMPLETED" && credits() === null && i < CREDIT_POLLS;
    i++
  ) {
    await sleep(pollMs);
    job = await getJob();
    polls++;
  }

  const configuration = job.configuration as
    Record<string, unknown> | undefined;
  if (typeof configuration?.version === "string") {
    record.version = `${LLAMA_MODEL} version ${configuration.version}`;
  }
  const usage = (job.usage ?? {}) as Record<string, unknown>;
  const pageUsage = ((job.metadata as Record<string, unknown> | undefined)
    ?.usage ?? {}) as Record<string, unknown>;
  const billedPages = num(pageUsage.num_pages_billed);
  const perCredit = price?.perCredit ?? null;
  const perPage = price?.perPage ?? null;
  let costBasis: "credits" | "pages" | null = null;
  if (credits() !== null && perCredit !== null) {
    record.costUsd = credits()! * perCredit;
    costBasis = "credits";
  } else if (billedPages !== null && perPage !== null) {
    record.costUsd = billedPages * perPage;
    costBasis = "pages";
  }
  record.pages = billedPages;
  record.usage = {
    credits: credits(),
    extract_credits: num(usage.extract_credits),
    parse_credits: num(usage.parse_credits),
    num_pages_billed: billedPages,
    num_pages_extracted: num(pageUsage.num_pages_extracted),
    cost_basis: costBasis,
    polls,
  };

  if (job.status !== "COMPLETED") {
    throw new CallError(
      `job ${String(job.status)}: ${String(job.error_message ?? "no error message")}`,
    );
  }
  return asEnvelopeData(job.extract_result);
}
