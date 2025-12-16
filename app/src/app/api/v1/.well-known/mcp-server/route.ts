/**
 * @swagger
 * /api/v1/.well-known/mcp-server:
 *   get:
 *     tags:
 *       - mcp
 *     operationId: getMcpServerDiscovery
 *     summary: MCP Server Discovery Endpoint
 *     description: |
 *       Provides discovery information for the MCP server endpoint.
 *       Used by MCP clients to automatically locate the server endpoint.
 *     responses:
 *       200:
 *         description: MCP server discovery information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mcp_endpoint:
 *                   type: string
 *                   description: The MCP server endpoint URL
 *                 protocol_version:
 *                   type: string
 *                   description: Supported MCP protocol version
 *                 authentication:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     oauth_discovery_url:
 *                       type: string
 */
import { NextResponse } from "next/server";
import { logger } from "@/services/logger";

export const GET = async (req: Request) => {
  const url = new URL(req.url);
  const origin = process.env.HOST || url.origin;
  
  logger.debug({ origin }, "MCP server discovery requested");

  return NextResponse.json({
    mcp_endpoint: `${origin}/api/v1/mcp`,
    protocol_version: "2024-11-05",
    server_info: {
      name: "citycatalyst-mcp-server",
      version: "1.0.0",
      description: "CityCatalyst climate data MCP server",
    },
    authentication: {
      type: "oauth2",
      oauth_discovery_url: `${origin}/.well-known/oauth-authorization-server`,
      required: true,
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
    },
  });
};