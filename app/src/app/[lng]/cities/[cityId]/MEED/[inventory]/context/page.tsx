"use client";
import React, { useMemo } from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  SimpleGrid,
  Table,
  Tag,
  VStack,
} from "@chakra-ui/react";
import {
  LuMoveRight,
  LuTrendingUp,
  LuTriangleAlert,
  LuUsers,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import { useTranslation } from "@/i18n/client";
import { useGetMeedCityAttributesQuery } from "@/services/api";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedWizardPage } from "../../MeedWizardPage";
import {
  buildIndicators,
  categoryLabelKey,
  CATEGORY_PALETTE,
  extractIndicatorFields,
  formatIndicatorValue,
  KEY_INDICATOR_KEYS,
  sortThemes,
  type IndicatorConcern,
  type MeedIndicator,
} from "./indicators";

function ConcernIcon({ concern }: { concern: IndicatorConcern }) {
  if (concern === "risk") {
    return <Icon as={LuTriangleAlert} boxSize="14px" color="content.secondary" />;
  }
  if (concern === "opportunity") {
    return (
      <Icon as={LuTrendingUp} boxSize="14px" color="sentiment.positiveDefault" />
    );
  }
  return <Icon as={LuMoveRight} boxSize="14px" color="content.tertiary" />;
}

function CategoryTag({
  indicator,
  t,
}: {
  indicator: MeedIndicator;
  t: TFunction;
}) {
  return (
    <Tag.Root colorPalette={CATEGORY_PALETTE[indicator.category]} size="sm">
      <Tag.Label>{t(categoryLabelKey(indicator.category))}</Tag.Label>
    </Tag.Root>
  );
}

/** Summary cards for the handful of headline indicators. */
function KeyIndicatorCards({
  indicators,
  t,
}: {
  indicators: MeedIndicator[];
  t: TFunction;
}) {
  const keyIndicators = KEY_INDICATOR_KEYS.map((key) =>
    indicators.find((i) => i.key === key),
  ).filter((i): i is MeedIndicator => i !== undefined);

  if (keyIndicators.length === 0) return null;

  return (
    <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} gap="12px">
      {keyIndicators.map((ind) => (
        <Card.Root key={ind.key}>
          <Card.Body p="16px">
            <VStack alignItems="flex-start" gap="6px">
              <LabelLarge color="content.tertiary">{ind.label}</LabelLarge>
              <BodyLarge color="content.primary" fontWeight="bold">
                {formatIndicatorValue(ind, t)}
              </BodyLarge>
              <CategoryTag indicator={ind} t={t} />
            </VStack>
          </Card.Body>
        </Card.Root>
      ))}
    </SimpleGrid>
  );
}

function IndicatorsTable({
  indicators,
  t,
}: {
  indicators: MeedIndicator[];
  t: TFunction;
}) {
  const themes = sortThemes([...new Set(indicators.map((i) => i.themeKey))]);

  return (
    <Card.Root overflow="hidden">
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{t("column-indicator")}</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">
              {t("column-value")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>{t("column-relative-level")}</Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("column-climate-relevance")}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {themes.map((themeKey) => {
            const rows = indicators.filter((i) => i.themeKey === themeKey);
            return (
              <React.Fragment key={themeKey}>
                <Table.Row bg="background.neutral">
                  <Table.Cell colSpan={4}>
                    <LabelLarge color="content.secondary">
                      {t(`theme-${themeKey}`)}
                    </LabelLarge>
                  </Table.Cell>
                </Table.Row>
                {rows.map((ind) => (
                  <Table.Row key={ind.key}>
                    <Table.Cell minW="200px">
                      <VStack alignItems="flex-start" gap="0">
                        <BodyMedium color="content.primary">
                          {ind.label}
                        </BodyMedium>
                        <BodyMedium fontSize="xs" color="content.tertiary">
                          {ind.source}
                        </BodyMedium>
                      </VStack>
                    </Table.Cell>
                    <Table.Cell
                      textAlign="end"
                      fontVariantNumeric="tabular-nums"
                      whiteSpace="nowrap"
                    >
                      <BodyMedium color="content.primary" fontWeight="semibold">
                        {formatIndicatorValue(ind, t)}
                      </BodyMedium>
                    </Table.Cell>
                    <Table.Cell whiteSpace="nowrap">
                      <CategoryTag indicator={ind} t={t} />
                    </Table.Cell>
                    <Table.Cell>
                      <HStack gap="6px" alignItems="flex-start">
                        <Box pt="2px">
                          <ConcernIcon concern={ind.concern} />
                        </Box>
                        <BodyMedium color="content.secondary">
                          {ind.relevance}
                        </BodyMedium>
                      </HStack>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </React.Fragment>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Card.Root>
  );
}

/** Shown when the Global API has no socioeconomic data for this city. */
function NoIndicatorsCard({ t }: { t: TFunction }) {
  return (
    <Card.Root>
      <Card.Body py="64px">
        <VStack gap="12px" textAlign="center" maxW="480px" mx="auto">
          <Icon as={LuUsers} boxSize="40px" color="content.tertiary" />
          <TitleMedium color="content.primary">
            {t("no-indicators-title")}
          </TitleMedium>
          <BodyMedium color="content.secondary">
            {t("no-indicators-description")}
          </BodyMedium>
          <BodyMedium color="content.tertiary">
            {t("no-indicators-continue")}
          </BodyMedium>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

function SocioeconomicContextContent(props: { lng: string; cityId: string }) {
  const { lng, cityId } = props;
  const { t } = useTranslation(lng, "meed-context");

  const { data, isLoading } = useGetMeedCityAttributesQuery(
    { cityId },
    { skip: !cityId },
  );

  const indicators = useMemo(() => {
    const fields = extractIndicatorFields(data);
    return fields ? buildIndicators(fields, t) : [];
  }, [data, t]);

  if (isLoading) {
    return (
      <Card.Root>
        <Card.Body>
          <BodyLarge color="content.tertiary">
            {t("loading-indicators")}
          </BodyLarge>
        </Card.Body>
      </Card.Root>
    );
  }

  if (indicators.length === 0) {
    return (
      <VStack alignItems="stretch" gap="24px">
        <BodyLarge color="content.secondary">
          {t("context-description")}
        </BodyLarge>
        <NoIndicatorsCard t={t} />
      </VStack>
    );
  }

  return (
    <VStack alignItems="stretch" gap="24px">
      <BodyLarge color="content.secondary">
        {t("context-description")}
      </BodyLarge>

      <HStack gap="12px" flexWrap="wrap">
        <Tag.Root colorPalette="green" size="md">
          <Tag.Label>
            {t("indicators-loaded", { n: indicators.length })}
          </Tag.Label>
        </Tag.Root>
        <HStack
          gap="8px"
          bg="background.neutral"
          borderRadius="6px"
          px="12px"
          py="6px"
        >
          <Icon as={LuUsers} boxSize="14px" color="content.secondary" />
          <BodyMedium color="content.secondary">
            {t("feasibility-note")}
          </BodyMedium>
        </HStack>
      </HStack>

      <KeyIndicatorCards indicators={indicators} t={t} />
      <IndicatorsTable indicators={indicators} t={t} />
    </VStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId } = React.use(props.params);
  return (
    <MeedWizardPage params={props.params} stepKey="context">
      <SocioeconomicContextContent lng={lng} cityId={cityId} />
    </MeedWizardPage>
  );
}
