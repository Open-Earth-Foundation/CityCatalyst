import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { AppSession } from "@/lib/auth";

export const getClimateRiskAssessmentTool: Tool = {
  name: "get_climate_risk_assessment",
  description: "Get climate risk assessment (NOT YET IMPLEMENTED)",
  inputSchema: {
    type: "object",
    properties: {
      cityId: {
        type: "string",
        description: "The city ID",
      },
    },
    required: ["cityId"],
  },
};

export async function execute(
  params: any,
  session: AppSession
): Promise<any> {
  return {
    success: false,
    error: "Tool not yet implemented",
    data: null,
  };
}