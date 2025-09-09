// backend/ccra/CcraService.ts
import { logger } from "@/services/logger";
import { CCRATopRisksData, Indicator, RiskAssessment } from "@/util/types";

export interface TopRisksResult {
  topRisks: RiskAssessment[];
  cityName?: string;
  region?: string;
}

/**
 * Service for processing top CCRA risks
 */
export class CcraService {
  /**
   * Normalize a score between bounds
   */
  private static normalizeScore(
    score: number,
    lowerLimit: number,
    upperLimit: number,
  ) {
    if (!lowerLimit || !upperLimit || lowerLimit === upperLimit) return score;
    const normalized = (score - lowerLimit) / (upperLimit - lowerLimit);
    return Math.max(0.01, Math.min(0.99, normalized));
  }

  /**
   * Count vulnerability indicators per hazard-impact pair
   */
  private static countVulnerabilityIndicators(
    indicators: Indicator[],
  ): Record<string, number> {
    const counts: Record<string, number> = {};

    if (!indicators || !Array.isArray(indicators)) return counts;

    indicators.forEach((indicator) => {
      if (!indicator.hazard || !indicator.keyimpact) return;
      const key = `${indicator.hazard}_${indicator.keyimpact}`.toLowerCase();
      if (indicator.category?.toLowerCase() === "vulnerability") {
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    return counts;
  }

  /**
   * Apply resilience adjustment to a single risk
   */
  private static applyResilienceToRisk(
    risk: RiskAssessment,
    resilienceScore: number | null,
    indicatorCount: number = 1,
  ): RiskAssessment {
    const adjustedRisk = { ...risk };

    // Store original scores
    if (!adjustedRisk.original_risk_score) {
      adjustedRisk.original_risk_score = adjustedRisk.risk_score;
    }
    if (!adjustedRisk.original_vulnerability_score) {
      adjustedRisk.original_vulnerability_score =
        adjustedRisk.vulnerability_score;
    }

    // If no resilience, just normalize
    if (!resilienceScore) {
      adjustedRisk.risk_score = this.normalizeScore(
        adjustedRisk.risk_score,
        risk.risk_lower_limit || 0,
        risk.risk_upper_limit || 1,
      );
      return adjustedRisk;
    }

    // Apply vulnerability adjustment
    const vulnerabilityAdjustment = (1 - resilienceScore) / indicatorCount;
    adjustedRisk.vulnerability_score = Math.max(
      0,
      adjustedRisk.vulnerability_score - vulnerabilityAdjustment,
    );

    // Recalculate risk score
    const newRiskScore =
      adjustedRisk.hazard_score *
      adjustedRisk.exposure_score *
      adjustedRisk.vulnerability_score;

    adjustedRisk.risk_score = this.normalizeScore(
      newRiskScore,
      risk.risk_lower_limit || 0,
      risk.risk_upper_limit || 1,
    );

    return adjustedRisk;
  }

  /**
   * Process and get top risks with all necessary data
   */
  public static processTopRisks(
    data: CCRATopRisksData,
    count: number = 3,
    resilienceScore: number | null = null,
  ): TopRisksResult {
    try {
      logger.info(`Processing top ${count} risks`);

      if (!data.riskAssessment || data.riskAssessment.length === 0) {
        logger.warn("No risk assessment data available");
        return {
          topRisks: [],
          cityName: data.cityName,
          region: data.region,
        };
      }

      // Count vulnerability indicators if resilience will be applied
      const indicatorCounts = resilienceScore
        ? this.countVulnerabilityIndicators(data.indicators || [])
        : {};

      // Process risks with resilience if provided
      const processedRisks = data.riskAssessment.map((risk) => {
        const key = `${risk.hazard}_${risk.keyimpact}`.toLowerCase();
        const indicatorCount = indicatorCounts[key] || 1;

        return this.applyResilienceToRisk(
          risk,
          resilienceScore,
          indicatorCount,
        );
      });

      // Sort by risk score and get top N
      const topRisks = processedRisks
        .sort((a, b) => b.risk_score - a.risk_score)
        .slice(0, count);

      logger.info(`Successfully processed ${topRisks.length} top risks`);

      return {
        topRisks,
        cityName: data.cityName,
        region: data.region,
      };
    } catch (error) {
      logger.error("Error processing top risks:", error);
      throw error;
    }
  }
}
