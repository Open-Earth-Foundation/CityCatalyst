import { Op } from "sequelize";

import { db } from "@/models";
import type { PdfOcrJob } from "@/models/PdfOcrJob";
import { issueClimateAdvisorUserToken } from "@/backend/chat/climate-advisor";
import {
  getConceptNoteSourceFormat,
  type ConceptNoteSourceFormat,
} from "@/backend/PdfOcrService";
import {
  joinServiceUrl,
  requireServiceEnv,
} from "@/backend/climate-advisor-connection";
import { logger } from "@/services/logger";
import { getPdfOcrConfig } from "@/backend/pdf-ocr-config";

export type PdfOcrDeliverySource = {
  runId: string;
  uploadId: string;
  userId: string;
  filename: string;
  sourceLabel?: string | null;
  sourceFormat: ConceptNoteSourceFormat;
};

export type PdfOcrDeliveryResolver = (
  job: PdfOcrJob,
) => Promise<PdfOcrDeliverySource | null>;

export class PdfOcrDeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
  }
}

export function serializeMarkdownDeliveryPayload(
  job: PdfOcrJob,
  source: PdfOcrDeliverySource,
): string {
  const jobSourceFormat = getConceptNoteSourceFormat(job);
  const sourceFormat = source.sourceFormat;
  if (
    !job.resultS3Key ||
    !job.resultSha256 ||
    sourceFormat !== jobSourceFormat ||
    (sourceFormat === "pdf" && !job.pageCount) ||
    (sourceFormat === "markdown" && job.pageCount != null)
  ) {
    throw new PdfOcrDeliveryError(
      "ocr_result_incomplete",
      false,
      "Source result metadata is incomplete",
    );
  }
  const payload = {
    markdown_s3_key: job.resultS3Key,
    filename: source.filename,
    source_label: source.sourceLabel || null,
    source_format: sourceFormat,
    page_count: sourceFormat === "pdf" ? job.pageCount : null,
    sha256: job.resultSha256,
  };
  return JSON.stringify(payload);
}

async function issueDeliveryToken(
  source: PdfOcrDeliverySource,
): Promise<Awaited<ReturnType<typeof issueClimateAdvisorUserToken>>> {
  try {
    return await issueClimateAdvisorUserToken({ userId: source.userId });
  } catch {
    throw new PdfOcrDeliveryError(
      "ca_token_unavailable",
      true,
      "CC could not issue the Climate Advisor user token",
    );
  }
}

async function postClimateAdvisorDelivery(
  source: PdfOcrDeliverySource,
  suffix: "markdown" | "failed",
  body: string,
): Promise<void> {
  const token = await issueDeliveryToken(source);
  let response: Response;
  try {
    response = await fetch(
      joinServiceUrl(
        requireServiceEnv("CA_BASE_URL"),
        `/v1/concept-notes/${source.runId}/uploads/${source.uploadId}/${suffix}`,
      ),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(getPdfOcrConfig().caDeliveryTimeoutMs),
      },
    );
  } catch {
    throw new PdfOcrDeliveryError(
      "ca_delivery_network_error",
      true,
      "Climate Advisor delivery request failed",
    );
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new PdfOcrDeliveryError(
      response.status === 409
        ? "markdown_identity_conflict"
        : retryable
          ? "ca_delivery_transient_error"
          : "ca_delivery_rejected",
      retryable,
      `Climate Advisor rejected delivery with status ${response.status}`,
    );
  }
}

export async function deliverPdfOcrJob(
  job: PdfOcrJob,
  source: PdfOcrDeliverySource,
): Promise<void> {
  if (job.status === "failed") {
    await postClimateAdvisorDelivery(
      source,
      "failed",
      JSON.stringify({ error_code: job.errorCode || "pdf_ocr_failed" }),
    );
    return;
  }
  if (job.status !== "succeeded") {
    throw new PdfOcrDeliveryError(
      "ocr_result_unavailable",
      false,
      "Source result is not available for delivery",
    );
  }
  await postClimateAdvisorDelivery(
    source,
    "markdown",
    serializeMarkdownDeliveryPayload(job, source),
  );
}

