import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "@/services/logger";
import { AppSession } from "@/lib/auth";

// Import tool implementations
import { getUserInventoriesTool } from "./tools/inventories";
import { getInventoryEmissionsTool } from "./tools/emissions";
import { getUserCitiesTool } from "./tools/cities";
import { getCityProfileTool } from "./tools/city-profile";
import { getClimateActionPlansTool } from "./tools/action-plans";
import { getClimateRiskAssessmentTool } from "./tools/risk-assessment";

export class CityCatalystMCPServer {
  private server: Server;
  private session: AppSession | null = null;
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: "citycatalyst-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.registerTools();
  }

  setSession(session: AppSession | null) {
    this.session = session;
  }

  private registerTools() {
    // Inventory Tools
    this.tools.set("get_user_inventories", getUserInventoriesTool);
    this.tools.set("get_inventory_emissions", getInventoryEmissionsTool);

    // City Context Tools
    this.tools.set("get_user_cities", getUserCitiesTool);
    this.tools.set("get_city_profile", getCityProfileTool);

    // Strategy Tools
    this.tools.set("get_climate_action_plans", getClimateActionPlansTool);
    this.tools.set("get_climate_risk_assessment", getClimateRiskAssessmentTool);

    logger.info(
      { toolCount: this.tools.size },
      "MCP tools registered successfully"
    );
  }

  private setupHandlers() {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug("Listing available MCP tools");
      
      const tools = Array.from(this.tools.values());
      
      return {
        tools,
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info(
        { tool: name, userId: this.session?.user?.id },
        "Executing MCP tool"
      );

      if (!this.session) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          "Authentication required to use tools"
        );
      }

      const tool = this.tools.get(name);
      if (!tool) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Tool not found: ${name}`
        );
      }

      try {
        // Import and execute the tool handler dynamically
        const toolModule = await this.getToolHandler(name);
        const result = await toolModule.execute(args || {}, this.session);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, tool: name }, "Error executing MCP tool");
        
        if (error instanceof Error) {
          throw new McpError(
            ErrorCode.InternalError,
            error.message
          );
        }
        throw new McpError(
          ErrorCode.InternalError,
          "Tool execution failed"
        );
      }
    });

    // Handle errors
    this.server.onerror = (error) => {
      logger.error({ error }, "MCP Server error");
    };
  }

  private async getToolHandler(toolName: string) {
    // Map tool names to their handler modules
    const handlers: Record<string, () => Promise<any>> = {
      get_user_inventories: () => import("./tools/inventories"),
      get_inventory_emissions: () => import("./tools/emissions"),
      get_user_cities: () => import("./tools/cities"),
      get_city_profile: () => import("./tools/city-profile"),
      get_climate_action_plans: () => import("./tools/action-plans"),
      get_climate_risk_assessment: () => import("./tools/risk-assessment"),
    };

    const handler = handlers[toolName];
    if (!handler) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `No handler for tool: ${toolName}`
      );
    }

    return handler();
  }

  async connect(transport?: StdioServerTransport) {
    const t = transport || new StdioServerTransport();
    await this.server.connect(t);
    logger.info("MCP Server connected");
  }

  async close() {
    await this.server.close();
    logger.info("MCP Server closed");
  }

  getServer() {
    return this.server;
  }
}

// Create singleton instance for HTTP endpoint use
export const mcpServer = new CityCatalystMCPServer();