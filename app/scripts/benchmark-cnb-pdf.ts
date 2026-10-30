/**
 * Convert one pinned local PDF through the production CNB OCR path.
 *
 * Inputs: --pdf (local file), --expected-sha256 (pinned lowercase digest),
 * --output-dir (new directory), --timeout-ms (OCR/upload timeout, default 180000).
 * Environment: MISTRAL_API_KEY; AWS_FILE_UPLOAD_S3_BUCKET_ID; AWS_FILE_UPLOAD_REGION
 * (default us-east-1); standard AWS SDK credentials; optional MISTRAL_OCR_MODEL.
 * The environment must already be loaded; this script does not read .env files.
 *
 * Outputs: conversion.json with status/provenance, source.md, structured.json.
 * A random temporary S3 PDF is deleted in finally, including failed uploads.
 * No database rows, application upload requests, or OCR jobs are created.
 * Cost is unavailable: the production converter does not return billing data.
 *
 * Usage from repository root:
 * cd app
 * npx tsx scripts/benchmark-cnb-pdf.ts --pdf ../fixture.pdf \
 *   --expected-sha256 <64-hex-digest> --output-dir ../output/pdf-conversion
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import {
  buildMistralOcrRequest,
  convertPdfUrlToMarkdown,
  MistralOcrError,
} from "@/backend/MistralOcrService";
import { getPdfOcrConfig } from "@/backend/pdf-ocr-config";
import { STRUCTURED_DOCUMENT_SCHEMA_VERSION } from "@/backend/StructuredDocumentArtifact";
import { logger } from "@/services/logger";

const SCHEMA_VERSION = "citycatalyst.cnb-pdf-benchmark.1";
const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sha256 = (content: string | Buffer): string =>
  createHash("sha256").update(content).digest("hex");

type ConversionOptions = {
  pdf: string;
  expectedSha256: string;
  outputDir: string;
  timeoutMs: number;
};

type FileArtifact = { path: string; sha256: string; bytes: number };

export type ConversionReport = {
  schema_version: string;
  status: "running" | "completed" | "failed";
  source_pdf_sha256: string;
  source_pdf_bytes: number | null;
  annotation_mode: "visual_context";
  requested_model: string;
  returned_model: string | null;
  request_settings: Record<string, unknown>;
  request_sha256: string;
  structured_schema_version: string;
  timeout_ms: number;
  page_count: number | null;
  markdown: FileArtifact | null;
  structured: FileArtifact | null;
  elapsed_seconds: number;
  cost: { status: "unavailable"; usd: null };
  code: { git_sha: string | null; files_sha256: Record<string, string> };
  temporary_object_key: string | null;
  cleanup: "not_needed" | "pending" | "completed" | "failed";
  error: { code: string } | null;
};

/** Hash the converter, assembly, configuration and runner used for this call. */
async function codeProvenance(): Promise<ConversionReport["code"]> {
  let gitSha: string | null = null;
  try {
    gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: APP_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Source hashes still identify a checkout distributed without Git metadata.
  }
  const files = [
    "scripts/benchmark-cnb-pdf.ts",
    "src/backend/MistralOcrService.ts",
    "src/backend/StructuredDocumentArtifact.ts",
    "src/backend/MistralVisualAnnotation.ts",
    "src/backend/InventoryFileStorageService.ts",
    "src/backend/pdf-ocr-config.ts",
    "src/backend/inventory-import-file-limits.ts",
  ];
  const hashes: Record<string, string> = {};
  for (const file of files)
    hashes[file] = sha256(await readFile(path.join(APP_ROOT, file)));
  return { git_sha: gitSha, files_sha256: hashes };
}

/** Preserve a content-free diagnostic even when provider/storage errors contain URLs. */
function failureCode(error: unknown): string {
  if (error instanceof MistralOcrError) return error.code;
  return "conversion_failed";
}

