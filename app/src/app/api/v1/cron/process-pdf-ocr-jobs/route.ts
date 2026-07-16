import { NextRequest, NextResponse } from "next/server";
import { db } from "@/models";
import { processPdfOcrJobs } from "@/backend/PdfOcrService";
import { logger } from "@/services/logger";
import {
  processPdfOcrDeliveries,
  resolvePdfOcrDeliverySource,
} from "@/backend/PdfOcrDeliveryService";

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!token || token !== process.env.CC_CRON_JOB_API_KEY) {
    return NextResponse.json(
      { error: { message: "Unauthorized" } },
      { status: 401 },
    );
  }

  try {
    if (!db.initialized) await db.initialize();
    const ocr = await processPdfOcrJobs();
    const deliveries = await processPdfOcrDeliveries(
      resolvePdfOcrDeliverySource,
    );
    return NextResponse.json({ ...ocr, deliveries });
  } catch (error) {
    logger.error({ error }, "PDF OCR cron processor failed");
    return NextResponse.json(
      { error: { message: "PDF OCR processor failed" } },
      { status: 500 },
    );
  }
}
