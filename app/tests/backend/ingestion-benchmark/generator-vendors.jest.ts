import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { SYSTEM_PROMPT } from "@/backend/extraction-system-prompt";
import type { CaseManifestEntry } from "@/backend/ingestion-benchmark/selection";
import {
  CallError,
  emptyData,
  envelopeInstructions,
  envelopeSchema,
  envelopeYearLines,
  type AttemptRecord,
} from "../../../scripts/pdf-benchmark/generators/common";
import {
  REDUCTO_MODEL,
  reductoAttempt,
  unwrapCitations,
} from "../../../scripts/pdf-benchmark/generators/reducto-api";
import {
  LLAMA_INSTRUCTIONS,
  LLAMA_MODEL,
  llamaExtractAttempt,
  llamaInstructions,
} from "../../../scripts/pdf-benchmark/generators/llamaextract-api";

const KEY = "test-key-0123456789";
const entry: CaseManifestEntry = {
  id: "C-901",
  city: "Synthetic City",
  country: "Nowhere",
  year: 2022,
  block: "validated",
  totalOnly: false,
  textTables: true,
  fileName: "C-901.pdf",
};
const pdf = Buffer.from("%PDF-1.4 synthetic");
const fast = { pollMs: 0, deadlineMs: 60_000, retryDelayMs: 0 };

const row = {
  source_label: "Residential natural gas",
  gpc_ref: "I.1.1",
  scope: 1,
  emissions_tco2e: 1500,
  notation_key: null,
  row_role: "emission",
  total_inclusion: "included",
  scope_basis: "explicit",
};
const answer = { ...emptyData(), reporting_year: 2022, rows: [row] };

const newRecord = (): AttemptRecord => ({
  usage: {},
  costUsd: null,
  pages: 0,
  version: null,
  raw: {},
});

type Route = (url: URL, init: RequestInit) => unknown | Response;
const fetchMock = jest.fn<typeof fetch>();
const realFetch = global.fetch;
const requests: { method: string; url: URL; init: RequestInit }[] = [];

/** Answers each request with the first route whose "METHOD path" matches. */
function serve(routes: Record<string, Route | unknown[]>) {
  fetchMock.mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    requests.push({ method, url, init });
    const route = routes[`${method} ${url.pathname}`];
    if (route === undefined) return new Response("not found", { status: 404 });
    const value = Array.isArray(route)
      ? route.length > 1
        ? route.shift()
        : route[0]
      : (route as Route)(url, init);
    return value instanceof Response
      ? value
      : new Response(JSON.stringify(value), { status: 200 });
  });
}

const bodyOf = (method: string, path: string) =>
  JSON.parse(
    String(
      requests.find((r) => r.method === method && r.url.pathname === path)!.init
        .body,
    ),
  );

beforeEach(() => {
  fetchMock.mockReset();
  requests.length = 0;
  global.fetch = fetchMock;
});
afterEach(() => {
  global.fetch = realFetch;
});

/** A Reducto citations-on result: every leaf as { value, citations }. */
const cited = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(cited);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cited(child)]),
    );
  }
  return { value, citations: [{ type: "Table", bbox: { page: 3 } }] };
};

describe("unwrapCitations", () => {
  it("replaces every { value, citations } leaf by its value", () => {
    expect(unwrapCitations(cited(answer))).toEqual(answer);
    expect(unwrapCitations({ value: null, citations: [] })).toBeNull();
    expect(unwrapCitations({ value: 1, other: 2 })).toEqual({
      value: 1,
      other: 2,
    });
  });
});

