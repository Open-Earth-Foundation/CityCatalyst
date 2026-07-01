import React from "react";
import { Box, Button, Card, Icon, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { TopPickIcon } from "@/components/icons";
import { CityWithProjectDataResponse, HIAction } from "@/util/types";
import { LevelBadge } from "@/components/LevelBadge";
import { TitleLarge, TitleMedium, TitleSmall } from "./package/Texts/Title";
import { BodySmall } from "./package/Texts/Body";
import { LabelMedium } from "./package/Texts/Label";
import { toTranslationString } from "@/util/helpers";
import { GeneratePlanDrawer } from "@/components/HIAP/GeneratePlanDrawer";

export const ClimateActionCard = ({
  action,
  viewOnly = false,
  t,
  onSeeMoreClick,
  cityData,
  cityLocode,
  cityId,
  inventoryId,
}: {
  action: HIAction;
  viewOnly?: boolean;
  t: TFunction;
  onSeeMoreClick?: () => void;
  cityData?: CityWithProjectDataResponse;
  cityLocode?: string;
  cityId?: string;
  inventoryId?: string;
}) => {
  const getReductionColor = (level: string) => {
    switch (level) {
      case "high":
        return "sentiment.negativeDefault";
      case "medium":
        return "sentiment.warningDefault";
      case "low":
        return "content.link";
      default:
        return "content.tertiary";
    }
  };

  const getReductionPotentialLevel = (): string => {
    if (action.type === "mitigation" && action.GHGReductionPotential) {
      const ghgData = action.GHGReductionPotential;
      const values = Object.values(ghgData).filter((v) => v !== null);

      if (values.length === 0) return "medium";

      const highCount = values.filter((v) => v === "high").length;
      const lowCount = values.filter((v) => v === "low").length;

      if (highCount > 0) return "high";
      if (lowCount > values.length / 2) return "low";
      return "medium";
    } else if (action.type === "adaptation") {
      return action.adaptationEffectiveness || "medium";
    }

    return "medium";
  };

  const reductionLevel = getReductionPotentialLevel();
  const actionSector = action.sectors?.[0];

  return (
    <Card.Root
      p="24px"
      borderRadius="8px"
      maxW="353px"
      bg="background.secondary"
      gap="16px"
      position="relative"
    >
      {(action.isSelected || action.rank <= 3) && (
        <Card.Title display="flex" alignItems="center" gap="8px">
          <Icon as={TopPickIcon} />
          <Text
            fontSize="overline"
            color="content.link"
            fontWeight="bold"
            textTransform="uppercase"
            fontFamily="heading"
            letterSpacing="wider"
          >
            {t("top-pick")}
          </Text>
        </Card.Title>
      )}
      <Box pt={action.isSelected || action.rank <= 3 ? "32px" : "24px"}>
        <TitleLarge
          textOverflow="ellipsis"
          overflow="hidden"
          whiteSpace="nowrap"
          lineClamp={2}
          color="content.secondary"
          minHeight="56px"
          textTransform="capitalize"
        >
          {action.name}
        </TitleLarge>
        <BodySmall color="content.tertiary" mt="8px" lineClamp={2}>
          {action.description}
        </BodySmall>

        <Box display="flex" gap="8px" py="12px" w="full">
          <LevelBadge level={reductionLevel} />
        </Box>

        <Box
          display="flex"
          gap="8px"
          alignItems="center"
          justifyContent="space-between"
          borderBottom="1px solid"
          borderColor="border.overlay"
          pb="12px"
        >
          <LabelMedium color="content.tertiary">
            {t("reduction-potential")}
          </LabelMedium>
          <TitleMedium
            color={getReductionColor(reductionLevel)}
            textTransform="capitalize"
          >
            {t(reductionLevel)}
          </TitleMedium>
        </Box>

        <Box
          display="flex"
          flexDirection="column"
          gap="14px"
          w="full"
          py="28px"
          fontFamily="heading"
        >
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            w="full"
          >
            <LabelMedium color="content.tertiary">
              {t("sector-name")}
            </LabelMedium>
            <TitleSmall color="content.tertiary" textTransform="capitalize">
              {actionSector
                ? t("sector." + toTranslationString(actionSector))
                : t("n-a")}
            </TitleSmall>
          </Box>

          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            w="full"
          >
            <LabelMedium color="content.tertiary">
              {t("estimated-cost")}
            </LabelMedium>
            <TitleSmall color="content.tertiary" textTransform="capitalize">
              {t(action.costInvestmentNeeded)}
            </TitleSmall>
          </Box>

          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            w="full"
          >
            <LabelMedium color="content.tertiary">
              {t("implementation-time")}
            </LabelMedium>
            <TitleSmall color="content.tertiary">
              {action.timelineForImplementation
                ? t("timeline." + action.timelineForImplementation)
                : t("n-a")}
            </TitleSmall>
          </Box>

          {onSeeMoreClick && (
            <Box display="flex" justifyContent="flex-start">
              <Button
                variant="ghost"
                color="content.link"
                textDecoration="underline"
                textTransform="none"
                textStyle="label.lg"
                pl="0px"
                onClick={onSeeMoreClick}
              >
                {t("see-more-details")}
              </Button>
            </Box>
          )}
          {!viewOnly && (
            <>
              <GeneratePlanDrawer
                t={t}
                action={action}
                cityData={cityData}
                cityLocode={cityLocode}
                cityId={cityId}
                inventoryId={inventoryId}
              />
            </>
          )}
        </Box>
      </Box>
    </Card.Root>
  );
};
