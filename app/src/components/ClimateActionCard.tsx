import React from "react";
import {
  Box,
  Button,
  Card,
  Dialog,
  Icon,
  Portal,
  Text,
  HStack,
  VStack,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import { TopPickIcon, GeneratePlanIcon } from "@/components/icons";
import { HIAction } from "@/util/types";
import { RiFile3Line } from "react-icons/ri";
import { GoLocation } from "react-icons/go";
import { LevelBadge } from "@/components/LevelBadge";
import { TitleLarge, TitleMedium, TitleSmall } from "./Texts/Title";
import { BodyLarge, BodySmall } from "./Texts/Body";
import { LabelMedium } from "./Texts/Label";
import { HeadlineMedium } from "./Texts/Headline";

export const ClimateActionCard = ({
  action,
  viewOnly = false,
  t,
  onSeeMoreClick,
}: {
  action: HIAction;
  viewOnly?: boolean;
  t: TFunction;
  onSeeMoreClick?: () => void;
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
        >
          {action.name}
        </TitleLarge>
        <BodySmall color="content.tertiary" mt="8px">
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
              {action.sectors?.[0] || "N/A"}
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
              {t(action.timelineForImplementation)}
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
              <GeneratePlanDialog t={t} />
            </>
          )}
        </Box>
      </Box>
    </Card.Root>
  );
};

const GeneratePlanDialog = ({ t }: { t: TFunction }) => {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          color="content.link"
          w="full"
          borderWidth="1px"
          borderColor="content.link"
          borderRadius="sm"
          className="group"
          bg="transparent"
        >
          <Icon as={GeneratePlanIcon} color="content.link" />
          {t("generate-plan")}
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content minW="768px" maxH="618px" p="24px">
            <Dialog.Header>
              <HStack
                justifyContent="space-between"
                w="full"
                alignItems="baseline"
                h="48px"
              >
                <Text
                  fontFamily="heading"
                  fontWeight="bold"
                  fontSize="overline"
                  color="content.link"
                  textTransform="uppercase"
                >
                  {t("generated-action-plan")}
                </Text>
                <Button
                  variant="ghost"
                  color="content.tertiary"
                  px="4px"
                  h="48px"
                >
                  <Icon as={RiFile3Line} boxSize="24px" />
                  {t("export-as-pdf")}
                </Button>
              </HStack>
            </Dialog.Header>
            <Dialog.Body>
              <VStack alignItems="flex-start" gap="24px" w="full">
                <HeadlineMedium fontWeight="bold" color="content.primary">
                  {t("generated-action-plan-title")}
                </HeadlineMedium>
                <Box
                  display="flex"
                  alignItems="center"
                  gap="8px"
                  py="24px"
                  borderBottom="1px solid"
                  borderColor="border.overlay"
                  w="full"
                >
                  <Icon as={GoLocation} boxSize="24px" color="content.link" />
                  <TitleLarge fontWeight="bold" color="content.primary">
                    {t("generated-action-plan-location")}
                  </TitleLarge>
                </Box>
                <Box display="flex" alignItems="center" w="full">
                  <BodyLarge fontWeight="normal" color="content.tertiary">
                    {t("generated-action-plan-location-description")}
                  </BodyLarge>
                </Box>
                <Box
                  display="flex"
                  alignItems="center"
                  gap="8px"
                  py="24px"
                  borderBottom="1px solid"
                  borderColor="border.overlay"
                  w="full"
                >
                  <TitleLarge fontWeight="bold" color="content.link">
                    {t("subactions")}
                  </TitleLarge>
                </Box>
                <Box display="flex" alignItems="center" w="full">
                  <BodyLarge fontWeight="normal" color="content.tertiary">
                    {t("subactions-description")}
                  </BodyLarge>
                </Box>
                <Box
                  display="flex"
                  alignItems="center"
                  gap="8px"
                  py="24px"
                  borderBottom="1px solid"
                  borderColor="border.overlay"
                  w="full"
                >
                  <TitleLarge
                    fontWeight="bold"
                    color="content.link"
                    textTransform="capitalize"
                  >
                    {t("municipal-institutions-involved")}
                  </TitleLarge>
                </Box>
                <Box display="flex" alignItems="center" w="full">
                  <BodyLarge fontWeight="normal" color="content.tertiary">
                    {t("municipal-institutions-involved-description")}
                  </BodyLarge>
                </Box>
              </VStack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};
