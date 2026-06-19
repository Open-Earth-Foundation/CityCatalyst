"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  Badge,
  Box,
  HStack,
  Icon,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MdExpandMore } from "react-icons/md";

import { Button } from "@/components/ui/button";
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

function translatedIdentifier(
  value: unknown,
  namespace: string,
  t: (key: string) => string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }
  const key = `${namespace}.${value}`;
  const translated = t(key);
  return translated === key ? humanizeIdentifier(value) : translated;
}

function translatedLevel(
  value: unknown,
  namespace: string,
  t: (key: string) => string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return t("n-a");
  }
  const key = `${namespace}.${value}`;
  const translated = t(key);
  if (translated !== key) {
    return translated;
  }
  const direct = t(value);
  return direct === value ? humanizeIdentifier(value) : direct;
}

function actionExplanation(action: any, lng: string): string {
  const explanations = action?.explanation?.explanations;
  if (explanations && typeof explanations === "object") {
    return explanations[lng] ?? explanations.en ?? "";
  }
  return typeof action?.explanation === "string" ? action.explanation : "";
}

function stringList(values: unknown): string[] {
  return Array.isArray(values)
    ? values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    : [];
}

function impactEntries(action: any, t: (key: string) => string): string[] {
  if (action?.GHGReductionPotential) {
    return Object.entries(action.GHGReductionPotential)
      .filter(([, value]) => value)
      .map(([sector, value]) => {
        const label = translatedIdentifier(sector, "sector", t);
        const level = translatedLevel(value, "effectiveness-level", t);
        return `${label}: ${level}`;
      });
  }

  if (action?.adaptationEffectiveness) {
    return [
      translatedLevel(action.adaptationEffectiveness, "effectiveness-level", t),
    ];
  }

  return [];
}

function DetailValue(props: { label: string; children: ReactNode }) {
  return (
    <Box>
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
        color="content.secondary"
        fontSize="body.sm"
        lineHeight="20px"
        overflowWrap="anywhere"
      >
        {props.children}
      </Text>
    </Box>
  );
}

function DetailList(props: { label: string; items: string[] }) {
  if (props.items.length === 0) {
    return null;
  }

  return (
    <Box>
      <Text
        color="content.tertiary"
        fontSize="label.sm"
        fontWeight="semibold"
        textTransform="uppercase"
      >
        {props.label}
      </Text>
      <VStack as="ul" align="stretch" gap={1} mt={1} pl={4}>
        {props.items.map((item) => (
          <Text
            as="li"
            key={item}
            color="content.secondary"
            fontSize="body.sm"
            lineHeight="20px"
            overflowWrap="anywhere"
          >
            {item}
          </Text>
        ))}
      </VStack>
    </Box>
  );
}

function ActionCard(props: {
  action: any;
  lng: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const category = actionCategory(props.action, props.t);
  const description = props.action?.description;
  const explanation = actionExplanation(props.action, props.lng);
  const primaryPurposes = stringList(props.action?.primaryPurposes).map(
    (purpose) => translatedIdentifier(purpose, "primary-purpose", props.t),
  );
  const kpis = stringList(props.action?.keyPerformanceIndicators);
  const mandates = stringList(props.action?.powersAndMandates);
  const impacts = impactEntries(props.action, props.t);
  const cost = props.action?.costInvestmentNeeded
    ? translatedLevel(props.action.costInvestmentNeeded, "cost-level", props.t)
    : "";
  const timeline = props.action?.timelineForImplementation
    ? translatedLevel(
        props.action.timelineForImplementation,
        "timeline",
        props.t,
      )
    : "";
  const hasDetails =
    Boolean(description) ||
    Boolean(explanation) ||
    primaryPurposes.length > 0 ||
    kpis.length > 0 ||
    mandates.length > 0 ||
    impacts.length > 0 ||
    Boolean(cost) ||
    Boolean(timeline);

  return (
    <Box
      p={3}
      borderWidth="1px"
      borderColor="border.overlay"
      borderRadius="8px"
      bg="base.light"
    >
      <HStack align="start" justify="space-between" gap={3}>
        <Text fontWeight="semibold" color="content.primary">
          {props.action.name}
        </Text>
        <Badge colorPalette={props.action.isSelected ? "green" : "gray"}>
          #{props.action.rank}
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

      <Button
        mt={3}
        size="xs"
        variant="ghost"
        color="interactive.secondary"
        px={0}
        minW="auto"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? props.t("hide-details") : props.t("see-more-details")}
        <Icon
          as={MdExpandMore}
          boxSize={4}
          transform={isOpen ? "rotate(180deg)" : undefined}
          transition="transform 0.15s ease"
        />
      </Button>

      {isOpen ? (
        <VStack
          align="stretch"
          gap={3}
          mt={3}
          pt={3}
          borderTopWidth="1px"
          borderColor="border.overlay"
        >
          {!hasDetails ? (
            <Text color="content.tertiary" fontSize="body.sm">
              {props.t("no-action-details")}
            </Text>
          ) : (
            <>
              {description ? (
                <DetailValue label={props.t("action-description")}>
                  {description}
                </DetailValue>
              ) : null}
              {explanation ? (
                <DetailValue label={props.t("action-explanation")}>
                  {explanation}
                </DetailValue>
              ) : null}
              <DetailList
                label={props.t("action-purpose")}
                items={primaryPurposes}
              />
              <DetailList label={props.t("impact")} items={impacts} />
              {cost ? (
                <DetailValue label={props.t("cost")}>{cost}</DetailValue>
              ) : null}
              {timeline ? (
                <DetailValue label={props.t("timeline-label")}>
                  {timeline}
                </DetailValue>
              ) : null}
              <DetailList
                label={props.t("key-performance-indicators")}
                items={kpis}
              />
              <DetailList
                label={props.t("powers-and-mandates")}
                items={mandates}
              />
            </>
          )}
        </VStack>
      ) : null}
    </Box>
  );
}

function ActionList(props: {
  title: string;
  data: any;
  lng: string;
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
          actions.map((action: any) => (
            <ActionCard
              key={action.id ?? action.actionId}
              action={action}
              lng={props.lng}
              t={props.t}
            />
          ))
        )}
      </VStack>
    </Box>
  );
}

export function HiapContextPanel(props: {
  city: any;
  inventory: any;
  hiapData: any;
  lng: string;
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
          lng={props.lng}
          t={props.t}
        />
        <ActionList
          title={props.t("top-adaptation-actions")}
          data={adaptation}
          lng={props.lng}
          t={props.t}
        />
      </VStack>
    </Box>
  );
}
