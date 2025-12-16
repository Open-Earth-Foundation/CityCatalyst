import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { AppSession } from "@/lib/auth";
import { logger } from "@/services/logger";
import { InventoryService } from "@/backend/InventoryService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { getEmissionResults, getTotalEmissionsBySectorAndSubsector } from "@/backend/ResultsService";

export const getInventoryEmissionsTool: Tool = {
  name: "get_inventory_emissions",
  description: "Retrieve detailed emissions data for a specific inventory with breakdowns by sector, scope, and gas type",
  inputSchema: {
    type: "object",
    properties: {
      inventoryId: {
        type: "string",
        description: "The inventory ID to fetch emissions for",
      },
      bySector: {
        type: "boolean",
        description: "Include emissions breakdown by sector (default: true)",
      },
      byScope: {
        type: "boolean",
        description: "Include emissions breakdown by scope (Scope 1, 2, 3) (default: false)",
      },
      bySubsector: {
        type: "boolean",
        description: "Include detailed subsector breakdown (default: false)",
      },
    },
    required: ["inventoryId"],
  },
};

export async function execute(
  params: {
    inventoryId: string;
    bySector?: boolean;
    byScope?: boolean;
    bySubsector?: boolean;
  },
  session: AppSession
): Promise<any> {
  try {
    const { 
      inventoryId, 
      bySector = true, 
      byScope = false, 
      bySubsector = false 
    } = params;
    
    logger.debug({ inventoryId, userId: session.user.id }, "MCP: Fetching inventory emissions");

    // Check access permission using existing service
    await PermissionService.canAccessInventory(session, inventoryId);

    // Get inventory with total emissions using existing service
    const inventory = await InventoryService.getInventoryWithTotalEmissions(
      inventoryId,
      session
    );

    // Use existing ResultsService to get emissions data
    const emissionsData = await getEmissionResults(inventoryId);

    const result: any = {
      inventoryId: inventory.inventoryId,
      inventoryName: inventory.inventoryName,
      year: inventory.year,
      totalEmissions: emissionsData.totalEmissions?.toString() || inventory.totalEmissions,
      city: {
        id: inventory.city?.cityId,
        name: inventory.city?.name,
        country: inventory.city?.country,
        region: inventory.city?.region,
      },
      project: {
        id: inventory.city?.project?.projectId,
        name: inventory.city?.project?.name,
      },
      organization: {
        id: inventory.city?.project?.organization?.organizationId,
        name: inventory.city?.project?.organization?.name,
      },
    };

    // Add sector breakdown if requested
    if (bySector && emissionsData.totalEmissionsBySector) {
      result.bySector = emissionsData.totalEmissionsBySector.map((sector: any) => ({
        sectorName: sector.sectorName,
        emissions: sector.co2eq?.toString() || "0",
        percentage: sector.percentage || 0,
      }));
    }

    // Add subsector breakdown if requested  
    if (bySubsector) {
      const subsectorData = await getTotalEmissionsBySectorAndSubsector(inventoryId);
      result.bySubsector = subsectorData.map((item: any) => ({
        subsectorName: item.subsector_name,
        sectorName: item.sector_name,
        emissions: item.co2eq?.toString() || "0",
        percentage: emissionsData.totalEmissions 
          ? ((parseFloat(item.co2eq) / parseFloat(emissionsData.totalEmissions.toString())) * 100).toFixed(2)
          : 0,
      }));
    }

    // Add top emissions by subsector
    if (emissionsData.topEmissionsBySubSector) {
      result.topEmissions = emissionsData.topEmissionsBySubSector.slice(0, 10).map((item: any) => ({
        sectorName: item.sectorName,
        subsectorName: item.subsectorName, 
        scopeName: item.scopeName,
        emissions: item.co2eq?.toString() || "0",
        percentage: item.percentage || 0,
      }));
    }

    // Add summary statistics
    result.statistics = {
      sectorsWithData: emissionsData.totalEmissionsBySector?.filter((s: any) => s.co2eq > 0).length || 0,
      totalSectors: emissionsData.totalEmissionsBySector?.length || 0,
    };

    logger.info(
      { inventoryId, userId: session.user.id, totalEmissions: inventory.totalEmissions },
      "MCP: Successfully fetched inventory emissions"
    );

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    logger.error({ error, inventoryId: params.inventoryId }, "MCP: Error fetching inventory emissions");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch emissions data",
      data: null,
    };
  }
}