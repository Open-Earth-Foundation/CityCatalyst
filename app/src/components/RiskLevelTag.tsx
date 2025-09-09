import React from "react";
import { Box, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { RISK_LEVELS } from "@/util/ccra-constants";

interface RiskLevelTagProps {
  riskLevel: (typeof RISK_LEVELS)[keyof typeof RISK_LEVELS];
  t: TFunction;
}

export const RiskLevelTag: React.FC<RiskLevelTagProps> = ({ riskLevel, t }) => {
  // Map risk level labels to translation keys
  const getRiskLevelTranslationKey = (label: string) => {
    switch (label) {
      case "Very Low":
        return "risk-level-very-low";
      case "Low":
        return "risk-level-low";
      case "Medium":
        return "risk-level-medium";
      case "High":
        return "risk-level-high";
      case "Very High":
        return "risk-level-very-high";
      case "N/A":
        return "risk-level-na";
      default:
        return "risk-level-na";
    }
  };

  return (
    <Box
      px={3}
      py={1}
      borderRadius="32.5px"
      bg={riskLevel.backgroundColor}
      border="1px solid"
      borderColor="transparent"
    >
      <Text
        fontSize="xs"
        fontWeight="medium"
        color={riskLevel.textColor}
        textAlign="center"
        whiteSpace="nowrap"
      >
        {t(getRiskLevelTranslationKey(riskLevel.label))}
      </Text>
    </Box>
  );
};
