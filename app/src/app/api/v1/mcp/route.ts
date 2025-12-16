/**
 * @swagger
 * /api/v1/mcp:
 *   post:
 *     tags:
 *       - mcp
 *     operationId: mcpRequest
 *     summary: Handle MCP (Model Context Protocol) requests
 *     description: |
 *       Processes Model Context Protocol requests for AI/LLM integrations.
 *       Supports OAuth 2.0 bearer tokens or session authentication.
 *       Available methods include initialize, tools/list, and tools/call.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jsonrpc, method]
 *             properties:
 *               jsonrpc:
 *                 type: string
 *                 enum: ["2.0"]
 *               method:
 *                 type: string
 *                 enum: ["initialize", "initialized", "tools/list", "tools/call", "ping"]
 *               params:
 *                 type: object
 *               id:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                   - type: "null"
 *     responses:
 *       200:
 *         description: MCP response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jsonrpc:
 *                   type: string
 *                 result:
 *                   type: object
 *                 error:
 *                   type: object
 *                 id:
 *                   oneOf:
 *                     - type: string
 *                     - type: number
 *                     - type: "null"
 *       401:
 *         description: Authentication required for tool calls
 *       500:
 *         description: Internal server error
 */
import { apiHandler } from "@/util/api";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/services/logger";
import { 
  McpError, 
  ErrorCode,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { AppSession } from "@/lib/auth";

// Import tool implementations
import * as inventoriesTools from "@/lib/mcp/tools/inventories";
import * as emissionsTools from "@/lib/mcp/tools/emissions";
import * as forecastTools from "@/lib/mcp/tools/forecast";
import * as citiesTools from "@/lib/mcp/tools/cities";
import * as cityProfileTools from "@/lib/mcp/tools/city-profile";
import * as actionPlansTools from "@/lib/mcp/tools/action-plans";
import * as riskAssessmentTools from "@/lib/mcp/tools/risk-assessment";

// Tool registry
const toolRegistry = new Map<string, { definition: Tool; handler: any }>();

// Register all tools
function registerTools() {
  // Inventory tools
  toolRegistry.set("get_user_inventories", {
    definition: inventoriesTools.getUserInventoriesTool,
    handler: inventoriesTools,
  });
  
  toolRegistry.set("get_inventory_emissions", {
    definition: emissionsTools.getInventoryEmissionsTool,
    handler: emissionsTools,
  });
  
  toolRegistry.set("get_emissions_forecast", {
    definition: forecastTools.getEmissionsForecastTool,
    handler: forecastTools,
  });
  
  // City tools
  toolRegistry.set("get_user_cities", {
    definition: citiesTools.getUserCitiesTool,
    handler: citiesTools,
  });
  
  toolRegistry.set("get_city_profile", {
    definition: cityProfileTools.getCityProfileTool,
    handler: cityProfileTools,
  });
  
  // Strategy tools
  toolRegistry.set("get_climate_action_plans", {
    definition: actionPlansTools.getClimateActionPlansTool,
    handler: actionPlansTools,
  });
  
  toolRegistry.set("get_climate_risk_assessment", {
    definition: riskAssessmentTools.getClimateRiskAssessmentTool,
    handler: riskAssessmentTools,
  });
}

// Initialize tools on module load
registerTools();

export const POST = async (req: NextRequest) => {
  const hasAuthHeader = !!req.headers.get("Authorization");
  
  // Check if this is an unauthenticated request
  if (!hasAuthHeader) {
    const url = new URL(req.url);
    const origin = process.env.HOST || url.origin;
    
    logger.debug("MCP request without authentication - returning 401 with WWW-Authenticate header");
    
    return new NextResponse(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: ErrorCode.InvalidRequest,
        message: "Authentication required. This MCP server requires OAuth 2.0 authentication.",
      },
      id: null,
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="CityCatalyst MCP Server", resource_metadata="${origin}/.well-known/oauth-authorization-server"`,
      },
    });
  }

  // If we have auth header, delegate to apiHandler for normal processing
  return apiHandler(async (req: NextRequest, { session }) => {
    const body = await req.json();
    
    logger.debug({ 
      method: body.method, 
      hasSession: !!session,
      hasAuthHeader: true,
      userId: session?.user?.id 
    }, "Processing authenticated MCP request");

    // Validate JSON-RPC format
    if (!body.jsonrpc || body.jsonrpc !== "2.0") {
      return NextResponse.json({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.InvalidRequest,
          message: "Invalid JSON-RPC version",
        },
        id: body.id ?? null,
      });
    }

    try {
      switch (body.method) {
        case "initialize":
          return handleInitialize(body);
        
        case "initialized":
          return NextResponse.json({
            jsonrpc: "2.0",
            result: {},
            id: body.id,
          });
        
        case "tools/list":
          return handleListTools(body);
        
        case "tools/call":
          // Tool calls require authentication
          if (!session) {
            return NextResponse.json({
              jsonrpc: "2.0",
              error: {
                code: ErrorCode.InvalidRequest,
                message: "Authentication required for tool calls. Invalid or expired token.",
              },
              id: body.id,
            });
          }
          return await handleCallTool(body, session);
        
        case "ping":
          return NextResponse.json({
            jsonrpc: "2.0",
            result: {},
            id: body.id,
          });
        
        default:
          return NextResponse.json({
            jsonrpc: "2.0",
            error: {
              code: ErrorCode.MethodNotFound,
              message: `Method not found: ${body.method}`,
            },
            id: body.id,
          });
      }
    } catch (error) {
      logger.error({ error, method: body.method }, "Error processing MCP request");
      
      return NextResponse.json({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.InternalError,
          message: error instanceof Error ? error.message : "Internal server error",
        },
        id: body.id,
      });
    }
  })(req, { params: Promise.resolve({}) });
};

function handleInitialize(request: any) {
  const { protocolVersion, capabilities, clientInfo } = request.params || {};
  
  logger.info({ clientInfo, protocolVersion }, "MCP client initializing");

  return NextResponse.json({
    jsonrpc: "2.0",
    result: {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "citycatalyst-mcp-server",
        version: "1.0.0",
        instructions: "This server requires OAuth 2.0 authentication. Please ensure your client is configured with OAuth credentials and is sending the Authorization header with bearer tokens.",
      },
    },
    id: request.id,
  });
}

function handleListTools(request: any) {
  const tools = Array.from(toolRegistry.values()).map(t => t.definition);
  
  logger.debug({ toolCount: tools.length }, "Listing MCP tools");

  return NextResponse.json({
    jsonrpc: "2.0",
    result: {
      tools,
    },
    id: request.id,
  });
}

async function handleCallTool(request: any, session: AppSession) {
  const { name, arguments: args } = request.params || {};
  
  if (!name) {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: {
        code: ErrorCode.InvalidParams,
        message: "Tool name is required",
      },
      id: request.id,
    });
  }

  const tool = toolRegistry.get(name);
  if (!tool) {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: {
        code: ErrorCode.MethodNotFound,
        message: `Tool not found: ${name}`,
      },
      id: request.id,
    });
  }

  try {
    logger.info({ 
      tool: name, 
      userId: session.user.id,
      hasArgs: !!args 
    }, "Executing MCP tool");

    // Execute the tool with the session
    const result = await tool.handler.execute(args || {}, session);

    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      },
      id: request.id,
    });
  } catch (error) {
    logger.error({ error, tool: name }, "Tool execution failed");
    
    // Map error to appropriate MCP error code
    let errorCode = ErrorCode.InternalError;
    let errorMessage = "Tool execution failed";
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      if (error.message.includes("Unauthorized") || error.message.includes("Authentication")) {
        errorCode = ErrorCode.InvalidRequest;
      } else if (error.message.includes("not found") || error.message.includes("Not found")) {
        errorCode = ErrorCode.InvalidParams;
      }
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        content: [
          {
            type: "text",
            text: errorMessage,
          },
        ],
        isError: true,
      },
      id: request.id,
    });
  }
}

// Also expose a GET endpoint for capability discovery
export const GET = apiHandler(async (_req: NextRequest, { session }) => {
  return NextResponse.json({
    name: "CityCatalyst MCP Server",
    version: "1.0.0",
    description: "Model Context Protocol server for CityCatalyst climate data",
    authenticated: !!session,
    capabilities: {
      tools: {
        count: toolRegistry.size,
        available: Array.from(toolRegistry.keys()),
      },
      authentication: {
        oauth2: true,
        session: true,
      },
    },
  });
});