/** Convert a validated PDF once; return status only after temporary-object cleanup. */
export async function runPdfConversion(
  options: ConversionOptions,
): Promise<ConversionReport> {
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > 3_600_000
  ) {
    throw new Error("timeout-ms must be between 1 and 3600000");
  }
  if (!/^[a-f0-9]{64}$/.test(options.expectedSha256)) {
    throw new Error("expected-sha256 must be a lowercase SHA-256 digest");
  }
  const outputDir = path.resolve(options.outputDir);
  await mkdir(path.dirname(outputDir), { recursive: true });
  await mkdir(outputDir); // Never overwrite an earlier conversion or its evidence.
  const started = performance.now();
  const config = getPdfOcrConfig();
  const request = buildMistralOcrRequest("", config.model, "visual_context");
  delete request.document; // Signed URLs never belong in persisted provenance.
  const report: ConversionReport = {
    schema_version: SCHEMA_VERSION,
    status: "running",
    source_pdf_sha256: options.expectedSha256,
    source_pdf_bytes: null,
    annotation_mode: "visual_context",
    requested_model: config.model,
    returned_model: null,
    request_settings: request,
    request_sha256: sha256(JSON.stringify(request)),
    structured_schema_version: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
    timeout_ms: options.timeoutMs,
    page_count: null,
    markdown: null,
    structured: null,
    elapsed_seconds: 0,
    cost: { status: "unavailable", usd: null },
    code: { git_sha: null, files_sha256: {} },
    temporary_object_key: null,
    cleanup: "not_needed",
    error: null,
  };
  const saveReport = async (): Promise<void> => {
    report.elapsed_seconds = (performance.now() - started) / 1000;
    await writeFile(
      path.join(outputDir, "conversion.json.tmp"),
      JSON.stringify(report, null, 2),
      "utf8",
    );
    await rename(
      path.join(outputDir, "conversion.json.tmp"),
      path.join(outputDir, "conversion.json"),
    );
  };
  await saveReport();
  const previousTimeout = process.env.MISTRAL_OCR_TIMEOUT_MS;
  const objectKey = `benchmark/cnb/temporary/${randomUUID()}/source.pdf`;
  let stagingAttempted = false;
  try {
    report.code = await codeProvenance();
    const pdf = await readFile(path.resolve(options.pdf));
    report.source_pdf_bytes = pdf.byteLength;
    if (sha256(pdf) !== options.expectedSha256) {
      throw new MistralOcrError(
        "pdf_digest_mismatch",
        false,
        "Pinned PDF digest mismatch",
      );
    }
    if (
      pdf.byteLength > config.maxSourcePdfBytes ||
      pdf.subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
      throw new MistralOcrError(
        "invalid_pdf_source",
        false,
        "PDF signature or size is invalid",
      );
    }
    if (
      !process.env.MISTRAL_API_KEY ||
      !process.env.AWS_FILE_UPLOAD_S3_BUCKET_ID
    ) {
      throw new MistralOcrError(
        "conversion_not_configured",
        false,
        "Provider and staging configuration is required",
      );
    }

    // Delete even after a rejected upload: the server may have accepted its bytes.
    stagingAttempted = true;
    report.temporary_object_key = objectKey;
    report.cleanup = "pending";
    await saveReport();
    await InventoryFileStorageService.putFile(
      objectKey,
      pdf,
      "application/pdf",
      AbortSignal.timeout(options.timeoutMs),
    );
    const documentUrl =
      await InventoryFileStorageService.createSignedDownloadUrl(
        objectKey,
        Math.max(
          config.presignedUrlSeconds,
          Math.ceil(options.timeoutMs / 1000) + 60,
        ),
      );
    process.env.MISTRAL_OCR_TIMEOUT_MS = String(options.timeoutMs);
    const result = await convertPdfUrlToMarkdown(documentUrl, "visual_context");
    const redact = (text: string): string =>
      text
        .replaceAll(documentUrl, "[redacted]")
        .replaceAll(process.env.MISTRAL_API_KEY!, "[redacted]");
    const markdown = redact(result.markdown);
    const serialized = JSON.stringify(result.structured, (key, value) => {
      if (
        /^(authorization|api_key|access_token|secret|document_url)$/i.test(key)
      )
        return "[redacted]";
      if (typeof value !== "string") return value;
      return redact(value);
    });
    if (
      Buffer.byteLength(serialized, "utf8") > config.maxStructuredArtifactBytes
    ) {
      throw new MistralOcrError(
        "structured_artifact_too_large",
        false,
        "Structured artifact exceeds production limit",
      );
    }
    await writeFile(path.join(outputDir, "source.md"), markdown, "utf8");
    await writeFile(
      path.join(outputDir, "structured.json"),
      serialized,
      "utf8",
    );
    report.markdown = {
      path: "source.md",
      sha256: sha256(markdown),
      bytes: Buffer.byteLength(markdown, "utf8"),
    };
    report.structured = {
      path: "structured.json",
      sha256: sha256(serialized),
      bytes: Buffer.byteLength(serialized, "utf8"),
    };
    report.page_count = result.pageCount;
    const returnedModel = result.structured.provider.returned_model;
    report.returned_model =
      returnedModel === null ? null : redact(returnedModel);
    report.status = "completed";
  } catch (error) {
    report.status = "failed";
    report.error = { code: failureCode(error) };
  } finally {
    if (previousTimeout === undefined)
      delete process.env.MISTRAL_OCR_TIMEOUT_MS;
    else process.env.MISTRAL_OCR_TIMEOUT_MS = previousTimeout;
    if (stagingAttempted) {
      try {
        await InventoryFileStorageService.deleteFile(
          objectKey,
          AbortSignal.timeout(30_000),
        );
        report.cleanup = "completed";
      } catch {
        report.cleanup = "failed";
        report.status = "failed";
        report.error ??= { code: "temporary_object_cleanup_failed" };
      }
    }
    await saveReport();
  }
  return report;
}

/** Parse explicit local inputs; diagnostics never include provider exception messages. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      pdf: { type: "string" },
      "expected-sha256": { type: "string" },
      "output-dir": { type: "string" },
      "timeout-ms": { type: "string", default: "180000" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "Usage: npx tsx scripts/benchmark-cnb-pdf.ts --pdf <local.pdf> --expected-sha256 <digest> --output-dir <new-directory> [--timeout-ms 180000]",
    );
    return;
  }
  if (!values.pdf || !values["expected-sha256"] || !values["output-dir"]) {
    throw new Error("Required: --pdf, --expected-sha256, --output-dir");
  }
  const report = await runPdfConversion({
    pdf: values.pdf,
    expectedSha256: values["expected-sha256"],
    outputDir: values["output-dir"],
    timeoutMs: Number(values["timeout-ms"]),
  });
  logger.info(
    {
      status: report.status,
      code: report.error?.code,
      cleanup: report.cleanup,
    },
    "CNB PDF conversion finished",
  );
  if (report.status !== "completed") process.exitCode = 1;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch(() => {
    logger.error(
      "CNB PDF conversion failed; check arguments, output directory, and conversion.json",
    );
    process.exitCode = 1;
  });
}
