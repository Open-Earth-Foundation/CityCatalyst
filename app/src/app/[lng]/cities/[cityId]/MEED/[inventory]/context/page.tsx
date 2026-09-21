"use client";
import React, { useEffect, useMemo } from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  SimpleGrid,
  Table,
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
import { Caption } from "@/components/package/Texts/Caption";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedWizardPage } from "../../MeedWizardPage";
import { MeedStatusTag } from "../../components/MeedStatusTag";
import { MeedErrorCard } from "../../components/MeedErrorCard";
import {
  MeedStatStripSkeleton,
  MeedTableSkeleton,
} from "../../components/MeedSkeletons";
import { setMeedStepState } from "../../meedLocalState";
import {
  buildIndicators,
  categoryLabelKey,
  CATEGORY_TONE,
  extractIndicatorFields,
  formatIndicatorValue,
  KEY_INDICATOR_KEYS,
  sortThemes,
  type IndicatorConcern,
  type MeedIndicator,
} from "./indicators";

/** Column widths, summing to 100%, so the header and rows line up. */
const COLUMN_WIDTHS = {
  indicator: "32%",
  value: "14%",
  level: "16%",
  relevance: "38%",
} as const;

function ConcernIcon({ concern }: { concern: IndicatorConcern }) {
  if (concern === "risk") {
    return (
      <Icon
        as={LuTriangleAlert}
        boxSize="14px"
        color="sentiment.warningDefault"
      />
    );
  }
  if (concern === "opportunity") {
    return (
      <Icon
        as={LuTrendingUp}
        boxSize="14px"
        color="sentiment.positiveDefault"
      />
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
    <MeedStatusTag tone={CATEGORY_TONE[indicator.category]}>
      {t(categoryLabelKey(indicator.category))}
    </MeedStatusTag>
  );
}

/** Stat blocks for the handful of headline indicators. */
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
    <SimpleGrid columns={{ base: 2, md: 4 }} gap="m">
      {keyIndicators.map((ind) => (
        <Card.Root key={ind.key} borderColor="border.overlay" h="full">
          <Card.Body p="m">
            <VStack alignItems="flex-start" gap="s">
              <Overline color="content.tertiary">{ind.label}</Overline>
              <TitleMedium
                color="content.primary"
                fontVariantNumeric="tabular-nums"
              >
                {formatIndicatorValue(ind, t)}
              </TitleMedium>
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
    <Card.Root overflow="hidden" borderColor="border.neutral">
      <Table.Root
        size="md"
        css={{ "& th, & td": { borderColor: "border.overlay" } }}
      >
        <Table.Header>
          <Table.Row bg="background.neutral">
            <Table.ColumnHeader
              width={COLUMN_WIDTHS.indicator}
              borderColor="border.neutral"
            >
              <Overline color="content.secondary">
                {t("column-indicator")}
              </Overline>
            </Table.ColumnHeader>
            <Table.ColumnHeader
              width={COLUMN_WIDTHS.value}
              textAlign="end"
              borderColor="border.neutral"
            >
              <Overline color="content.secondary">{t("column-value")}</Overline>
            </Table.ColumnHeader>
            <Table.ColumnHeader
              width={COLUMN_WIDTHS.level}
              borderColor="border.neutral"
            >
              <Overline color="content.secondary">
                {t("column-relative-level")}
              </Overline>
            </Table.ColumnHeader>
            <Table.ColumnHeader
              width={COLUMN_WIDTHS.relevance}
              borderColor="border.neutral"
            >
              <Overline color="content.secondary">
                {t("column-climate-relevance")}
              </Overline>
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {themes.map((themeKey) => {
            const rows = indicators.filter((i) => i.themeKey === themeKey);
            return (
              <React.Fragment key={themeKey}>
                {/* Theme band — the grouping level above the indicator rows. */}
                <Table.Row bg="background.neutral">
                  <Table.Cell
                    colSpan={4}
                    borderTopWidth="1px"
                    borderColor="border.neutral"
                    py="s"
                  >
                    <Overline color="content.secondary">
                      {t(`theme-${themeKey}`)}
                    </Overline>
                  </Table.Cell>
                </Table.Row>
                {rows.map((ind) => (
                  <Table.Row key={ind.key}>
                    <Table.Cell>
                      <VStack alignItems="flex-start" gap="0">
                        <BodyMedium color="content.primary">
                          {ind.label}
                        </BodyMedium>
                        <Caption color="content.tertiary">{ind.source}</Caption>
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
                      <HStack gap="s" alignItems="flex-start">
                        <Box pt="xs">
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
    <Card.Root borderColor="border.neutral">
      <Card.Body py="xxl-4">
        <VStack gap="m" textAlign="center" maxW="480px" mx="auto">
          <Icon as={LuUsers} boxSize="40px" color="content.tertiary" />
          <TitleMedium color="content.primary">
            {t("no-indicators-title")}
          </TitleMedium>
          <BodyMedium color="content.secondary">
            {t("no-indicators-description")}
          </BodyMedium>
          <Caption color="content.tertiary">
            {t("no-indicators-continue")}
          </Caption>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

function SocioeconomicContextContent(props: {
  lng: string;
  cityId: string;
  inventoryId: string;
}) {
  const { lng, cityId, inventoryId } = props;
  const { t } = useTranslation(lng, "meed-context");

  const { data, isLoading, isError, refetch } = useGetMeedCityAttributesQuery(
    { cityId },
    { skip: !cityId },
  );

  const indicators = useMemo(() => {
    const fields = extractIndicatorFields(data);
    return fields ? buildIndicators(fields, t) : [];
  }, [data, t]);

  // Feed the overview and the pre-flight summary with live completion.
  const count = indicators.length;
  const stepSub =
    count > 0 ? t("indicators-loaded", { n: count }) : t("no-indicators-sub");
  useEffect(() => {
    if (!inventoryId || isLoading || isError) return;
    setMeedStepState(inventoryId, "context", {
      progress: count > 0 ? 100 : 0,
      sub: stepSub,
    });
  }, [inventoryId, isLoading, isError, count, stepSub]);

  return (
    <VStack alignItems="stretch" gap="l">
      <VStack alignItems="stretch" gap="m">
        <BodyLarge color="content.secondary">
          {t("context-description")}
        </BodyLarge>
        <HStack
          gap="s"
          bg="background.neutral"
          borderRadius="rounded"
          px="m"
          py="s"
          alignSelf="flex-start"
        >
          <Icon as={LuUsers} boxSize="14px" color="content.secondary" />
          <Caption color="content.secondary">{t("ranking-weight")}</Caption>
        </HStack>
      </VStack>

      {isError ? (
        <MeedErrorCard
          variant="panel"
          title={t("indicators-error-title")}
          body={t("indicators-error-body")}
          retryLabel={t("retry")}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <>
          <MeedStatStripSkeleton items={4} />
          <MeedTableSkeleton rows={6} />
        </>
      ) : indicators.length === 0 ? (
        <NoIndicatorsCard t={t} />
      ) : (
        <>
          <Box>
            <MeedStatusTag tone="positive">
              {t("indicators-loaded", { n: indicators.length })}
            </MeedStatusTag>
          </Box>
          <KeyIndicatorCards indicators={indicators} t={t} />
          <IndicatorsTable indicators={indicators} t={t} />
        </>
      )}
    </VStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, cityId, inventory: inventoryId } = React.use(props.params);
  return (
    <MeedWizardPage params={props.params} stepKey="context">
      <SocioeconomicContextContent
        lng={lng}
        cityId={cityId}
        inventoryId={inventoryId}
      />
    </MeedWizardPage>
  );
}
