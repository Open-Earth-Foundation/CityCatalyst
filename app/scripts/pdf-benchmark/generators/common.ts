/**
 * Shared base of the external pipeline generators (CC-1295). A generator sends
 * a local benchmark PDF to a document-extraction vendor and writes the answer
 * as an envelope folder that `pdf-benchmark.ts --pipeline precomputed
 * --rows-dir <out>` scores:
 *
 *   <out>/manifest.json               { study: <vendor>, stage, entries }
 *   <out>/results/<case>-attempt-<n>.json   the envelope (result.data, usage, cost)
 *   <out>/raw/<case>-attempt-<n>.json       the vendor's raw answer, secrets stripped
 *
 * Generated folders live under benchmarks/pdf/generated/ (git-ignored): the raw
 * answers hold third-party document text and are never committed.
 */
import env from "@next/env";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { SYSTEM_PROMPT } from "@/backend/extraction-system-prompt";
import type { EnvelopeData } from "@/backend/ingestion-benchmark/pipelines/rows-dir";
import type {
  PricesFile,
  VendorPrice,
} from "@/backend/ingestion-benchmark/report";
import {
  loadManifest,
  selectCases,
  type CaseManifestEntry,
} from "@/backend/ingestion-benchmark/selection";
import { DEFAULT_CONFIG_PATH } from "../args";
import { pdfPathFor, type LocalConfig } from "../run-case";

export type Vendor = "mistral" | "reducto" | "llamacloud";

export type GeneratorConfig = LocalConfig & { allowedVendors?: string[] };

export const MANIFEST_PATH = "benchmarks/pdf/cases.json";
export const SCHEMA_PATH = "benchmarks/pdf/schemas/ghgi-envelope.schema.json";
export const PRICES_PATH = "benchmarks/pdf/prices.json";

type FolderManifest = {
  study: string;
  stage: string;
  /** The exact vendor model id every envelope of the folder was made with. */
  model?: string;
  /** The envelope mode every envelope of the folder was made with. */
  mode?: string;
  /** How the instructions were laid out when a vendor could not take them whole. */
  instructions?: string;
  entries: {
    case_id: string;
    attempt: number;
    file: string;
    rows: number;
    execution_status: string;
    sha256: string;
  }[];
};

const manifestFile = (out: string) => path.join(out, "manifest.json");

function readFolderManifest(out: string): FolderManifest | null {
  const file = manifestFile(out);
  return fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf8")) as FolderManifest)
    : null;
}

/**
 * Checks everything that must hold before any paid call: the vendor is cleared
 * in `allowedVendors`, no selected case is held out, every PDF is found and the
 * folder is not another vendor's. Then starts the folder manifest (study = the
 * vendor, stage = `stage` or today's date) and returns the selected cases.
 */