async function recordDeliveryFailure(
  job: PdfOcrJob,
  error: unknown,
): Promise<void> {
  const attempt = job.deliveryAttemptCount + 1;
  const retryable = error instanceof PdfOcrDeliveryError && error.retryable;
  const delayMs = Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 900_000);
  await job.update({
    deliveryStatus: retryable ? "pending" : "failed",
    deliveryAttemptCount: attempt,
    deliveryRunAfter: retryable ? new Date(Date.now() + delayMs) : null,
    deliveryErrorCode:
      error instanceof PdfOcrDeliveryError
        ? error.code
        : "ca_delivery_internal_error",
    deliveryErrorMessage:
      error instanceof Error ? error.message.slice(0, 500) : "Delivery failed",
  });
}

/** Process due source outcomes without repeating successful source processing. */
export async function processPdfOcrDeliveries(
  resolveSource: PdfOcrDeliveryResolver,
): Promise<number> {
  const jobs = await db.models.PdfOcrJob.findAll({
    where: {
      status: { [Op.in]: ["succeeded", "failed"] },
      deliveryTarget: "climate_advisor",
      [Op.or]: [
        { deliveryStatus: "delivering" },
        {
          deliveryStatus: "pending",
          [Op.or]: [
            { deliveryRunAfter: null },
            { deliveryRunAfter: { [Op.lte]: new Date() } },
          ],
        },
      ],
    },
    order: [["deliveryRunAfter", "ASC"]],
    limit: 2,
  });
  for (const job of jobs) {
    try {
      const source = await resolveSource(job);
      if (!source) {
        throw new PdfOcrDeliveryError(
          "delivery_source_unavailable",
          false,
          "Delivery source metadata is unavailable",
        );
      }
      await job.update({ deliveryStatus: "delivering" });
      await deliverPdfOcrJob(job, source);
      await job.update({
        deliveryStatus: "delivered",
        deliveryAttemptCount: job.deliveryAttemptCount + 1,
        deliveryRunAfter: null,
        deliveredAt: new Date(),
        deliveryErrorCode: null,
        deliveryErrorMessage: null,
      });
    } catch (error) {
      logger.warn(
        { error, sourceId: job.sourceId },
        "Concept Note artifact delivery failed",
      );
      await recordDeliveryFailure(job, error);
    }
  }
  return jobs.length;
}

export const resolvePdfOcrDeliverySource: PdfOcrDeliveryResolver = async (
  job,
) => {
  if (job.sourceType !== "concept_note_upload") return null;
  let response: Response;
  try {
    response = await fetch(
      joinServiceUrl(
        requireServiceEnv("CA_BASE_URL"),
        `/v1/concept-note-uploads/${job.sourceId}/delivery-context`,
      ),
      {
        headers: {
          "X-CC-Service-Key": requireServiceEnv("CC_SERVICE_API_KEY"),
        },
        signal: AbortSignal.timeout(getPdfOcrConfig().caDeliveryTimeoutMs),
      },
    );
  } catch {
    throw new PdfOcrDeliveryError(
      "delivery_source_network_error",
      true,
      "Climate Advisor delivery context is unavailable",
    );
  }
  if (!response.ok) {
    throw new PdfOcrDeliveryError(
      "delivery_source_unavailable",
      response.status === 429 || response.status >= 500,
      `Climate Advisor rejected delivery context with status ${response.status}`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PdfOcrDeliveryError(
      "delivery_source_invalid",
      false,
      "Climate Advisor returned invalid delivery context",
    );
  }
  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, unknown>;
  if (
    source.upload_id !== job.sourceId ||
    typeof source.run_id !== "string" ||
    typeof source.user_id !== "string" ||
    typeof source.filename !== "string" ||
    (source.source_format !== "pdf" && source.source_format !== "markdown")
  ) {
    return null;
  }
  return {
    uploadId: source.upload_id,
    runId: source.run_id,
    userId: source.user_id,
    filename: source.filename,
    sourceLabel:
      typeof source.source_label === "string" ? source.source_label : null,
    sourceFormat: source.source_format,
  };
};
