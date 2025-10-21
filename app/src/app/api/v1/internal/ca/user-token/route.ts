/**
 * @swagger
 * /api/v1/internal/ca/user-token:
 *   post:
 *     tags:
 *       - Internal
 *     summary: Issue user-scoped token for Climate Advisor service
 *     description: Internal endpoint for CA service to get user-scoped tokens. CA authenticates with service API key, gets token with full user permissions.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: User ID for token scoping
 *               inventory_id:
 *                 type: string
 *                 description: Optional inventory ID for context
 *     responses:
 *       200:
 *         description: User token issued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                   description: JWT access token
 *                 expires_in:
 *                   type: integer
 *                   description: Token expiry in seconds
 *                 token_type:
 *                   type: string
 *                   description: Token type (Bearer)
 *       401:
 *         description: Unauthorized service
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/models";
import { logger } from "@/services/logger";

export async function POST(req: NextRequest) {
  try {
    // Verify CA service authentication
    const serviceKey = req.headers.get("X-CA-Service-Key");
    if (!serviceKey || serviceKey !== process.env.CA_SERVICE_API_KEY) {
      logger.warn(
        {
          provided_key: serviceKey ? "present" : "missing",
          source_ip: req.headers.get("x-forwarded-for") || "unknown",
        },
        "Unauthorized CA service token request",
      );
      return NextResponse.json(
        { error: "Unauthorized service" },
        { status: 401 },
      );
    }

    const { user_id, inventory_id } = await req.json();

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    // Initialize database if needed
    if (!db.initialized) {
      await db.initialize();
    }

    // Verify user exists
    const user = await db.models.User.findByPk(user_id);
    if (!user) {
      logger.warn({ user_id }, "Token requested for non-existent user");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify required JWT configuration
    if (!process.env.VERIFICATION_TOKEN_SECRET) {
      logger.error("VERIFICATION_TOKEN_SECRET not configured");
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 500 },
      );
    }

    // Issue token representing the user (user-scoped, not inventory-scoped)
    const userToken = jwt.sign(
      {
        sub: user_id,
        role: user.role,
        issued_by: "climate-advisor-service",
        // inventory_id is context, not permission scope - passed separately
      },
      process.env.VERIFICATION_TOKEN_SECRET,
      {
        expiresIn: "1h",
        issuer: "climate-advisor-service",
        audience: process.env.HOST || "citycatalyst",
      },
    );

    logger.info(
      {
        user_id,
        inventory_id,
        user_role: user.role,
        service: "climate-advisor",
        token_length: userToken.length,
      },
      "Issued user token for CA service",
    );

    return NextResponse.json({
      access_token: userToken,
      expires_in: 3600,
      token_type: "Bearer",
    });
  } catch (error: any) {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      "Failed to issue CA user token",
    );

    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