export function prepareGeneration(opts: {
  vendor: Vendor;
  cases: string;
  runs: number;
  out: string;
  config: GeneratorConfig;
  /** Defaults to benchmarks/pdf/cases.json. */
  manifest?: CaseManifestEntry[];
  /** Run label for the folder manifest; defaults to today's date (YYYY-MM-DD). */
  stage?: string;
  /** Pinned vendor model id, recorded in the folder manifest. */
  model?: string;
  /** Envelope mode (for example how pages are split), recorded in the folder manifest. */
  mode?: string;
  /** Instruction layout when not the whole envelopeInstructions(), recorded in the folder manifest. */
  instructions?: string;
}): CaseManifestEntry[] {
  const { vendor, config, out } = opts;
  if (!config.allowedVendors?.includes(vendor)) {
    throw new Error(
      `Vendor "${vendor}" is not in allowedVendors of the local config: sending benchmark PDFs to it is not cleared.`,
    );
  }
  if (!Number.isInteger(opts.runs) || opts.runs < 1) {
    throw new Error("--runs must be a positive integer");
  }
  if (opts.runs > 3) {
    throw new Error("--runs must be at most 3 (3 attempts per case)");
  }
  const selected = selectCases(opts.manifest ?? loadManifest(MANIFEST_PATH), {
    cases: opts.cases,
  });
  const heldOut = selected.filter((entry) => entry.block === "held-out");
  if (heldOut.length) {
    throw new Error(
      `held-out cases are never sent to a vendor: ${heldOut.map((e) => e.id).join(", ")}`,
    );
  }
  const missing = selected.filter((entry) => !pdfPathFor(config, entry));
  if (missing.length) {
    throw new Error(
      missing
        .map((e) => `${e.id}: PDF "${e.fileName}" not found in pdfDir`)
        .join("\n"),
    );
  }
  const existing = readFolderManifest(out);
  if (existing && existing.study !== vendor) {
    throw new Error(
      `${out} holds envelopes of "${existing.study}"; use another --out folder.`,
    );
  }
  if (existing && existing.model !== opts.model) {
    throw new Error(
      `${out} holds envelopes of model "${existing.model ?? "none"}"; use another --out folder.`,
    );
  }
  if (existing && existing.mode !== opts.mode) {
    throw new Error(
      `${out} holds envelopes of mode "${existing.mode ?? "none"}"; use another --out folder.`,
    );
  }
  if (existing && existing.instructions !== opts.instructions) {
    throw new Error(
      `${out} holds envelopes of instruction layout "${existing.instructions ?? "whole"}"; use another --out folder.`,
    );
  }

  fs.mkdirSync(path.join(out, "results"), { recursive: true });
  fs.mkdirSync(path.join(out, "raw"), { recursive: true });
  if (!existing) {
    const stage = opts.stage ?? new Date().toISOString().slice(0, 10);
    writeJson(manifestFile(out), {
      study: vendor,
      stage,
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.mode ? { mode: opts.mode } : {}),
      ...(opts.instructions ? { instructions: opts.instructions } : {}),
      entries: [],
    });
  }
  return selected;
}

export type GeneratorArgs = {
  cases: string;
  runs: number;
  out: string;
  configPath: string;
  model?: string;
  /** One call over the whole document, or one call per range of 8 pages. */
  ranges: PageRanges;
};

export type PageRanges = "whole" | "8";
export const DEFAULT_PAGE_RANGES: PageRanges = "whole";

