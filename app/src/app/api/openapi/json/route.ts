/**
 * @swagger
 * /api/openapi/json:
 *   get:
 *     tags:
 *       - Documentation
 *     summary: Get OpenAPI specification in JSON format
 *     description: Returns the complete OpenAPI specification for the CityCatalyst API in JSON format.
 *     responses:
 *       200:
 *         description: OpenAPI specification returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: OpenAPI 3.0 specification
 *       500:
 *         description: Failed to generate OpenAPI specification.
 */
import { getApiDocs } from "@/lib/swagger";
import { NextResponse } from "next/server";
import { apiHandler } from "@/util/api";

export const GET = apiHandler(async (_req, { params, session }) => {
  try {
    const spec = await getApiDocs();
    
    return NextResponse.json(spec, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error generating OpenAPI spec:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate OpenAPI specification',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
});