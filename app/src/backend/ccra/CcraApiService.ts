// backend/ccra/CcraApiService.ts
import { logger } from "@/services/logger";
import type {
  CCRATopRisksData,
  CCRATopRisksDataAdaptaBrazil,
  Indicator,
  IndicatorAdaptaBrazil,
  RiskAssessment,
  RiskAssessmentAdaptaBrazil,
} from "@/util/types";

const CCRA_API_URL = (process.env.GLOBAL_API_URL || "http://ccra-service") + "";

class CCRAApiService {
  /**
   * Fetch risk assessment data for current scenario
   */
  public static async getRiskAssessmentFromAdaptaBrazil(
    actorId: string,
  ): Promise<RiskAssessmentAdaptaBrazil[]> {
    try {
      const response = await fetch(
        `${CCRA_API_URL}/api/v1/cities/${actorId}/climate-risk/adapta`,
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
      return Array.isArray(data) ? data : data.data || [];
    } catch (error) {
      logger.error({ error, actorId }, "Error fetching risk assessment");
      throw error;
    }
  }

  /**
   * Fetch indicator details for vulnerability calculations
   */
  public static async getIndicatorDetailsFromAdaptaBrazil(
    actorId: string,
  ): Promise<IndicatorAdaptaBrazil[]> {
    try {
      const response = await fetch(
        `${CCRA_API_URL}/api/v1/cities/${actorId}/climate-risk/adapta?scenario=current&level=chain`,
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
      return Array.isArray(data) ? data : data.data || [];
    } catch (error) {
      logger.error({ error, actorId }, "Error fetching indicators:");
      throw error;
    }
  }

  /**
   * Fetch CCRA data for top risks display
   */
  public static async fetchCCRATopRisksDataFromAdaptaBrazil(
    actorId: string,
  ): Promise<CCRATopRisksDataAdaptaBrazil> {
    try {
      logger.info(`Fetching CCRA top risks data for actor ${actorId}`);

      // Fetch risk assessment and indicators in parallel
      const [riskAssessment, indicators] = await Promise.all([
        // TODO use adapta brazil route instead
        this.getRiskAssessmentFromAdaptaBrazil(actorId),
        this.getIndicatorDetailsFromAdaptaBrazil(actorId),
      ]);

      logger.info(`Successfully fetched CCRA data for actor ${actorId}`);

      return {
        riskAssessment,
        indicators,
      };
    } catch (error) {
      logger.error({ error, actorId }, "Error fetching CCRA data:");
      throw error;
    }
  }

  /// LEGACY FUNCTIONS FOR IMPACT CHAIN DATAImpactChain

  /**
   * Fetch risk assessment data for current scenario
   */
  public static async getRiskAssessmentFromImpactChain(
    actorId: string,
  ): Promise<RiskAssessment[]> {
    try {
      const response = await fetch(
        `${CCRA_API_URL}/api/v0/ccra/risk_assessment/city/${actorId}/current`,
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
      logger.error({ error, actorId }, "Error fetching risk assessment");
      throw error;
    }
  }

  /**
   * Fetch indicator details for vulnerability calculations
   */
  public static async getIndicatorDetailsFromImpactChain(
    actorId: string,
  ): Promise<Indicator[]> {
    try {
      const response = await fetch(
        `${CCRA_API_URL}/api/v0/ccra/impactchain_indicators/city/${actorId}/current`,
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
      logger.error({ error, actorId }, "Error fetching indicators:");
      throw error;
    }
  }

  /**
   * Fetch CCRA data for top risks display
   */
  public static async fetchCCRATopRisksDataFromImpactChain(
    actorId: string,
  ): Promise<CCRATopRisksData> {
    try {
      logger.info(`Fetching CCRA top risks data for actor ${actorId}`);

      // Fetch risk assessment and indicators in parallel
      const [riskAssessment, indicators] = await Promise.all([
        // TODO use adapta brazil route instead
        this.getRiskAssessmentFromImpactChain(actorId),
        this.getIndicatorDetailsFromImpactChain(actorId),
      ]);

      logger.info(`Successfully fetched CCRA data for actor ${actorId}`);

      return {
        riskAssessment,
        indicators,
      };
    } catch (error) {
      logger.error({ error, actorId }, "Error fetching CCRA data:");
      throw error;
    }
  }
}

// Export the main fetch functions
export const fetchCCRATopRisksDataFromAdaptaBrazil = (actorId: string) =>
  CCRAApiService.fetchCCRATopRisksDataFromAdaptaBrazil(actorId);

export const fetchCCRATopRisksDataFromImpactChain = (actorId: string) =>
  CCRAApiService.fetchCCRATopRisksDataFromImpactChain(actorId);
