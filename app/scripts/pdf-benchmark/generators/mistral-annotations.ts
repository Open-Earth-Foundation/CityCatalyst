/**
 * Mistral Document AI annotations generator (CC-1295): sends each benchmark PDF
 * to Mistral OCR with a document annotation in the envelope's JSON schema and
 * writes the answers as an envelope folder for `--pipeline precomputed`.
 *
 *   npx tsx scripts/pdf-benchmark/generators/mistral-annotations.ts \
 *     --cases C-015,C-016 --runs 3 --out benchmarks/pdf/generated/mistral-<date>
 *
 * API used (Mistral docs, read 2026-11-18):
 * https://docs.mistral.ai/api/endpoint/ocr and
 * https://docs.mistral.ai/studio/document-processing/annotations
 * POST /v1/ocr with `document_annotation_format` ({ type: "json_schema",
 * json_schema: { name, schema, strict } }), `document_annotation_prompt` (free
 * text; needs the format) and `pages` (zero-based). The answer comes back as a
 * JSON string in `document_annotation`, pages billed in `usage_info`. The docs'
 * annotation examples use ranges of 8 pages, the limit earlier docs gave for
 * document annotations, so each call covers at most 8 pages and the rows of the
 * calls are joined. A local PDF is sent as a base64 data URL (basic OCR docs).
 *
 * The response has no dollar cost, so cost = pages processed x
 * prices.json `vendors["mistral/annotations"].perPage` (null without a price).
 *
 * The model is MISTRAL_OCR_MODEL (as the app's OCR), the key MISTRAL_API_KEY
 * from app/.env. The key is only ever put in the request header; raw answers
 * keep no request headers.
 */
import env from "@next/env";
import fs from "node:fs";
import { resolve } from "node:path";
import type { EnvelopeData } from "@/backend/ingestion-benchmark/pipelines/rows-dir";
import type { PricesFile } from "@/backend/ingestion-benchmark/report";
import { getPdfOcrConfig } from "@/backend/pdf-ocr-config";
import { DEFAULT_CONFIG_PATH } from "../args";
import {
  PRICES_PATH,
  emptyData,
  envelopeInstructions,
  envelopeSchema,
  mergeChunkData,
  pageRanges,
  pdfPageCount,
  prepareGeneration,
  readCasePdf,
  writeEnvelope,
  type GeneratorConfig,
} from "./common";

const OCR_URL = "https://api.mistral.ai/v1/ocr";
const PIPELINE = "mistral/annotations";
const MODE = "document_annotation";
const PAGES_PER_CALL = 8;
/** Annotation calls run an LLM over 8 pages; longer than the app's plain OCR timeout. */
const CALL_TIMEOUT_MS = 600_000;

