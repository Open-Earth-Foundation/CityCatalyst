import { NextResponse } from "next/server";
import type { DsarExportResult } from "@/backend/gdpr/dsar-format";

export function dsarAttachment(
  userId: string,
  format: "json" | "csv",
  result: DsarExportResult,
): NextResponse {
  const isCsv = format === "csv";
  const body = isCsv ? result.csv : JSON.stringify(result.document, null, 2);
  const extension = isCsv ? "csv" : "json";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": isCsv
        ? "text/csv; charset=utf-8"
        : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="personal-data-${userId}.${extension}"`,
      "Cache-Control": "no-store",
    },
  });
}
