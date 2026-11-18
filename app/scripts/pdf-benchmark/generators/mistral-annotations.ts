/**
 * Mistral Document AI annotations generator (CC-1295): sends each benchmark PDF
 * to Mistral OCR with a document annotation in the envelope's JSON schema and
 * writes the answers as an envelope folder for `--pipeline precomputed`.
 *
 *   npx tsx scripts/pdf-benchmark/generators/mistral-annotations.ts \
 *     --model mistral-ocr-4-1 --cases C-015,C-016 --runs 3 \
 *     --out benchmarks/pdf/generated/mistral-<date>
 *
 * `--model` is required and must be an exact model id, never a `-latest`
 * alias (the alias can move to another model and price without notice). The
 * current OCR model is OCR 4.1, id `mistral-ocr-4-1` (Mistral changelog
 * 2026-09-29, https://docs.mistral.ai/getting-started/changelog, read
 * 2026-11-18; model card https://docs.mistral.ai/models/ocr-4-1). The envelope
 * `version` and the folder manifest record that id.
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
 * prices.json `vendors["mistral/annotations/<model id>"].perPage`: the price
 * of exactly the model called, null (cost n/a) without one. Whether Mistral's
 * annotated-page price includes the plain OCR page price is not confirmed.
 *
 * The key is MISTRAL_API_KEY from app/.env. It is only ever put in the request
 * header; raw answers keep no request headers. The app's MISTRAL_OCR_MODEL is
 * not used here.
 */
import env from "@next/env";
import fs from "node:fs";
import { resolve } from "node:path";
import type { EnvelopeData } from "@/backend/ingestion-benchmark/pipelines/rows-dir";
import type { PricesFile } from "@/backend/ingestion-benchmark/report";
import {
  PRICES_PATH,
  asEnvelopeData,
  emptyData,
  envelopeInstructions,
  envelopeSchema,
  mergeChunkData,
  pageRanges,
  parseGeneratorArgs,
  pdfPageCount,
  pinnedModel,
  prepareGeneration,
  readCasePdf,
  writeEnvelope,
  type GeneratorArgs,
  type GeneratorConfig,
} from "./common";

const OCR_URL = "https://api.mistral.ai/v1/ocr";
const PIPELINE = "mistral/annotations";
const MODE = "document_annotation";
const PAGES_PER_CALL = 8;
/** Annotation calls run an LLM over 8 pages; longer than the app's plain OCR timeout. */
const CALL_TIMEOUT_MS = 600_000;

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
  let parsed: unknown;
  try {
    parsed = JSON.parse(annotation);
  } catch {
    throw new CallError("document_annotation is not valid JSON");
  }
  try {
    return asEnvelopeData(parsed);
  } catch (error) {
    throw new CallError(`document_annotation: ${(error as Error).message}`);
  }
}

async function main(argv: string[]): Promise<number> {
  let args: GeneratorArgs;
  let model: string;
  let config: GeneratorConfig;
  try {
    args = parseGeneratorArgs(argv);
    model = pinnedModel(args.model);
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
      model,
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
  const prices = JSON.parse(fs.readFileSync(PRICES_PATH, "utf8")) as PricesFile;
  const priceKey = `${PIPELINE}/${model}`;
  const perPage = prices.vendors?.[priceKey]?.perPage ?? null;
  if (perPage === null) {
    console.warn(`No price for ${priceKey} in prices.json: cost will be n/a`);
  }

  let failed = 0;
  for (const entry of selected) {
    const pdf = readCasePdf(config, entry);
    const pageCount = pdfPageCount(pdf);
    const documentUrl = `data:application/pdf;base64,${pdf.toString("base64")}`;
    for (let attempt = 1; attempt <= args.runs; attempt++) {
      const calls: Call[] = [];
      const parts: EnvelopeData[] = [];
      let data = emptyData();
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
            parts.push(annotationData(result.response));
          } catch (callError) {
            if (callError instanceof CallError && call.response === null) {
              call.status = callError.status;
              call.response = callError.body;
            }
            throw callError;
          }
        }
        data = mergeChunkData(parts);
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
          data: error ? emptyData() : data,
          usage: { pages_processed: pages, calls: calls.length },
          costUsd,
          pipeline: PIPELINE,
          mode: MODE,
          version: model,
          executionStatus: error ? "failed" : "completed",
        },
        { model, pageCount, error, calls },
      );
      const rows = error ? 0 : data.rows.length;
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
