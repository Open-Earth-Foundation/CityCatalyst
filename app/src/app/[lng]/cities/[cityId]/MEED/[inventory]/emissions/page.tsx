"use client";
import React, { useEffect, useState } from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  IconButton,
  SimpleGrid,
  Table,
  VStack,
} from "@chakra-ui/react";
import {
  LuChartPie,
  LuChevronDown,
  LuChevronRight,
  LuRotateCw,
  LuTriangleAlert,
} from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import type { TFunction } from "i18next";
import { api } from "@/services/api";
import { SECTORS } from "@/util/constants";
import { formatEmissions } from "@/util/helpers";
import type { SectorEmission } from "@/util/types";
import { Skeleton } from "@/components/ui/skeleton";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { CCTerraButton } from "@/components/package/Button/CCTerraButton";
import { MeedWizardPage } from "../../MeedWizardPage";
import { MeedStatusTag } from "../../components/MeedStatusTag";
import {
  MeedStatStripSkeleton,
  MeedTableSkeleton,
} from "../../components/MeedSkeletons";
import { setMeedStepState } from "../../meedLocalState";

/** Applied to every focusable control on this screen. */
const FOCUS_RING = {
  outline: "2px solid",
  outlineColor: "content.link",
  outlineOffset: "2px",
} as const;

/** Column widths, summing to 100%, so the header and rows line up. */
const COLUMN_WIDTHS = {
  sector: "46%",
  emissions: "20%",
  share: "14%",
  status: "20%",
} as const;

