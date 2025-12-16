/**
 * @swagger
 * /.well-known/oauth-protected-resource:
 *   get:
 *     tags:
 *       - oauth
 *     operationId: getOauthProtectedResource
 *     summary: OAuth Protected Resource Discovery (RFC 8414)
 *     description: |
 *       Advertises OAuth 2.0 protected resources and their endpoints.
 *       This is part of the MCP server discovery standard.
 *     responses:
 *       200:
 *         description: Protected resource metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resource:
 *                   type: string
 *                   description: The base URI of the protected resource
 *                 authorization_servers:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Array of authorization server issuer identifiers
 *                 scopes_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: OAuth scopes supported by this resource server
 *                 bearer_methods_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Bearer token usage methods supported
 *                 resource_documentation:
 *                   type: string
 *                   description: URL pointing to documentation about the resource
 */
import { NextResponse } from "next/server";
import { logger } from "@/services/logger";

export const GET = async (req: Request) => {
  const url = new URL(req.url);
  const origin = process.env.HOST || url.origin;
  
  logger.debug({ origin }, "OAuth protected resource discovery requested");

  return NextResponse.json({
    resource: origin,
    authorization_servers: [origin],
    scopes_supported: ["read", "write"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/Open-Earth-Foundation/CityCatalyst/wiki/CityCatalyst-Backend-API",
    // MCP-specific metadata (following emerging standards)
    mcp: {
      protocol_version: "2024-11-05",
      endpoint: `${origin}/api/v1/mcp`,
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
      },
      server_info: {
        name: "citycatalyst-mcp-server",
        version: "1.0.0",
        description: "CityCatalyst climate data MCP server",
      },
    },
  });
};