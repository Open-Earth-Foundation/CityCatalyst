import { INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES } from "./InventoryImportFileLimits";

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function getPdfOcrConfig() {
  return {
    model: process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest",
    maxSourcePdfBytes: INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
    batchSize: positiveInteger("PDF_OCR_BATCH_SIZE", 2),
    concurrency: positiveInteger("PDF_OCR_CONCURRENCY", 2),
    maxAttempts: positiveInteger("PDF_OCR_MAX_ATTEMPTS", 3),
    leaseSeconds: positiveInteger("PDF_OCR_LEASE_SECONDS", 600),
    heartbeatSeconds: positiveInteger("PDF_OCR_HEARTBEAT_SECONDS", 60),
    requestTimeoutMs: positiveInteger("MISTRAL_OCR_TIMEOUT_MS", 180_000),
    presignedUrlSeconds: positiveInteger("PDF_OCR_PRESIGNED_URL_SECONDS", 600),
    caMarkdownRequestMaxBytes: positiveInteger(
      "CA_MARKDOWN_DELIVERY_MAX_BYTES",
      20 * 1024 * 1024,
    ),
    caDeliveryTimeoutMs: positiveInteger(
      "CA_MARKDOWN_DELIVERY_TIMEOUT_MS",
      30_000,
    ),
  };
}

export const PDF_OCR_RETRY_DELAYS_MS = [60_000, 300_000] as const;

export function getPdfOcrRetryDelayMs(
  attemptCount: number,
  retryable: boolean,
  maxAttempts = 3,
): number | null {
  if (!retryable || attemptCount >= maxAttempts) return null;
  return PDF_OCR_RETRY_DELAYS_MS[
    Math.min(attemptCount - 1, PDF_OCR_RETRY_DELAYS_MS.length - 1)
  ];
}
