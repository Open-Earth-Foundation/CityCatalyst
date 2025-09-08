// Risk level configurations for CCRA
export const RISK_LEVELS = {
  VERY_LOW: {
    label: "Very Low",
    threshold: 0.19,
    color: "#02C650",
    backgroundColor: "#DCFCE7",
    textColor: "#166534",
  },
  LOW: {
    label: "Low",
    threshold: 0.39,
    color: "#A9DE00",
    backgroundColor: "#ECFCCB",
    textColor: "#3F6212",
  },
  MEDIUM: {
    label: "Medium",
    threshold: 0.59,
    color: "#FFCD00",
    backgroundColor: "#FEF9C3",
    textColor: "#854D0E",
  },
  HIGH: {
    label: "High",
    threshold: 0.79,
    color: "#FF8300",
    backgroundColor: "#FEE2E2",
    textColor: "#991B1B",
  },
  VERY_HIGH: {
    label: "Very High",
    threshold: 1.0,
    color: "#F40000",
    backgroundColor: "#FFE4E6",
    textColor: "#9F1239",
  },
  NA: {
    label: "N/A",
    threshold: null,
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    textColor: "#374151",
  },
} as const;

// Translation key mappings for CCRA data
export const ccraTranslationKeys = {
  // Hazards
  "extreme_heat": "hazard-extreme-heat",
  "flooding": "hazard-flooding", 
  "drought": "hazard-drought",
  "wildfire": "hazard-wildfire",
  "cyclone": "hazard-cyclone",
  "sea_level_rise": "hazard-sea-level-rise",
  
  // Sectors
  "health": "sector-health",
  "infrastructure": "sector-infrastructure",
  "economy": "sector-economy", 
  "environment": "sector-environment",
  "agriculture": "sector-agriculture",
  "water": "sector-water",
  
  // Impact descriptions
  "extreme_heat_health": "impact-extreme-heat-health",
  "extreme_heat_infrastructure": "impact-extreme-heat-infrastructure", 
  "extreme_heat_general": "impact-extreme-heat-general",
  "flooding_health": "impact-flooding-health",
  "flooding_infrastructure": "impact-flooding-infrastructure",
  "flooding_general": "impact-flooding-general",
  "drought_health": "impact-drought-health",
  "drought_infrastructure": "impact-drought-infrastructure",
  "drought_agriculture": "impact-drought-agriculture",
  "drought_water": "impact-drought-water",
  "drought_general": "impact-drought-general",
  "wildfire_health": "impact-wildfire-health",
  "wildfire_infrastructure": "impact-wildfire-infrastructure",
  "wildfire_environment": "impact-wildfire-environment", 
  "wildfire_general": "impact-wildfire-general",
  "cyclone_health": "impact-cyclone-health",
  "cyclone_infrastructure": "impact-cyclone-infrastructure",
  "cyclone_economy": "impact-cyclone-economy",
  "cyclone_general": "impact-cyclone-general",
  "sea_level_rise_infrastructure": "impact-sea-level-rise-infrastructure",
  "sea_level_rise_economy": "impact-sea-level-rise-economy", 
  "sea_level_rise_environment": "impact-sea-level-rise-environment",
  "sea_level_rise_general": "impact-sea-level-rise-general",
  "general_default": "impact-general-default"
};

// Utility functions
export const formatScore = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return "N/A";
  return Number(score).toFixed(3);
};

export const getRiskLevel = (score: number | null | undefined) => {
  if (score === null || score === undefined) return RISK_LEVELS.NA;
  const numScore = Number(score);
  if (numScore < 0.19) return RISK_LEVELS.VERY_LOW;
  if (numScore < 0.39) return RISK_LEVELS.LOW;
  if (numScore < 0.59) return RISK_LEVELS.MEDIUM;
  if (numScore < 0.79) return RISK_LEVELS.HIGH;
  return RISK_LEVELS.VERY_HIGH;
};

export const getRiskChangeDescription = (
  originalScore: number | null,
  updatedScore: number | null,
) => {
  if (!originalScore || !updatedScore) return null;
  const percentChange = ((updatedScore - originalScore) / originalScore) * 100;
  if (Math.abs(percentChange) < 1) return null;
  return {
    text: `${percentChange > 0 ? "+" : ""}${percentChange.toFixed(1)}%`,
    color: percentChange > 0 ? "#EF4444" : "#10B981",
  };
};
