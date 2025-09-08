import { logger } from "@/services/logger";

const CCRA_API_URL = process.env.CCRA_API_URL || "http://ccra-service";

export interface RiskAssessment {
  hazard: string;
  keyimpact: string;
  risk_score: number;
  original_risk_score?: number;
  hazard_score: number;
  exposure_score: number;
  vulnerability_score: number;
  original_vulnerability_score?: number;
}

export interface CCRADashboardData {
  riskAssessment: RiskAssessment[];
  resilienceScore?: number | null;
  cityName?: string;
}

export const fetchCCRAData = async (inventoryId: string): Promise<CCRADashboardData> => {
  try {
    logger.info(`Fetching CCRA data for inventory ${inventoryId}`);
    
    // TODO: Replace with actual API call when CCRA service is ready
    // const response = await fetch(`${CCRA_API_URL}/risk-assessment/${inventoryId}`);
    // if (!response.ok) throw new Error('Failed to fetch CCRA data');
    // return response.json();
    
    // Return dummy data for now
    const dummyData: CCRADashboardData = {
      riskAssessment: [
        {
          hazard: "extreme_heat",
          keyimpact: "health",
          risk_score: 0.75,
          original_risk_score: 0.80,
          hazard_score: 0.85,
          exposure_score: 0.70,
          vulnerability_score: 0.65,
          original_vulnerability_score: 0.70
        },
        {
          hazard: "flooding",
          keyimpact: "infrastructure",
          risk_score: 0.68,
          hazard_score: 0.72,
          exposure_score: 0.68,
          vulnerability_score: 0.64
        },
        {
          hazard: "drought",
          keyimpact: "agriculture",
          risk_score: 0.62,
          hazard_score: 0.78,
          exposure_score: 0.55,
          vulnerability_score: 0.58
        },
        {
          hazard: "wildfire",
          keyimpact: "environment",
          risk_score: 0.45,
          hazard_score: 0.60,
          exposure_score: 0.40,
          vulnerability_score: 0.50
        },
        {
          hazard: "sea_level_rise",
          keyimpact: "economy",
          risk_score: 0.38,
          hazard_score: 0.55,
          exposure_score: 0.35,
          vulnerability_score: 0.42
        }
      ],
      resilienceScore: 0.72
    };
    
    logger.info(`Successfully fetched CCRA data for inventory ${inventoryId}`);
    return dummyData;
  } catch (error) {
    logger.error("Error fetching CCRA data:", { error, inventoryId });
    throw error;
  }
};