type Args = { cases: string; runs: number; out: string; configPath: string };

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { runs: 1, configPath: DEFAULT_CONFIG_PATH };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${argv[i]} needs a value`);
    }
    switch (argv[i++]) {
      case "--cases":
        args.cases = value;
        break;
      case "--runs":
        args.runs = Number(value);
        break;
      case "--out":
        args.out = value;
        break;
      case "--config":
        args.configPath = value;
        break;
      default:
        throw new Error(`Unknown argument ${argv[i - 1]}`);
    }
  }
  if (!args.cases || !args.out) {
    throw new Error(
      "Usage: mistral-annotations.ts --cases <ids> --out <folder> [--runs n] [--config path]",
    );
  }
  return args as Args;
}

class CallError extends Error {
  constructor(
    message: string,
    readonly body: unknown = null,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

type Call = {
  pages: number[];
  status: number | null;
  response: unknown;
};

/** One annotation call; throws CallError (status and body only, never the request). */
async function annotate(
  apiKey: string,
  model: string,
  documentUrl: string,
  pages: number[],
  targetYear: number,
): Promise<{ status: number; response: Record<string, unknown> }> {
  let response: Response;
  try {
    response = await fetch(OCR_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        document: { type: "document_url", document_url: documentUrl },
        pages,
        document_annotation_format: {
          type: "json_schema",
          json_schema: {
            name: "ghgi_envelope",
            schema: envelopeSchema(),
            strict: true,
          },
        },
        document_annotation_prompt: envelopeInstructions(targetYear),
        include_image_base64: false,
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (error) {
    throw new CallError(`request failed (${(error as Error).name})`);
  }
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep the text
  }
  if (!response.ok) {
    throw new CallError(`status ${response.status}`, body, response.status);
  }
  if (typeof body !== "object" || body === null) {
    throw new CallError("response is not JSON", body);
  }
  return { status: response.status, response: body as Record<string, unknown> };
}

function pagesProcessed(response: Record<string, unknown>): number {
  const usage = response.usage_info as Record<string, unknown> | undefined;
  return typeof usage?.pages_processed === "number" ? usage.pages_processed : 0;
}

function annotationData(response: Record<string, unknown>): EnvelopeData {
  const annotation = response.document_annotation;
  if (typeof annotation !== "string") {
    throw new CallError("response has no document_annotation");
  }
  try {
    return JSON.parse(annotation) as EnvelopeData;
  } catch {
    throw new CallError("document_annotation is not valid JSON");
  }
}

async function main(argv: string[]): Promise<number> {
  let args: Args;
  let config: GeneratorConfig;
  try {
    args = parseArgs(argv);
    config = JSON.parse(fs.readFileSync(resolve(args.configPath), "utf8"));
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  const out = resolve(args.out);
  let selected;
  try {
    selected = prepareGeneration({
      vendor: "mistral",
      cases: args.cases,
      runs: args.runs,
      out,
      config,
    });
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  env.loadEnvConfig(process.cwd());
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error("MISTRAL_API_KEY is not set (app/.env)");
    return 2;
  }
  const model = getPdfOcrConfig().model;
  const prices = JSON.parse(fs.readFileSync(PRICES_PATH, "utf8")) as PricesFile;
  const perPage = prices.vendors?.[PIPELINE]?.perPage ?? null;
  if (perPage === null) {
    console.warn(`No price for ${PIPELINE} in prices.json: cost will be n/a`);
  }

  let failed = 0;
  for (const entry of selected) {
    const pdf = readCasePdf(config, entry);
    const pageCount = pdfPageCount(pdf);
    const documentUrl = `data:application/pdf;base64,${pdf.toString("base64")}`;
    for (let attempt = 1; attempt <= args.runs; attempt++) {
      const calls: Call[] = [];
      const parts: EnvelopeData[] = [];
      let version: string | null = null;
      let error: string | null = null;
      try {
        if (pageCount === null) throw new CallError("page count not found");
        for (const pages of pageRanges(pageCount, PAGES_PER_CALL)) {
          const call: Call = { pages, status: null, response: null };
          calls.push(call);
          try {
            const result = await annotate(
              apiKey,
              model,
              documentUrl,
              pages,
              entry.year,
            );
            call.status = result.status;
            call.response = result.response;
            version ??=
              typeof result.response.model === "string"
                ? result.response.model
                : model;
            parts.push(annotationData(result.response));
          } catch (callError) {
            if (callError instanceof CallError && call.response === null) {
              call.status = callError.status;
              call.response = callError.body;
            }
            throw callError;
          }
        }
      } catch (caught) {
        error = (caught as Error).message;
      }

      // Pages billed even when a later range failed.
      const pages = calls.reduce(
        (sum, call) =>
          sum +
          (typeof call.response === "object" && call.response !== null
            ? pagesProcessed(call.response as Record<string, unknown>)
            : 0),
        0,
      );
      const costUsd = perPage === null ? null : pages * perPage;
      writeEnvelope(
        out,
        entry,
        attempt,
        {
          data: error ? emptyData() : mergeChunkData(parts),
          usage: { pages_processed: pages, calls: calls.length },
          costUsd,
          pipeline: PIPELINE,
          mode: MODE,
          version: version ?? model,
          executionStatus: error ? "failed" : "completed",
        },
        { model, pageCount, error, calls },
      );
      const rows = error ? 0 : parts.reduce((n, p) => n + p.rows.length, 0);
      console.log(
        `${entry.id} attempt ${attempt}: ${error ? `failed (${error})` : `${rows} rows`}, ${pages} pages, ${costUsd === null ? "cost n/a" : `$${costUsd.toFixed(3)}`}`,
      );
      if (error) failed++;
    }
  }
  console.log(`Envelopes: ${out}`);
  return failed ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error((error as Error).message);
    process.exit(1);
  },
);
