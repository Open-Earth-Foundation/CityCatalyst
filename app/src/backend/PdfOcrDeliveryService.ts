import { Op } from "sequelize";
import { db } from "@/models";
import type { PdfOcrJob } from "@/models/PdfOcrJob";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import { issueClimateAdvisorUserToken } from "@/backend/chat/climate-advisor";
import {
  joinServiceUrl,
  requireServiceEnv,
} from "@/backend/climate-advisor-connection";
import { logger } from "@/services/logger";
import { getPdfOcrConfig } from "@/backend/PdfOcrConfig";

export type PdfOcrDeliverySource = {
  runId: string;
  uploadId: string;
  userId: string;
  filename: string;
  sourceLabel?: string | null;
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
  markdown: string,
  job: PdfOcrJob,
  source: PdfOcrDeliverySource,
): string {
  if (!job.resultSha256 || !job.pageCount) {
    throw new PdfOcrDeliveryError(
      "ocr_result_incomplete",
      false,
      "OCR result metadata is incomplete",
    );
  }
  const body = JSON.stringify({
    markdown,
    filename: source.filename,
    source_label: source.sourceLabel || null,
    page_count: job.pageCount,
    sha256: job.resultSha256,
  });
  if (
    Buffer.byteLength(body, "utf8") >
    getPdfOcrConfig().caMarkdownRequestMaxBytes
  ) {
    throw new PdfOcrDeliveryError(
      "ca_markdown_request_too_large",
      false,
      "Climate Advisor Markdown request exceeds the configured maximum",
    );
  }
  return body;
}

export async function deliverPdfOcrJob(
  job: PdfOcrJob,
  source: PdfOcrDeliverySource,
): Promise<void> {
  if (job.status !== "succeeded" || !job.resultS3Key) {
    throw new PdfOcrDeliveryError(
      "ocr_result_unavailable",
      false,
      "OCR result is not available for delivery",
    );
  }
  const markdown = await InventoryFileStorageService.getTextFile(
    job.resultS3Key,
  );
  const body = serializeMarkdownDeliveryPayload(markdown, job, source);
  let token: Awaited<ReturnType<typeof issueClimateAdvisorUserToken>>;
  try {
    token = await issueClimateAdvisorUserToken({ userId: source.userId });
  } catch {
    throw new PdfOcrDeliveryError(
      "ca_token_unavailable",
      true,
      "CC could not issue the Climate Advisor user token",
    );
  }
  let response: Response;
  try {
    response = await fetch(
      joinServiceUrl(
        requireServiceEnv("CA_BASE_URL"),
        `/v1/concept-notes/${source.runId}/uploads/${source.uploadId}/markdown`,
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
      `Climate Advisor rejected Markdown with status ${response.status}`,
    );
  }
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

/** Process due optional deliveries. Inventory jobs never enter this query. */
export async function processPdfOcrDeliveries(
  resolveSource: PdfOcrDeliveryResolver,
): Promise<number> {
  const jobs = await db.models.PdfOcrJob.findAll({
    where: {
      status: "succeeded",
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
    const source = await resolveSource(job);
    if (!source) {
      await recordDeliveryFailure(
        job,
        new PdfOcrDeliveryError(
          "delivery_source_unavailable",
          false,
          "Delivery source metadata is unavailable",
        ),
      );
      continue;
    }
    await job.update({ deliveryStatus: "delivering" });
    try {
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
      logger.warn({ error, sourceId: job.sourceId }, "PDF OCR delivery failed");
      await recordDeliveryFailure(job, error);
    }
  }
  return jobs.length;
}

/** Inventory-first baseline: future source types register their resolver here. */
export const resolvePdfOcrDeliverySource: PdfOcrDeliveryResolver = async () =>
  null;