describe("reductoAttempt", () => {
  const perPage = { perPage: 0.04, source: "s", date: "d" };
  const completed = (
    usage: Record<string, unknown>,
    result = cited(answer),
  ) => ({
    status: "Completed",
    result: { response_type: "v3_extract", result, usage, job_id: "j-1" },
  });
  const perProductUsage = {
    num_pages: 26,
    num_fields: 400,
    credits: null,
    usage_breakdown: {
      extract_model: "Deep Extract",
      extract_pages: 26,
      extract_fields: 400,
    },
  };
  const routes = (job: unknown[]) => ({
    "GET /version": () => "v1.12.24",
    "POST /upload": () => ({
      file_id: "reducto://abc.pdf",
      presigned_url: "https://s3.test/abc?X-Amz-Signature=sig",
    }),
    "POST /extract_async": () => ({ job_id: "j-1" }),
    "GET /job/j-1": job,
  });

  it("uploads, runs Deep Extract with citations and maps the answer", async () => {
    serve(routes([{ status: "Pending" }, completed(perProductUsage)]));
    const record = newRecord();
    const data = await reductoAttempt(
      { entry, pdf, apiKey: KEY, price: perPage, record },
      fast,
    );

    expect(data).toEqual(answer);
    expect(requests.map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
      "GET /version",
      "POST /upload",
      "POST /extract_async",
      "GET /job/j-1",
      "GET /job/j-1",
    ]);
    for (const r of requests) {
      expect(r.url.origin).toBe("https://platform.reducto.ai");
      expect((r.init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${KEY}`,
      );
    }
    const upload = requests[1].init.body as FormData;
    expect((upload.get("file") as File).name).toBe("C-901.pdf");
    expect(bodyOf("POST", "/extract_async")).toEqual({
      input: "reducto://abc.pdf",
      instructions: {
        schema: envelopeSchema(),
        system_prompt: envelopeInstructions(2022),
      },
      settings: {
        deep_extract: true,
        citations: { enabled: true },
        alpha: { deep_extract_model: "v3" },
      },
    });

    expect(record.pages).toBe(26);
    expect(record.costUsd).toBeCloseTo(26 * 0.04);
    expect(record.usage).toMatchObject({
      num_pages: 26,
      num_fields: 400,
      extract_pages: 26,
      extract_model: "Deep Extract",
      polls: 2,
    });
    expect(record.version).toBe(`${REDUCTO_MODEL} (API v1.12.24)`);
    expect(JSON.stringify(record.raw)).not.toContain("X-Amz");
    expect(record.raw).toMatchObject({
      apiVersion: "v1.12.24",
      upload: { file_id: "reducto://abc.pdf" },
      job: { status: "Completed" },
    });
  });

  it("gives no cost for a credit-based account or a dense extraction", async () => {
    for (const usage of [
      { num_pages: 26, num_fields: 400, credits: 120 },
      {
        ...perProductUsage,
        usage_breakdown: {
          ...perProductUsage.usage_breakdown,
          extract_fields: 2700,
        },
      },
    ]) {
      serve(routes([completed(usage)]));
      const record = newRecord();
      await reductoAttempt(
        { entry, pdf, apiKey: KEY, price: perPage, record },
        fast,
      );
      expect(record.costUsd).toBeNull();
      expect(record.pages).toBe(26);
    }
  });

  it("throws with the reason of a failed job, keeping the job", async () => {
    serve(
      routes([
        {
          status: "Failed",
          reason: "bad schema",
          error: { name: "INVALID_SCHEMA" },
        },
      ]),
    );
    const record = newRecord();
    await expect(
      reductoAttempt({ entry, pdf, apiKey: KEY, price: perPage, record }, fast),
    ).rejects.toThrow(/job failed: INVALID_SCHEMA bad schema/);
    expect(record.raw.job).toMatchObject({ status: "Failed" });
  });

  it("throws on an answer without rows but keeps the billed usage", async () => {
    serve(
      routes([
        completed(perProductUsage, { rows: { value: "x", citations: [] } }),
      ]),
    );
    const record = newRecord();
    await expect(
      reductoAttempt({ entry, pdf, apiKey: KEY, price: perPage, record }, fast),
    ).rejects.toThrow(/rows array/);
    expect(record.costUsd).toBeCloseTo(26 * 0.04);
  });

  it("does not resend the paid extract request on a 502", async () => {
    serve({
      ...routes([]),
      "POST /extract_async": () => new Response("bad gateway", { status: 502 }),
    });
    await expect(
      reductoAttempt(
        { entry, pdf, apiKey: KEY, price: perPage, record: newRecord() },
        fast,
      ),
    ).rejects.toMatchObject({ status: 502 });
    expect(
      requests.filter((r) => r.url.pathname === "/extract_async"),
    ).toHaveLength(1);
  });

  it("throws CallError with the status of a refused upload", async () => {
    serve({
      "GET /version": () => "v1",
      "POST /upload": () => new Response('{"detail":"no"}', { status: 401 }),
    });
    const error = await reductoAttempt(
      { entry, pdf, apiKey: KEY, price: perPage, record: newRecord() },
      fast,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CallError);
    expect(error).toMatchObject({ status: 401, message: "status 401" });
  });
});

describe("llamaInstructions", () => {
  const section = (tag: string) =>
    SYSTEM_PROMPT.slice(
      SYSTEM_PROMPT.indexOf(`<${tag}>`),
      SYSTEM_PROMPT.indexOf(`</${tag}>`) + `</${tag}>`.length,
    );

  it("fits every section but the example in LlamaExtract's limits and lists the layout", () => {
    const { systemPrompt, schema, layout } = llamaInstructions(2022);
    expect(systemPrompt.length).toBeLessThanOrEqual(10_000);
    expect(systemPrompt).toBe(
      [
        section("role"),
        section("task"),
        section("input"),
        ...envelopeYearLines(
          2022,
          "the output format in the schema description",
        ),
      ].join("\n\n"),
    );
    expect(systemPrompt).toContain(
      "not in the output format in the schema description:",
    );
    expect(systemPrompt).not.toContain("output format above");
    const { description, ...rest } = schema as Record<string, unknown>;
    expect(description).toBe(`${section("output")}\n\n${section("taxonomy")}`);
    expect((description as string).length).toBeLessThanOrEqual(16_000);
    expect(rest).toEqual(envelopeSchema());
    expect(layout).toEqual({
      systemPrompt: ["role", "task", "input", "year lines"],
      schemaDescription: ["output", "taxonomy"],
      omitted: ["example_output"],
    });
    expect(LLAMA_INSTRUCTIONS).toBe(
      "system_prompt: role, task, input, year lines; schema description: output, taxonomy; omitted: example_output",
    );
  });
});

describe("llamaExtractAttempt", () => {
  const price = { perPage: 0.09, perCredit: 0.0015, source: "s", date: "d" };
  const job = (over: Record<string, unknown>) => ({
    id: "ext-1",
    status: "COMPLETED",
    configuration: { tier: "agentic_plus", version: "2.6" },
    extract_result: answer,
    extract_metadata: { field_metadata: { document_metadata: {} } },
    metadata: { usage: { num_pages_billed: 26, num_pages_extracted: 26 } },
    usage: { credits: 1560, extract_credits: 1300, parse_credits: 260 },
    ...over,
  });
  const routes = (jobs: unknown[]) => ({
    "POST /api/v1/beta/files": () => ({ id: "dfl-1", name: "C-901.pdf" }),
    "POST /api/v2/extract": () => ({ id: "ext-1", status: "PENDING" }),
    "GET /api/v2/extract/ext-1": jobs,
  });

  it("uploads, runs Agentic Plus and maps the answer and credits", async () => {
    serve(
      routes([
        { id: "ext-1", status: "RUNNING" },
        job({ usage: { credits: null } }),
        job({}),
      ]),
    );
    const record = newRecord();
    const data = await llamaExtractAttempt(
      { entry, pdf, apiKey: KEY, price, record },
      fast,
    );

    expect(data).toEqual(answer);
    for (const r of requests) {
      expect(r.url.origin).toBe("https://api.cloud.llamaindex.ai");
      expect((r.init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${KEY}`,
      );
    }
    const upload = requests[0].init.body as FormData;
    expect(upload.get("purpose")).toBe("extract");
    expect((upload.get("file") as File).name).toBe("C-901.pdf");
    expect(bodyOf("POST", "/api/v2/extract")).toEqual({
      file_input: "dfl-1",
      configuration: {
        tier: "agentic_plus",
        version: "latest",
        data_schema: llamaInstructions(2022).schema,
        system_prompt: llamaInstructions(2022).systemPrompt,
        cite_sources: true,
      },
    });
    const poll = requests.find((r) => r.method === "GET")!.url;
    expect(poll.searchParams.getAll("expand").sort()).toEqual([
      "configuration",
      "extract_metadata",
      "usage",
    ]);

    expect(record.costUsd).toBeCloseTo(1560 * 0.0015);
    expect(record.pages).toBe(26);
    expect(record.version).toBe(`${LLAMA_MODEL} version 2.6`);
    expect(record.usage).toMatchObject({
      credits: 1560,
      extract_credits: 1300,
      parse_credits: 260,
      num_pages_billed: 26,
      cost_basis: "credits",
    });
    expect(record.raw).toMatchObject({
      upload: { id: "dfl-1" },
      job: { status: "COMPLETED" },
      instructions: llamaInstructions(2022).layout,
    });
  });

  it("prices billed pages when the credits never arrive, n/a without either", async () => {
    serve(routes([job({ usage: { credits: null } })]));
    const record = newRecord();
    await llamaExtractAttempt({ entry, pdf, apiKey: KEY, price, record }, fast);
    expect(record.costUsd).toBeCloseTo(26 * 0.09);
    expect(record.usage.cost_basis).toBe("pages");

    serve(routes([job({ usage: { credits: null }, metadata: {} })]));
    const none = newRecord();
    await llamaExtractAttempt(
      { entry, pdf, apiKey: KEY, price, record: none },
      fast,
    );
    expect(none.costUsd).toBeNull();
    expect(none.pages).toBeNull();
  });

  it("does not resend the paid job request on a 502, but retries the upload", async () => {
    let uploads = 0;
    serve({
      "POST /api/v1/beta/files": () =>
        ++uploads === 1
          ? new Response("busy", { status: 502 })
          : { id: "dfl-1" },
      "POST /api/v2/extract": () =>
        new Response("bad gateway", { status: 502 }),
    });
    await expect(
      llamaExtractAttempt(
        { entry, pdf, apiKey: KEY, price, record: newRecord() },
        fast,
      ),
    ).rejects.toMatchObject({ status: 502 });
    expect(uploads).toBe(2);
    expect(
      requests.filter((r) => r.url.pathname === "/api/v2/extract"),
    ).toHaveLength(1);
  });

  it("throws with the error message of a failed job", async () => {
    serve(
      routes([
        { id: "ext-1", status: "FAILED", error_message: "schema too large" },
      ]),
    );
    const record = newRecord();
    await expect(
      llamaExtractAttempt({ entry, pdf, apiKey: KEY, price, record }, fast),
    ).rejects.toThrow(/job FAILED: schema too large/);
    expect(record.raw.job).toMatchObject({ status: "FAILED" });
  });

  it("throws on an answer without rows", async () => {
    serve(routes([job({ extract_result: { rows: null } })]));
    await expect(
      llamaExtractAttempt(
        { entry, pdf, apiKey: KEY, price, record: newRecord() },
        fast,
      ),
    ).rejects.toThrow(/rows array/);
  });
});
