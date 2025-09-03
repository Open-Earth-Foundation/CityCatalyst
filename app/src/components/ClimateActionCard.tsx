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
      <Card.Description
        pt={action.isSelected || action.rank <= 3 ? "32px" : "24px"}
      >
        <Text
          textOverflow="ellipsis"
          overflow="hidden"
          whiteSpace="nowrap"
          lineClamp={2}
          fontFamily="heading"
          fontWeight="bold"
          fontSize="title.lg"
          color="content.secondary"
          lineHeight="28px"
        >
          {action.name}
        </Text>
        <Text fontSize="body.sm" color="content.tertiary" mt="8px">
          {action.description}
        </Text>

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
          <Text
            fontSize="body.sm"
            color="content.tertiary"
            fontFamily="heading"
            fontWeight="semibold"
          >
            {t("reduction-potential")}
          </Text>
          <Text
            fontSize="title.md"
            color={getReductionColor(reductionLevel)}
            fontFamily="heading"
            fontWeight="bold"
            textTransform="capitalize"
          >
            {t(reductionLevel)}
          </Text>
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
            <Text
              color="content.tertiary"
              fontSize="body.sm"
              fontWeight="semibold"
            >
              {t("sector-name")}
            </Text>
            <Text
              fontSize="title.sm"
              color="content.tertiary"
              fontWeight="semibold"
              textTransform="capitalize"
            >
              {action.sectors?.[0] || "N/A"}
            </Text>
          </Box>

          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            w="full"
          >
            <Text
              color="content.tertiary"
              fontSize="body.sm"
              fontWeight="semibold"
            >
              {t("estimated-cost")}
            </Text>
            <Text
              fontSize="title.sm"
              color="content.tertiary"
              fontWeight="semibold"
              textTransform="capitalize"
            >
              {t(action.costInvestmentNeeded)}
            </Text>
          </Box>

          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            w="full"
          >
            <Text
              color="content.tertiary"
              fontSize="body.sm"
              fontWeight="semibold"
            >
              {t("implementation-time")}
            </Text>
            <Text
              fontSize="title.sm"
              color="content.tertiary"
              fontWeight="semibold"
            >
              {t(action.timelineForImplementation)}
            </Text>
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
      </Card.Description>
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
                <Text
                  fontFamily="heading"
                  fontWeight="bold"
                  fontSize="headline.md"
                  color="content.primary"
                >
                  {t("generated-action-plan-title")}
                </Text>
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
                  <Text
                    fontFamily="heading"
                    fontWeight="bold"
                    fontSize="title.lg"
                    color="content.primary"
                  >
                    {t("generated-action-plan-location")}
                  </Text>
                </Box>
                <Box display="flex" alignItems="center" w="full">
                  <Text
                    fontFamily="body"
                    fontWeight="normal"
                    fontSize="body.lg"
                    color="content.tertiary"
                  >
                    {t("generated-action-plan-location-description")}
                  </Text>
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
                  <Text
                    fontFamily="heading"
                    fontWeight="bold"
                    fontSize="title.lg"
                    color="content.link"
                  >
                    {t("subactions")}
                  </Text>
                </Box>
                <Box display="flex" alignItems="center" w="full">
                  <Text
                    fontFamily="body"
                    fontWeight="normal"
                    fontSize="body.lg"
                    color="content.tertiary"
                  >
                    {t("subactions-description")}
                  </Text>
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
                  <Text
                    fontFamily="heading"
                    fontWeight="bold"
                    fontSize="title.lg"
                    color="content.link"
                    textTransform="capitalize"
                  >
                    {t("municipal-institutions-involved")}
                  </Text>
                </Box>
                <Box display="flex" alignItems="center" w="full">
                  <Text
                    fontFamily="body"
                    fontWeight="normal"
                    fontSize="body.lg"
                    color="content.tertiary"
                  >
                    {t("municipal-institutions-involved-description")}
                  </Text>
                </Box>
              </VStack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

const LevelBadge = ({ level }: { level: string }) => {
  const getBarConfig = (level: string) => {
    switch (level) {
      case "high":
        return {
          color: "sentiment.negativeDefault",
          filledBars: 3,
        };
      case "medium":
        return {
          color: "sentiment.warningDefault",
          filledBars: 2,
        };
      case "low":
        return {
          color: "content.link",
          filledBars: 1,
        };
      default:
        return {
          color: "content.tertiary",
          filledBars: 0,
        };
    }
  };

  const { color, filledBars } = getBarConfig(level);
  const totalBars = 3;

  return (
    <Box display="flex" gap="2px" alignItems="center">
      {Array.from({ length: totalBars }, (_, index) => (
        <Box
          key={index}
          bg={index < filledBars ? color : "border.overlay"}
          w="98px"
          h="5px"
          borderRadius="2.5px"
        />
      ))}
    </Box>
  );
};
