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
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { SYSTEM_PROMPT } from "@/backend/extraction-system-prompt";
import type { EnvelopeData } from "@/backend/ingestion-benchmark/pipelines/rows-dir";
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

  fs.mkdirSync(path.join(out, "results"), { recursive: true });
  fs.mkdirSync(path.join(out, "raw"), { recursive: true });
  if (!existing) {
    const stage = opts.stage ?? new Date().toISOString().slice(0, 10);
    writeJson(manifestFile(out), {
      study: vendor,
      stage,
      ...(opts.model ? { model: opts.model } : {}),
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
};

/** `--cases <ids> --out <folder> [--runs n] [--config path] [--model id]`. */
export function parseGeneratorArgs(argv: string[]): GeneratorArgs {
  const args: Partial<GeneratorArgs> = {
    runs: 1,
    configPath: DEFAULT_CONFIG_PATH,
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
    else throw new Error(`Unknown argument ${flag}`);
  }
  if (!args.cases || !args.out) {
    throw new Error(
      "Usage: --cases <ids> --out <folder> [--runs n] [--config path] [--model id]",
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

const SECRET_KEY = /authorization|api[-_]?key/i;

/** A deep copy without any field whose name looks like a credential. */
export function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEY.test(key))
        .map(([key, child]) => [key, stripSecrets(child)]),
    );
  }
  return value;
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
  writeJson(path.join(out, "raw", name), stripSecrets(raw));

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
  return [
    SYSTEM_PROMPT,
    `Extract only emissions data for the year ${targetYear}. Do not output rows from tables or columns of other years. Set year to the year each value belongs to (${targetYear}); use null only when the document gives no year.`,
    `Answer in the JSON schema you are given, not in the output format above: one row per distinct emissions or notation row, with the field meanings the schema describes. reporting_year is ${targetYear}.`,
  ].join("\n\n");
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
