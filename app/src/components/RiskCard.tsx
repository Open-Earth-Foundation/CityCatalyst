import React from "react";
import { Box, Card, Text, HStack, VStack } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { RiskAssessment } from "@/util/types";
import {
  ccraTranslationKeys,
  formatScore,
  getRiskLevel,
  getRiskChangeDescription,
} from "@/util/ccra-constants";
import { RiskLevelTag } from "@/components/RiskLevelTag";
import { RiskLevelIndicator } from "@/components/RiskLevelIndicator";
import { TitleLarge, TitleSmall } from "./Texts/Title";
import { BodyLarge, BodySmall } from "./Texts/Body";
import { LabelMedium } from "./Texts/Label";

export const RiskCard = ({
  risk,
  resilienceScore = null,
  t,
  onSeeMoreClick,
}: {
  risk: RiskAssessment;
  resilienceScore?: number | null;
  t: TFunction;
  onSeeMoreClick?: () => void;
}) => {
  const riskLevel = getRiskLevel(risk.risk_score);
  const changeDescription =
    resilienceScore !== null
      ? getRiskChangeDescription(
          risk.original_risk_score as number,
          risk.risk_score,
        )
      : null;

  const hazardKey = risk.hazard?.toLowerCase().replace(/\s+/g, "_");
  const sectorKey = risk.keyimpact?.toLowerCase().replace(/\s+/g, "_");

  // Helper function to get translated text
  const getTranslation = (
    type: "hazard" | "sector",
    key: string,
    fallback: string,
  ) => {
    const translationKey =
      ccraTranslationKeys[key as keyof typeof ccraTranslationKeys];
    if (translationKey) {
      return t(translationKey);
    }
    return fallback;
  };

  const getImpactDescription = (hazardKey: string, sectorKey: string) => {
    // Try specific hazard-sector combination first
    const specificKey = `${hazardKey}_${sectorKey}`;
    const specificTranslationKey =
      ccraTranslationKeys[specificKey as keyof typeof ccraTranslationKeys];
    if (specificTranslationKey) {
      return t(specificTranslationKey);
    }

    // Try general hazard impact
    const generalKey = `${hazardKey}_general`;
    const generalTranslationKey =
      ccraTranslationKeys[generalKey as keyof typeof ccraTranslationKeys];
    if (generalTranslationKey) {
      return t(generalTranslationKey);
    }

    // Fallback to default
    return t("impact-general-default");
  };

  return (
    <Card.Root
      p="24px"
      borderRadius="8px"
      maxW="353px"
      bg="background.secondary"
      gap="16px"
      position="relative"
    >
      <VStack align="stretch" gap={4}>
        {/* Header with sector and risk level */}
        <HStack justifyContent="space-between" align="start">
          <VStack align="start" gap={1}>
            <LabelMedium
              color="content.tertiary"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              {getTranslation("sector", sectorKey || "", risk.keyimpact || "")}
            </LabelMedium>
          </VStack>
          <RiskLevelTag riskLevel={riskLevel} t={t} />
        </HStack>

        {/* Hazard name */}
        <VStack align="start" gap={1}>
          <TitleLarge
            textTransform="capitalize"
            fontWeight="semibold"
            color="content.primary"
          >
            {getTranslation("hazard", hazardKey || "", risk.hazard || "")}
          </TitleLarge>
          <BodySmall color="content.secondary">{t("climate-hazard")}</BodySmall>
        </VStack>

        {/* Risk score section */}
        <VStack align="stretch" gap={3}>
          <HStack justifyContent="space-between" align="baseline">
            <BodyLarge fontWeight="medium" color="content.secondary">
              {t("risk-score")}
            </BodyLarge>
            <HStack gap={2} align="baseline">
              {resilienceScore !== null && risk.original_risk_score && (
                <Text
                  fontSize="sm"
                  color="content.tertiary"
                  textDecoration="line-through"
                >
                  {formatScore(risk.original_risk_score)}
                </Text>
              )}
              <TitleLarge fontWeight="bold" color={riskLevel.color}>
                {formatScore(risk.risk_score)}
              </TitleLarge>
            </HStack>
          </HStack>

          {changeDescription && (
            <Text
              fontSize="sm"
              color={changeDescription.color}
              textAlign="right"
            >
              {changeDescription.text}
            </Text>
          )}

          {/* Risk level indicator */}
          <RiskLevelIndicator
            riskScore={risk.risk_score}
            riskLevel={riskLevel}
          />
        </VStack>

        {/* Component scores */}
        <VStack align="stretch" gap={2}>
          <HStack justifyContent="space-between">
            <BodySmall color="content.secondary">{t("hazard-score")}</BodySmall>
            <BodySmall fontWeight="medium" color="content.primary">
              {formatScore(risk.hazard_score)}
            </BodySmall>
          </HStack>

          <HStack justifyContent="space-between">
            <BodySmall color="content.secondary">
              {t("exposure-score")}
            </BodySmall>
            <BodySmall fontWeight="medium" color="content.primary">
              {formatScore(risk.exposure_score)}
            </BodySmall>
          </HStack>

          <HStack justifyContent="space-between">
            <BodySmall color="content.secondary">
              {t("vulnerability-score")}
            </BodySmall>
            <HStack gap={2} align="baseline">
              {resilienceScore !== null &&
                risk.original_vulnerability_score && (
                  <Text
                    fontSize="xs"
                    color="content.tertiary"
                    textDecoration="line-through"
                  >
                    {formatScore(risk.original_vulnerability_score)}
                  </Text>
                )}
              <BodySmall
                fontWeight="medium"
                color={
                  resilienceScore !== null
                    ? "interactive.secondary"
                    : "content.primary"
                }
              >
                {formatScore(risk.vulnerability_score)}
              </BodySmall>
            </HStack>
          </HStack>
        </VStack>

        {/* Impact description */}
        <Box pt={3} borderTopWidth="1px" borderTopColor="border.muted">
          <VStack align="start" gap={2}>
            <TitleSmall fontWeight="medium" color="content.secondary">
              {t("potential-impacts")}
            </TitleSmall>
            <BodySmall color="content.tertiary" lineHeight="tall">
              {getImpactDescription(hazardKey || "", sectorKey || "")}
            </BodySmall>
          </VStack>
        </Box>
      </VStack>
    </Card.Root>
  );
};
