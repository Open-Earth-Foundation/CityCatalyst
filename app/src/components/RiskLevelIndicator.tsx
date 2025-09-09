import React from "react";
import { Box, HStack } from "@chakra-ui/react";
import { RISK_LEVELS } from "@/util/ccra-constants";

interface RiskLevelIndicatorProps {
  riskScore: number;
  riskLevel: (typeof RISK_LEVELS)[keyof typeof RISK_LEVELS];
}

export const RiskLevelIndicator: React.FC<RiskLevelIndicatorProps> = ({
  riskScore,
  riskLevel,
}) => {
  // CCRA risk thresholds based on the original component
  const thresholds = [0.01, 0.078, 0.165, 0.289, 0.508];

  return (
    <HStack gap="2px">
      {[...Array(5)].map((_, i) => {
        const isActive = riskScore >= thresholds[i];

        return (
          <Box
            key={i}
            h="6px"
            flex="1"
            borderRadius="2.5px"
            bg={isActive ? riskLevel.color : "border.muted"}
            transition="background-color 0.2s"
          />
        );
      })}
    </HStack>
  );
};
