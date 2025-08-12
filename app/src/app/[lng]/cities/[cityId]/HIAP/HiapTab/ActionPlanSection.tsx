import { Badge, Box, Button, Card, Icon, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { DownloadIcon } from "@/components/icons";
import { FaCaretDown } from "react-icons/fa";
import { TopPickIcon } from "@/components/icons";

// Climate action data type
interface ClimateAction {
  id: string;
  titleKey: string;
  descriptionKey: string;
  reductionPotential: "high" | "medium" | "low";
  sector: string;
  estimatedCost: "high" | "medium" | "low";
  implementationTime: string;
  isTopPick?: boolean;
}

// Sample climate actions data
const climateActions: ClimateAction[] = [
  {
    id: "1",
    titleKey: "integrate-renewables-into-municipal-water-systems",
    descriptionKey:
      "integrate-renewables-into-municipal-water-systems-description",
    reductionPotential: "high",
    sector: "transport",
    estimatedCost: "medium",
    implementationTime: "less-than-5-years",
    isTopPick: true,
  },
  {
    id: "2",
    titleKey: "implementation-of-urban-toll",
    descriptionKey: "implementation-of-urban-toll-description",
    reductionPotential: "low",
    sector: "stationary-energy",
    estimatedCost: "medium",
    implementationTime: "less-than-5-years",
    isTopPick: false,
  },
  {
    id: "3",
    titleKey: "encourage-renewable-energy-policies",
    descriptionKey: "encourage-renewable-energy-policies-description",
    reductionPotential: "medium",
    sector: "waste",
    estimatedCost: "medium",
    implementationTime: "less-than-5-years",
    isTopPick: false,
  },
];

const ActionPlanSection = ({ t }: { t: TFunction }) => {
  return (
    <Box w="1090px" mx="auto" py="48px" display="flex" flexDirection="column">
      {/* Heading with action button */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        w="full"
      >
        <Text
          color="content.primary"
          fontSize="title.lg"
          fontWeight="semibold"
          fontFamily="heading"
          mb={2}
        >
          {t("generate-climate-actions-title")}
        </Text>
        <Button variant="ghost" color="interactive.control" p="4px">
          <Icon as={DownloadIcon} />
          <Text>{t("download-action-plan")}</Text>
          <Icon as={FaCaretDown} color="interactive.control" />
        </Button>
      </Box>
      <Text
        fontSize="body.lg"
        color="content.tertiary"
        fontWeight="normal"
        mt="8px"
      >
        {t("generate-climate-actions-widget-description")}
      </Text>
      <Box
        display="grid"
        gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))"
        py="24px"
        gap="24px"
        justifyItems="start"
      >
        {climateActions.map((action) => (
          <ClimateActionCard key={action.id} action={action} t={t} />
        ))}
      </Box>
    </Box>
  );
};

export default ActionPlanSection;

// Reusable Climate Action Card Component
const ClimateActionCard = ({
  action,
  t,
}: {
  action: ClimateAction;
  t: TFunction;
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

  return (
    <Card.Root
      p="24px"
      borderRadius="8px"
      maxW="353px"
      bg="background.secondary"
      gap="16px"
      position="relative"
    >
      <Card.Description pt={action.isTopPick ? "32px" : "24px"}>
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
          {t(action.titleKey)}
        </Text>
        <Text fontSize="body.sm" color="content.tertiary" mt="8px">
          {t(action.descriptionKey)}
        </Text>

        <Box display="flex" gap="8px" py="12px" w="full">
          <LevelBadge
            level={action.reductionPotential}
            type="reduction-potential"
            t={t}
          />
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
            color={getReductionColor(action.reductionPotential)}
            fontFamily="heading"
            fontWeight="bold"
            textTransform="capitalize"
          >
            {t(action.reductionPotential)}
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
              {t(action.sector)}
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
              {t(action.estimatedCost)}
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
              {t(action.implementationTime)}
            </Text>
          </Box>

          <Box display="flex" justifyContent="flex-start">
            <Button
              variant="ghost"
              color="content.link"
              textDecoration="underline"
              textTransform="none"
              textStyle="label.lg"
              pl="0px"
            >
              {t("see-more-details")}
            </Button>
          </Box>
        </Box>
      </Card.Description>
    </Card.Root>
  );
};

const LevelBadge = ({
  level,
  type,
  t,
}: {
  level: string;
  type: string;
  t: TFunction;
}) => {
  const getBarConfig = (level: string) => {
    switch (level) {
      case "high":
        return {
          color: "sentiment.negativeDefault", // Red
          filledBars: 3,
        };
      case "medium":
        return {
          color: "sentiment.warningDefault", // Yellow/Orange
          filledBars: 2,
        };
      case "low":
        return {
          color: "content.link", // Blue
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