/** `--cases <ids> --out <folder> [--runs n] [--config path] [--model id] [--ranges whole|8]`. */
export function parseGeneratorArgs(argv: string[]): GeneratorArgs {
  const args: Partial<GeneratorArgs> = {
    runs: 1,
    configPath: DEFAULT_CONFIG_PATH,
    ranges: DEFAULT_PAGE_RANGES,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${flag} needs a value`);
    }
    if (flag === "--cases") args.cases = value;
    else if (flag === "--runs") args.runs = Number(value);
    else if (flag === "--out") args.out = value;
    else if (flag === "--config") args.configPath = value;
    else if (flag === "--model") args.model = value;
    else if (flag === "--ranges") {
      if (value !== "whole" && value !== "8") {
        throw new Error("--ranges must be whole or 8");
      }
      args.ranges = value;
    } else throw new Error(`Unknown argument ${flag}`);
  }
  if (!args.cases || !args.out) {
    throw new Error(
      "Usage: --cases <ids> --out <folder> [--runs n] [--config path] [--model id] [--ranges whole|8]",
    );
  }
  return args as GeneratorArgs;
}

/**
 * The model id a generator calls: required, and never a `-latest` alias, which
 * can change model and price silently; the price and the envelopes must name
 * the model that actually ran.
 */
export function pinnedModel(model: string | undefined): string {
  if (!model) throw new Error("--model <exact model id> is required");
  if (model.endsWith("-latest")) {
    throw new Error(
      `--model ${model} is an alias; pass an exact model id so price and envelopes name the model that ran`,
    );
  }
  return model;
}

/**
 * A vendor's parsed answer as envelope data, or an error when it is not an
 * object with a rows array. Field values are left to the rows folder reader,
 * which rejects an invalid field when the run scores the envelope.
 */
export function asEnvelopeData(value: unknown): EnvelopeData {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !Array.isArray((value as { rows?: unknown }).rows)
  ) {
    throw new Error("answer is not an object with a rows array");
  }
  return value as EnvelopeData;
}

/** Data of an envelope with no answer: what a failed vendor call writes. */
export function emptyData(): EnvelopeData {
  return {
    reporting_year: null,
    reported_total_tco2e: null,
    total_basis: null,
    reported_gross_total_tco2e: null,
    reported_net_total_tco2e: null,
    reported_removals_tco2e: null,
    total_kind: "unknown",
    reconciliation_tolerance_tco2e: null,
    rows: [],
  };
}

/**
 * Field names that look like a credential. `token` alone, so usage counts such
 * as `input_tokens` stay in the raw answer.
 */
const SECRET_KEY = /authorization|api[-_]?key|secret|bearer|token(?!s)/i;

function redact(text: string, secrets: string[]): string {
  return secrets.reduce(
    (result, secret) =>
      secret ? result.replaceAll(secret, "[redacted]") : result,
    text,
  );
}

/**
 * A deep copy without any field whose name looks like a credential, and with
 * every occurrence of the given secret values (the API key) in a string or a
 * field name replaced by "[redacted]".
 */
export function stripSecrets(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === "string") return redact(value, secrets);
  if (Array.isArray(value))
    return value.map((item) => stripSecrets(item, secrets));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEY.test(key))
        .map(([key, child]) => [
          redact(key, secrets),
          stripSecrets(child, secrets),
        ]),
    );
  }
  return value;
}

/** A failed vendor call: its status and answer body only, never the request. */
export class CallError extends Error {
  constructor(
    message: string,
    readonly body: unknown = null,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/** Per-call timeout of a vendor call: extraction runs an LLM over many pages. */
export const CALL_TIMEOUT_MS = 600_000;

/**
 * One vendor call that answers JSON, each try with its own `timeoutMs`.
 * Throws CallError on a network error, a non-2xx answer or an answer that is
 * not a JSON object.
 *
 * Retry (ruling R11 as amended): an upload or a GET is retried once on HTTP
 * 429, any 5xx or a timeout. A `billing` call (one that starts a paid job or
 * is billed itself: Reducto POST /extract_async, LlamaExtract POST
 * /api/v2/extract, Mistral POST /v1/ocr) is retried once only on 429 and 503,
 * which say the request was not taken; a timeout or another 5xx may come after
 * the vendor accepted it, and a second request would be billed again.
 */
export async function requestJson(
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; retryDelayMs?: number; billing?: boolean } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const timeoutMs = opts.timeoutMs ?? CALL_TIMEOUT_MS;
  const retryDelayMs = opts.retryDelayMs ?? 5_000;
  const retryable = (status: number) =>
    opts.billing
      ? status === 429 || status === 503
      : status === 429 || status >= 500;
  for (let attempt = 1; ; attempt++) {
    const last = attempt === 2;
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = (error as Error).name;
      if (!last && !opts.billing && name === "TimeoutError") {
        await sleep(retryDelayMs);
        continue;
      }
      throw new CallError(`request failed (${name})`);
    }
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep the text
    }
    if (!response.ok) {
      if (!last && retryable(response.status)) {
        await sleep(retryDelayMs);
        continue;
      }
      throw new CallError(`status ${response.status}`, body, response.status);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new CallError("response is not JSON", body);
    }
    return { status: response.status, body: body as Record<string, unknown> };
  }
}

function writeJson(file: string, value: unknown): string {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(file, text);
  return text;
}

/**
 * Writes one attempt's envelope and raw answer and records the envelope in the
 * folder manifest with its sha256 (replacing an earlier entry of the same case
 * and attempt). The envelope holds only what the reader picks: never answer-key
 * (`benchmark`) or `repair` material.
 */
export function writeEnvelope(
  out: string,
  entry: CaseManifestEntry,
  attempt: number,
  envelope: {
    data: EnvelopeData;
    usage: Record<string, unknown>;
    costUsd: number | null;
    pipeline: string;
    mode: string | null;
    version: string | null;
    /** Defaults to completed; a failed vendor call writes "failed" with emptyData(). */
    executionStatus?: "completed" | "failed";
  },
  raw: unknown,
  /** Secret values (the API key) to redact anywhere in the saved raw answer. */
  secrets: string[] = [],
): void {
  const manifest = readFolderManifest(out);
  if (!manifest) throw new Error(`${out} has no manifest.json`);
  const name = `${entry.id}-attempt-${attempt}.json`;
  const file = `results/${name}`;
  const executionStatus = envelope.executionStatus ?? "completed";
  const text = writeJson(path.join(out, file), {
    execution_status: executionStatus,
    result: { data: envelope.data },
    usage: envelope.usage,
    pipeline: envelope.pipeline,
    mode: envelope.mode,
    version: envelope.version,
    cost_usd: envelope.costUsd,
  });
  writeJson(path.join(out, "raw", name), stripSecrets(raw, secrets));

  manifest.entries = manifest.entries.filter(
    (e) => !(e.case_id === entry.id && e.attempt === attempt),
  );
  manifest.entries.push({
    case_id: entry.id,
    attempt,
    file,
    rows: envelope.data.rows.length,
    execution_status: executionStatus,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
  writeJson(manifestFile(out), manifest);
}

/**
 * The built-in extraction prompt plus the year instruction the built-in
 * extraction adds (InventoryExtractionService), so vendors get the same task.
 * The prompt's own output format is for the built-in LLM; the closing line
 * tells the vendor the JSON schema decides the answer's shape.
 */
export function envelopeInstructions(targetYear: number): string {
  return [SYSTEM_PROMPT, ...envelopeYearLines(targetYear)].join("\n\n");
}

/**
 * The lines envelopeInstructions adds after the built-in prompt. `formatAt`
 * names where the built-in output format is, for a vendor that gets it
 * elsewhere than above these lines.
 */
export function envelopeYearLines(
  targetYear: number,
  formatAt = "the output format above",
): string[] {
  return [
    `Extract only emissions data for the year ${targetYear}. Do not output rows from tables or columns of other years. Set year to the year each value belongs to (${targetYear}); use null only when the document gives no year.`,
    `Answer in the JSON schema you are given, not in ${formatAt}: one row per distinct emissions or notation row, with the field meanings the schema describes. reporting_year is ${targetYear}.`,
  ];
}

/**
 * The JSON schema of `result.data` (the copied envelope schema), without its
 * `$`-keywords, which vendor structured-output APIs do not need.
 */
export function envelopeSchema(): object {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8")) as Record<
    string,
    unknown
  >;
  return Object.fromEntries(
    Object.entries(schema).filter(([key]) => !key.startsWith("$")),
  );
}

/**
 * Page count from the PDF page tree: the largest `/Type /Pages ... /Count n`
 * (the root), searched in the file and in its Flate object streams. Null when
 * no page tree is found. Avoids a PDF dependency for one number.
 */
export function pdfPageCount(pdf: Buffer): number | null {
  const raw = pdf.toString("latin1");
  const texts = [raw];
  const objStm = /\/Type\s*\/ObjStm[\s\S]*?stream\r?\n/g;
  for (let m = objStm.exec(raw); m; m = objStm.exec(raw)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try {
      // zlib stops at the end of the deflate data, so a trailing EOL is fine.
      texts.push(
        zlib
          .inflateSync(pdf.subarray(start, end), {
            finishFlush: zlib.constants.Z_SYNC_FLUSH,
          })
          .toString("latin1"),
      );
    } catch {
      // not a Flate stream: its pages, if any, are not counted
    }
  }
  let count: number | null = null;
  const pages =
    /\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g;
  for (const text of texts) {
    for (const m of text.matchAll(pages)) {
      const n = Number(m[1] ?? m[2]);
      if (count === null || n > count) count = n;
    }
  }
  return count;
}

/** Zero-based page numbers in consecutive ranges of at most `size`. */
export function pageRanges(pageCount: number, size: number): number[][] {
  const ranges: number[][] = [];
  for (let first = 0; first < pageCount; first += size) {
    const last = Math.min(first + size, pageCount);
    ranges.push(Array.from({ length: last - first }, (_, i) => first + i));
  }
  return ranges;
}

const SCALAR_KEYS = [
  "reporting_year",
  "reported_total_tco2e",
  "total_basis",
  "reported_gross_total_tco2e",
  "reported_net_total_tco2e",
  "reported_removals_tco2e",
  "reconciliation_tolerance_tco2e",
] as const;

/**
 * Joins the answers of one document's page ranges, in page order: the rows of
 * every range, and for each total or label the first range that gives one
 * (total_kind: the first that is not "unknown"). No row is deduplicated or
 * repaired; overlaps between ranges stay the pipeline's own output.
 */
export function mergeChunkData(parts: EnvelopeData[]): EnvelopeData {
  const merged = emptyData();
  for (const part of parts) {
    for (const key of SCALAR_KEYS) {
      if (merged[key] === null && part[key] !== null) {
        (merged as Record<string, unknown>)[key] = part[key];
      }
    }
    if (merged.total_kind === "unknown") merged.total_kind = part.total_kind;
    merged.rows.push(...part.rows);
  }
  return merged;
}

/** Reads the PDF of a case prepared by prepareGeneration. */
export function readCasePdf(
  config: GeneratorConfig,
  entry: CaseManifestEntry,
): Buffer {
  const file = pdfPathFor(config, entry);
  if (!file) throw new Error(`${entry.id}: PDF not found`);
  return fs.readFileSync(file);
}

export const sleep = (ms: number) =>
  new Promise<void>((done) => setTimeout(done, ms));

/** Polls an asynchronous vendor job until `done`, or throws CallError after `deadlineMs`. */
export async function pollJob<T>(
  get: () => Promise<T>,
  done: (job: T) => boolean,
  opts: { pollMs: number; deadlineMs: number },
): Promise<{ job: T; polls: number }> {
  const deadline = Date.now() + opts.deadlineMs;
  for (let polls = 1; ; polls++) {
    const job = await get();
    if (done(job)) return { job, polls };
    if (Date.now() + opts.pollMs > deadline) {
      throw new CallError(
        `job not finished after ${Math.round(opts.deadlineMs / 60_000)} min`,
        job,
      );
    }
    await sleep(opts.pollMs);
  }
}

/** A multipart body holding the PDF as `file`, plus any text fields. */
export function pdfForm(
  pdf: Buffer,
  fileName: string,
  fields: Record<string, string> = {},
): FormData {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
    fileName,
  );
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

/**
 * What one attempt of a vendor generator records while it runs, filled in as
 * soon as known so that a later failure still writes the billed usage and cost.
 */
export type AttemptRecord = {
  usage: Record<string, unknown>;
  costUsd: number | null;
  /** Pages the vendor reports it processed, for the log line; null when it reports none. */
  pages: number | null;
  version: string | null;
  /** The vendor's raw answers, saved (secrets stripped) next to the envelope. */
  raw: Record<string, unknown>;
};

/** Polling of an asynchronous vendor job; the defaults are the generators'. */
export type PollOptions = {
  pollMs?: number;
  /** Longest wait for one job. */
  deadlineMs?: number;
  /** Pause before the one retry of a call. */
  retryDelayMs?: number;
};

export type VendorAttempt = (ctx: {
  entry: CaseManifestEntry;
  pdf: Buffer;
  apiKey: string;
  /** prices.json `vendors[<mode>]`, or null: cost n/a. */
  price: VendorPrice | null;
  record: AttemptRecord;
}) => Promise<EnvelopeData>;

/**
 * The command line of a generator with one fixed mode (Reducto, LlamaExtract):
 * `--cases <ids> --out <folder> [--runs n] [--config path]`. Each attempt of
 * each case runs `attempt`; one that throws writes a failed envelope with
 * empty rows and whatever usage and cost it recorded. Returns the exit code:
 * 0, 1 when an attempt failed, 2 for a setup error before any vendor call.
 */
export async function runGenerator(
  opts: {
    vendor: Vendor;
    pipeline: string;
    /** Envelope and folder mode; also the prices.json `vendors` key. */
    mode: string;
    /** Pinned vendor model or tier, recorded in the folder manifest. */
    model: string;
    /** Instruction layout when not the whole envelopeInstructions(), recorded in the folder manifest. */
    instructions?: string;
    /** Environment variable of the API key (from app/.env). */
    keyName: string;
    attempt: VendorAttempt;
    /** Test hook; defaults to benchmarks/pdf/cases.json. */
    manifest?: CaseManifestEntry[];
  },
  argv: string[],
): Promise<number> {
  let args: GeneratorArgs;
  let config: GeneratorConfig;
  let selected: CaseManifestEntry[];
  let out: string;
  try {
    const fixed = argv.find(
      (flag) => flag === "--model" || flag === "--ranges",
    );
    if (fixed) throw new Error(`${fixed} is not used by this generator`);
    args = parseGeneratorArgs(argv);
    config = JSON.parse(fs.readFileSync(path.resolve(args.configPath), "utf8"));
    out = path.resolve(args.out);
    selected = prepareGeneration({
      vendor: opts.vendor,
      cases: args.cases,
      runs: args.runs,
      out,
      config,
      model: opts.model,
      mode: opts.mode,
      instructions: opts.instructions,
      manifest: opts.manifest,
    });
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  if (!process.env[opts.keyName]) env.loadEnvConfig(process.cwd());
  const apiKey = process.env[opts.keyName];
  if (!apiKey) {
    console.error(`${opts.keyName} is not set (app/.env)`);
    return 2;
  }
  const prices = JSON.parse(fs.readFileSync(PRICES_PATH, "utf8")) as PricesFile;
  const price = prices.vendors?.[opts.mode] ?? null;
  if (!price) {
    console.warn(`No price for ${opts.mode} in prices.json: cost will be n/a`);
  }

  let failed = 0;
  for (const entry of selected) {
    const pdf = readCasePdf(config, entry);
    for (let attempt = 1; attempt <= args.runs; attempt++) {
      const record: AttemptRecord = {
        usage: {},
        costUsd: null,
        pages: null,
        version: null,
        raw: {},
      };
      let data = emptyData();
      let error: string | null = null;
      try {
        data = await opts.attempt({ entry, pdf, apiKey, price, record });
      } catch (caught) {
        error = (caught as Error).message;
        if (caught instanceof CallError && caught.body !== null) {
          record.raw.errorBody = caught.body;
        }
      }
      writeEnvelope(
        out,
        entry,
        attempt,
        {
          data: error ? emptyData() : data,
          usage: record.usage,
          costUsd: record.costUsd,
          pipeline: opts.pipeline,
          mode: opts.mode,
          version: record.version,
          executionStatus: error ? "failed" : "completed",
        },
        { mode: opts.mode, version: record.version, error, ...record.raw },
        [apiKey],
      );
      const rows = error ? 0 : data.rows.length;
      const cost =
        record.costUsd === null ? "cost n/a" : `$${record.costUsd.toFixed(3)}`;
      console.log(
        `${entry.id} attempt ${attempt}: ${error ? `failed (${error})` : `${rows} rows`}, ${record.pages ?? "n/a"} pages, ${cost}`,
      );
      if (error) failed++;
    }
  }
  console.log(`Envelopes: ${out}`);
  return failed ? 1 : 0;
}

/** Runs a generator's main and exits with its code. */
export function exitWith(code: Promise<number>): void {
  code.then(
    (value) => process.exit(value),
    (error) => {
      console.error((error as Error).message);
      process.exit(1);
    },
  );
}
