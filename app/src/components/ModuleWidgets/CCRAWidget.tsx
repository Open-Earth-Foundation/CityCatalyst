import React, { useMemo } from "react";
import { CCRARiskAssessment } from "@/util/types";
import { useTranslation } from "@/i18n/client";
import { RiskCard } from "@/components/RiskCard";
import { Box, HStack } from "@chakra-ui/react";
import { HeadlineLarge } from "@/components/Texts/Headline";
import { BodyLarge } from "@/components/Texts/Body";

interface TopRisksWidgetProps {
  cityId: string;
  cityName?: string;
  riskAssessment: CCRARiskAssessment[];
  resilienceScore?: number | null; // Added this prop
  className?: string;
  lng: string;
}

const TopRisksWidget: React.FC<TopRisksWidgetProps> = ({
  cityId,
  cityName = "Your City",
  riskAssessment,
  resilienceScore = null, // Default to null if not provided
  className = "",
  lng,
}) => {
  const { t } = useTranslation(lng, "ccra");

  // Calculate top 3 risks
  const topRisks = useMemo(() => {
    if (!riskAssessment || riskAssessment.length === 0) return [];

    return [...riskAssessment]
      .sort((a, b) => {
        const scoreA = a.risk_score ?? 0;
        const scoreB = b.risk_score ?? 0;
        return scoreB - scoreA;
      })
      .slice(0, 3);
  }, [riskAssessment]);

  if (topRisks.length === 0) {
    return (
      <Box
        bg="white"
        borderRadius="2xl"
        boxShadow="sm"
        p={6}
        className={className}
      >
        <Box textAlign="center" py={8} color="content.tertiary">
          {t("no-risk-data-available", { cityName })}
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      {/* Risk Cards */}
      <HStack gap={4}>
        {topRisks.map((risk, index) => (
          <RiskCard
            risk={risk}
            resilienceScore={resilienceScore}
            t={t}
            key={`${risk.hazard}-${risk.keyimpact}-${index}`}
          />
        ))}
      </HStack>
    </Box>
  );
};

export default TopRisksWidget;
