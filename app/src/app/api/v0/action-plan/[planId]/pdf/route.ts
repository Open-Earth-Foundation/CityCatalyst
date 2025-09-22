import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import PDFService, { ActionPlanData } from "@/backend/PDFService";
import createHttpError from "http-errors";

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  try {
    const body = await req.json();
    const { planData, cityName, actionTitle, lng = "en" } = body;

    if (!planData || !cityName || !actionTitle) {
      throw createHttpError.BadRequest(
        "Missing required fields: planData, cityName, or actionTitle",
      );
    }

    // Validate planData has basic structure
    if (!planData.metadata && !planData.content) {
      throw createHttpError.BadRequest(
        "Invalid planData structure: must have metadata or content",
      );
    }

    // Generate PDF
    const pdfBuffer = await PDFService.generateActionPlanPDF(
      planData as ActionPlanData,
      cityName,
      actionTitle,
      lng,
    );

    // Return PDF as response
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="action-plan-${actionTitle.replace(/[^a-zA-Z0-9]/g, "-")}.pdf"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("PDF generation error:", error);

    if (error.statusCode) {
      throw error;
    }

    throw createHttpError.InternalServerError("Failed to generate PDF");
  }
});
