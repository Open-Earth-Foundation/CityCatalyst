"use client";

import { Badge, Box, HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";

import { formatEmissions } from "@/util/helpers";

function cityInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length === 0) {
    return "--";
  }
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function cityCountry(city: any): string {
  return city?.country ?? city?.countryLocode ?? "-";
}

function formatTotalEmissions(value: unknown): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  const formatted = formatEmissions(numericValue);
  const unit = formatted.unit.trim();
  return `${formatted.value} ${unit}CO2e`;
}

function humanizeIdentifier(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function actionCategory(action: any, t: (key: string) => string) {
  const rawValue =
    (action.sectors ?? [])[0] ?? (action.hazards ?? [])[0] ?? "hiap";
  const translationKey = `sector.${rawValue}`;
  const translated = t(translationKey);
  return {
    label:
      translated === translationKey ? humanizeIdentifier(rawValue) : translated,
    palette: categoryPalette(rawValue),
  };
}

function categoryPalette(value: string): string {
  if (value.includes("transport")) {
    return "blue";
  }
  if (value.includes("waste")) {
    return "green";
  }
  if (value.includes("water")) {
    return "cyan";
  }
  if (value.includes("health")) {
    return "purple";
  }
  if (value.includes("biodiversity")) {
    return "teal";
  }
  return "gray";
}

function ContextMetric(props: {
  label: string;
  value: string | number;
  tone?: "primary" | "neutral";
}) {
  return (
    <Box minW={0} borderTopWidth="1px" borderColor="border.overlay" pt={3}>
      <Text
        color="content.tertiary"
        fontSize="label.sm"
        fontWeight="semibold"
        textTransform="uppercase"
      >
        {props.label}
      </Text>
      <Text
        mt={1}
        color={
          props.tone === "primary" ? "interactive.secondary" : "content.primary"
        }
        fontFamily="heading"
        fontSize="title.sm"
        fontWeight="bold"
        lineHeight="20px"
        overflowWrap="anywhere"
      >
        {props.value}
      </Text>
    </Box>
  );
}

function topActionsFor(data: any): any[] {
  const ranked = data?.rankedActions ?? [];
  const unranked = data?.unrankedActions ?? [];
  const selected = [...ranked, ...unranked].filter(
    (action: any) => action?.isSelected,
  );
  return (selected.length > 0 ? selected : ranked.slice(0, 3)).slice(0, 6);
}

function ActionList(props: {
  title: string;
  data: any;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const actions = topActionsFor(props.data);
  return (
    <Box>
      <HStack justify="space-between" mb={3}>
        <Text fontWeight="bold" color="content.primary">
          {props.title}
        </Text>
      </HStack>
      <VStack align="stretch" gap={3}>
        {actions.length === 0 ? (
          <Text color="content.tertiary" fontSize="body.sm">
            {props.t("no-actions-available-yet")}
          </Text>
        ) : (
          actions.map((action: any) => {
            const category = actionCategory(action, props.t);
            return (
              <Box
                key={action.id ?? action.actionId}
                p={3}
                borderWidth="1px"
                borderColor="border.overlay"
                borderRadius="8px"
                bg="base.light"
              >
                <HStack align="start" justify="space-between" gap={3}>
                  <Text fontWeight="semibold" color="content.primary">
                    {action.name}
                  </Text>
                  <Badge colorPalette={action.isSelected ? "green" : "gray"}>
                    #{action.rank}
                  </Badge>
                </HStack>
                <HStack mt={3} gap={2}>
                  <Box
                    w="8px"
                    h="8px"
                    borderRadius="full"
                    bg="interactive.secondary"
                    opacity={0.7}
                  />
                  <Badge colorPalette={category.palette} variant="subtle">
                    {category.label}
                  </Badge>
                </HStack>
              </Box>
            );
          })
        )}
      </VStack>
    </Box>
  );
}

export function HiapContextPanel(props: {
  city: any;
  inventory: any;
  hiapData: any;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const mitigation = props.hiapData?.mitigation;
  const adaptation = props.hiapData?.adaptation;
  const cityName = props.city?.name ?? props.t("selected-city");
  const mitigationCount = mitigation?.rankedActions?.length ?? 0;
  const adaptationCount = adaptation?.rankedActions?.length ?? 0;

  return (
    <Box
      h="full"
      overflowY="auto"
      bg="background.backgroundLight"
      borderLeftWidth="1px"
      borderColor="border.neutral"
      p={5}
    >
      <VStack align="stretch" gap={6}>
        <Box
          overflow="hidden"
          borderWidth="1px"
          borderColor="border.overlay"
          borderRadius="rounded-xl"
          bg="base.light"
        >
          <Box
            px={5}
            py={4}
            borderLeftWidth="5px"
            borderColor="interactive.tertiary"
          >
            <HStack align="start" gap={4}>
              <Box
                flexShrink={0}
                w="52px"
                h="52px"
                display="grid"
                placeItems="center"
                borderRadius="full"
                bg="sentiment.positiveOverlay"
                color="interactive.tertiary"
                fontFamily="heading"
                fontSize="title.md"
                fontWeight="bold"
              >
                {cityInitials(cityName)}
              </Box>
              <Box minW={0} flex="1">
                <Text
                  fontSize="overline"
                  fontWeight="bold"
                  color="interactive.control"
                  textTransform="uppercase"
                >
                  {props.t("city-context")}
                </Text>
                <Text
                  mt={1}
                  fontFamily="heading"
                  fontSize="title.md"
                  fontWeight="bold"
                  color="content.primary"
                  lineHeight="24px"
                >
                  {cityName}
                </Text>
                <HStack mt={2} gap={2} flexWrap="wrap">
                  <Badge colorPalette="gray">
                    {props.t("locode-short-label", {
                      value: props.city?.locode ?? "-",
                    })}
                  </Badge>
                  <Badge colorPalette="blue">{cityCountry(props.city)}</Badge>
                </HStack>
              </Box>
            </HStack>
          </Box>

          <Box px={5} pb={5}>
            <SimpleGrid columns={2} gap={4}>
              <ContextMetric
                label={props.t("inventory-year-short-label")}
                value={props.inventory?.year ?? "-"}
                tone="primary"
              />
              <ContextMetric
                label={props.t("total-emissions-short-label")}
                value={formatTotalEmissions(props.inventory?.totalEmissions)}
              />
            </SimpleGrid>
          </Box>

          <Box
            px={5}
            py={3}
            bg="background.neutral"
            borderTopWidth="1px"
            borderColor="border.overlay"
          >
            <HStack justify="space-between" gap={3}>
              <Text
                color="content.secondary"
                fontSize="label.md"
                fontWeight="semibold"
              >
                {props.t("hiap-summary")}
              </Text>
              <HStack gap={2} flexWrap="wrap" justify="flex-end">
                <Badge colorPalette="blue">
                  {props.t("mitigation-short-count", {
                    count: mitigationCount,
                  })}
                </Badge>
                <Badge colorPalette="teal">
                  {props.t("adaptation-short-count", {
                    count: adaptationCount,
                  })}
                </Badge>
              </HStack>
            </HStack>
          </Box>
        </Box>

        <ActionList
          title={props.t("top-mitigation-actions")}
          data={mitigation}
          t={props.t}
        />
        <ActionList
          title={props.t("top-adaptation-actions")}
          data={adaptation}
          t={props.t}
        />
      </VStack>
    </Box>
  );
}