/** Failure state for a query that came back with an error. */
function EmissionsErrorCard({
  title,
  body,
  retryLabel,
  onRetry,
}: {
  title: string;
  body: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <Card.Root borderColor="border.neutral">
      <Card.Body>
        <VStack gap="12px" py="40px" px="24px" textAlign="center">
          <Icon
            as={LuTriangleAlert}
            boxSize="32px"
            color="sentiment.negativeDefault"
          />
          <TitleMedium color="content.primary">{title}</TitleMedium>
          <BodyMedium color="content.secondary" maxW="480px">
            {body}
          </BodyMedium>
          <CCTerraButton
            variant="outlined"
            minW="auto"
            px="24px"
            mt="8px"
            onClick={onRetry}
            leftIcon={<Icon as={LuRotateCw} boxSize="16px" />}
            _focusVisible={FOCUS_RING}
          >
            {retryLabel}
          </CCTerraButton>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

/** One GPC sector row with a lazily-loaded sub-sector breakdown. */
function SectorRow({
  inventoryId,
  sectorKey,
  referenceNumber,
  emissions,
  totalEmissions,
  t,
}: {
  inventoryId: string;
  sectorKey: string;
  referenceNumber: string;
  emissions: SectorEmission | undefined;
  totalEmissions: number;
  t: TFunction;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasData = !!emissions && Number(emissions.co2eq) > 0;

  const {
    data: breakdown,
    isLoading: isBreakdownLoading,
    isError: isBreakdownError,
    refetch: refetchBreakdown,
  } = api.useGetSectorBreakdownQuery(
    { inventoryId, sector: sectorKey },
    { skip: !expanded || !hasData },
  );

  const co2eq = hasData ? Number(emissions!.co2eq) : null;
  const share =
    co2eq !== null && totalEmissions > 0
      ? Math.round((co2eq / totalEmissions) * 100)
      : null;

  return (
    <>
      <Table.Row>
        <Table.Cell>
          <HStack gap="8px">
            {hasData ? (
              <IconButton
                aria-label={t(expanded ? "collapse-sector" : "expand-sector")}
                aria-expanded={expanded}
                size="2xs"
                variant="ghost"
                color="content.secondary"
                _hover={{ bg: "background.neutral", color: "content.link" }}
                _focusVisible={FOCUS_RING}
                onClick={() => setExpanded((v) => !v)}
              >
                <Icon as={expanded ? LuChevronDown : LuChevronRight} />
              </IconButton>
            ) : (
              <Box w="24px" />
            )}
            <VStack alignItems="flex-start" gap="0">
              <BodyMedium color="content.primary">
                {t(`sector-${sectorKey}`)}
              </BodyMedium>
              <Caption color="content.tertiary">{referenceNumber}</Caption>
            </VStack>
          </HStack>
        </Table.Cell>
        <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
          <BodyMedium color={hasData ? "content.primary" : "content.tertiary"}>
            {co2eq !== null
              ? `${formatEmissions(co2eq).value} ${formatEmissions(co2eq).unit}`
              : "—"}
          </BodyMedium>
        </Table.Cell>
        <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
          <BodyMedium color={hasData ? "content.primary" : "content.tertiary"}>
            {share !== null ? `${share}%` : "—"}
          </BodyMedium>
        </Table.Cell>
        <Table.Cell textAlign="end">
          <MeedStatusTag tone={hasData ? "positive" : "neutral"}>
            {t(hasData ? "sector-status-data" : "sector-status-no-data")}
          </MeedStatusTag>
        </Table.Cell>
      </Table.Row>

      {expanded &&
        isBreakdownLoading &&
        Array.from({ length: 3 }).map((_, i) => (
          <Table.Row key={`skeleton-${i}`} bg="background.neutral">
            <Table.Cell>
              <Box pl="32px">
                <Skeleton height="14px" width="70%" />
              </Box>
            </Table.Cell>
            <Table.Cell>
              <Skeleton height="14px" width="80%" ml="auto" />
            </Table.Cell>
            <Table.Cell>
              <Skeleton height="14px" width="60%" ml="auto" />
            </Table.Cell>
            <Table.Cell />
          </Table.Row>
        ))}

      {expanded && isBreakdownError && (
        <Table.Row bg="background.neutral">
          <Table.Cell colSpan={4}>
            <HStack gap="8px" pl="32px">
              <Icon
                as={LuTriangleAlert}
                boxSize="14px"
                color="sentiment.negativeDefault"
              />
              <BodyMedium color="content.secondary">
                {t("breakdown-error")}
              </BodyMedium>
              <CCTerraButton
                variant="text"
                minW="auto"
                h="24px"
                px="4px"
                onClick={() => refetchBreakdown()}
                _focusVisible={FOCUS_RING}
              >
                {t("retry")}
              </CCTerraButton>
            </HStack>
          </Table.Cell>
        </Table.Row>
      )}

      {expanded &&
        !isBreakdownError &&
        breakdown?.byScope?.map((row, idx) => (
          <Table.Row key={`${row.activityTitle}-${idx}`} bg="background.neutral">
            <Table.Cell>
              <VStack alignItems="flex-start" gap="0" pl="32px">
                <BodyMedium color="content.secondary">
                  {row.activityTitle}
                </BodyMedium>
                {row.datasource_name && (
                  <Caption color="content.tertiary">
                    {row.datasource_name}
                  </Caption>
                )}
              </VStack>
            </Table.Cell>
            <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
              <BodyMedium color="content.secondary">
                {`${formatEmissions(Number(row.totalEmissions)).value} ${formatEmissions(Number(row.totalEmissions)).unit}`}
              </BodyMedium>
            </Table.Cell>
            <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
              <BodyMedium color="content.secondary">
                {row.percentage != null ? `${row.percentage}%` : "—"}
              </BodyMedium>
            </Table.Cell>
            <Table.Cell />
          </Table.Row>
        ))}
    </>
  );
}

function EmissionsReviewContent(props: { lng: string; inventoryId: string }) {
  const { lng, inventoryId } = props;
  const { t } = useTranslation(lng, "meed");

  const { data: inventory } = api.useGetInventoryQuery(inventoryId, {
    skip: !inventoryId,
  });
  const {
    data: results,
    isLoading,
    isError,
    refetch,
  } = api.useGetResultsQuery(inventoryId, {
    skip: !inventoryId,
  });

  const bySector = results?.totalEmissions?.bySector ?? [];
  const totalEmissions = Number(results?.totalEmissions?.total ?? 0);
  const sectorsWithData = SECTORS.filter((s) =>
    bySector.some((e) => e.sectorName === s.name && Number(e.co2eq) > 0),
  ).length;
  const formattedTotal = formatEmissions(totalEmissions);

  // Feed the overview and the pre-flight summary with live completion.
  const stepSub = t("emissions-step-sub", {
    n: sectorsWithData,
    total: SECTORS.length,
  });
  useEffect(() => {
    if (!inventoryId || isLoading || isError) return;
    setMeedStepState(inventoryId, "emissions", {
      progress: Math.round((sectorsWithData / SECTORS.length) * 100),
      sub: stepSub,
    });
  }, [inventoryId, isLoading, isError, sectorsWithData, stepSub]);

  return (
    <VStack alignItems="stretch" gap="24px">
      <VStack alignItems="stretch" gap="12px">
        <BodyLarge color="content.secondary">
          {t("emissions-description")}
        </BodyLarge>
        <HStack
          gap="8px"
          bg="background.neutral"
          borderRadius="rounded"
          px="12px"
          py="6px"
          alignSelf="flex-start"
        >
          <Icon as={LuChartPie} boxSize="14px" color="content.secondary" />
          <Caption color="content.secondary">
            {t("emissions-ranking-weight")}
          </Caption>
        </HStack>
      </VStack>

      {isError ? (
        <EmissionsErrorCard
          title={t("emissions-error-title")}
          body={t("emissions-error-body")}
          retryLabel={t("retry")}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          {isLoading ? (
            <Card.Root borderColor="border.overlay">
              <Card.Body>
                <MeedStatStripSkeleton items={3} />
              </Card.Body>
            </Card.Root>
          ) : (
            <Card.Root borderColor="border.overlay">
              <Card.Body>
                <SimpleGrid columns={{ base: 2, md: 3 }} gap="16px">
                  <VStack alignItems="flex-start" gap="4px">
                    <Overline color="content.tertiary">
                      {t("total-ghg-emissions")}
                    </Overline>
                    <TitleMedium
                      color="content.primary"
                      fontVariantNumeric="tabular-nums"
                    >
                      {`${formattedTotal.value} ${formattedTotal.unit}`}
                    </TitleMedium>
                  </VStack>
                  <VStack alignItems="flex-start" gap="4px">
                    <Overline color="content.tertiary">
                      {t("inventory-year")}
                    </Overline>
                    <TitleMedium
                      color="content.primary"
                      fontVariantNumeric="tabular-nums"
                    >
                      {inventory?.year ?? "—"}
                    </TitleMedium>
                  </VStack>
                  <VStack alignItems="flex-start" gap="4px">
                    <Overline color="content.tertiary">
                      {t("sectors-with-data")}
                    </Overline>
                    <TitleMedium
                      color="content.primary"
                      fontVariantNumeric="tabular-nums"
                    >
                      {t("sectors-count", {
                        done: sectorsWithData,
                        total: SECTORS.length,
                      })}
                    </TitleMedium>
                  </VStack>
                </SimpleGrid>
              </Card.Body>
            </Card.Root>
          )}

          {isLoading ? (
            <MeedTableSkeleton rows={5} />
          ) : (
            <Card.Root overflow="hidden" borderColor="border.neutral">
              <Table.Root
                size="sm"
                css={{ "& th, & td": { borderColor: "border.overlay" } }}
              >
                <Table.Header>
                  <Table.Row bg="background.neutral">
                    <Table.ColumnHeader
                      width={COLUMN_WIDTHS.sector}
                      borderColor="border.neutral"
                    >
                      <Overline color="content.secondary">
                        {t("column-sector")}
                      </Overline>
                    </Table.ColumnHeader>
                    <Table.ColumnHeader
                      width={COLUMN_WIDTHS.emissions}
                      textAlign="end"
                      borderColor="border.neutral"
                    >
                      <Overline color="content.secondary">
                        {t("column-emissions")}
                      </Overline>
                    </Table.ColumnHeader>
                    <Table.ColumnHeader
                      width={COLUMN_WIDTHS.share}
                      textAlign="end"
                      borderColor="border.neutral"
                    >
                      <Overline color="content.secondary">
                        {t("column-share")}
                      </Overline>
                    </Table.ColumnHeader>
                    <Table.ColumnHeader
                      width={COLUMN_WIDTHS.status}
                      textAlign="end"
                      borderColor="border.neutral"
                    >
                      <Overline color="content.secondary">
                        {t("column-status")}
                      </Overline>
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {SECTORS.map((sector) => (
                    <SectorRow
                      key={sector.name}
                      inventoryId={inventoryId}
                      sectorKey={sector.name}
                      referenceNumber={sector.referenceNumber}
                      emissions={bySector.find(
                        (e) => e.sectorName === sector.name,
                      )}
                      totalEmissions={totalEmissions}
                      t={t}
                    />
                  ))}
                </Table.Body>
              </Table.Root>
            </Card.Root>
          )}
        </>
      )}
    </VStack>
  );
}

export default function Page(props: {
  params: Promise<{ lng: string; cityId: string; inventory: string }>;
}) {
  const { lng, inventory: inventoryId } = React.use(props.params);
  return (
    <MeedWizardPage params={props.params} stepKey="emissions">
      <EmissionsReviewContent lng={lng} inventoryId={inventoryId} />
    </MeedWizardPage>
  );
}
