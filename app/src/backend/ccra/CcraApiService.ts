// backend/ccra/CcraApiService.ts
import { logger } from "@/services/logger";
import { CCRATopRisksData, Indicator, RiskAssessment } from "@/util/types";

const CCRA_API_URL =
  (process.env.GLOBAL_API_URL || "http://ccra-service") + "/api/v0";

class CCRAApiService {
  /**
   * Fetch risk assessment data for current scenario
   */
 public static  async getRiskAssessment(actorId: string): Promise<RiskAssessment[]> {
    try {
      const response = await fetch(
        `${CCRA_API_URL}/ccra/risk_assessment/city/${actorId}/current`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch risk assessment: ${response.statusText}`,
        );
      }

      const data = await response.json();
      return Array.isArray(data) ? data : data.riskAssessment || [];
    } catch (error) {
      logger.error("Error fetching risk assessment:", { error, actorId });
      throw error;
    }
  }

  /**
   * Fetch indicator details for vulnerability calculations
   */
public static  async getIndicatorDetails(actorId: string): Promise<Indicator[]> {
    try {
      const response = await fetch(
        `${CCRA_API_URL}/ccra/impactchain_indicators/city/${actorId}/current`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch indicators: ${response.statusText}`);
      }

      const data = await response.json();
      return Array.isArray(data) ? data : data.indicators || [];
    } catch (error) {
      logger.error("Error fetching indicators:", { error, actorId });
      throw error;
    }
  }

  /**
   * Fetch CCRA data for top risks display
   */
  public static async fetchCCRATopRisksData(actorId: string): Promise<CCRATopRisksData> {
    try {
      logger.info(`Fetching CCRA top risks data for actor ${actorId}`);

      // Fetch risk assessment and indicators in parallel
      const [riskAssessment, indicators] = await Promise.all([
        this.getRiskAssessment(actorId),
        this.getIndicatorDetails(actorId),
      ]);

      logger.info(`Successfully fetched CCRA data for actor ${actorId}`);

      return {
        riskAssessment,
        indicators,
      };
    } catch (error) {
      logger.error("Error fetching CCRA data:", { error, actorId });
      throw error;
    }
  }
}


// Export the main fetch function
export const fetchCCRATopRisksData = (actorId: string) =>
  CCRAApiService.fetchCCRATopRisksData(actorId);
