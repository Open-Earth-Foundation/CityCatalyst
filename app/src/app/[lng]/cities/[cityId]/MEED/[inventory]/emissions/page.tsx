"use client";
import React, { useState } from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  IconButton,
  Table,
  Tag,
  VStack,
} from "@chakra-ui/react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import type { TFunction } from "i18next";
import { api } from "@/services/api";
import { SECTORS } from "@/util/constants";
import { formatEmissions } from "@/util/helpers";
import type { SectorEmission } from "@/util/types";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { MeedWizardPage } from "../../MeedWizardPage";

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

  const { data: breakdown, isLoading: isBreakdownLoading } =
    api.useGetSectorBreakdownQuery(
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
                size="2xs"
                variant="ghost"
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
              <BodyMedium fontSize="xs" color="content.tertiary">
                {referenceNumber}
              </BodyMedium>
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
        <Table.Cell textAlign="end">
          <BodyMedium color={hasData ? "content.primary" : "content.tertiary"}>
            {share !== null ? `${share}%` : "—"}
          </BodyMedium>
        </Table.Cell>
        <Table.Cell textAlign="end">
          {hasData ? (
            <Tag.Root colorPalette="green" size="sm">
              <Tag.Label>{t("sector-status-data")}</Tag.Label>
            </Tag.Root>
          ) : (
            <Tag.Root colorPalette="gray" size="sm">
              <Tag.Label>{t("sector-status-no-data")}</Tag.Label>
            </Tag.Root>
          )}
        </Table.Cell>
      </Table.Row>
      {expanded && isBreakdownLoading && (
        <Table.Row bg="background.neutral">
          <Table.Cell colSpan={4}>
            <BodyMedium color="content.tertiary" pl="32px">
              {t("loading-breakdown")}
            </BodyMedium>
          </Table.Cell>
        </Table.Row>
      )}
      {expanded &&
        breakdown?.byScope?.map((row, idx) => (
          <Table.Row key={`${row.activityTitle}-${idx}`} bg="background.neutral">
            <Table.Cell>
              <VStack alignItems="flex-start" gap="0" pl="32px">
                <BodyMedium color="content.secondary">
                  {row.activityTitle}
                </BodyMedium>
                {row.datasource_name && (
                  <BodyMedium fontSize="xs" color="content.tertiary">
                    {row.datasource_name}
                  </BodyMedium>
                )}
              </VStack>
            </Table.Cell>
            <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
              <BodyMedium color="content.secondary">
                {`${formatEmissions(Number(row.totalEmissions)).value} ${formatEmissions(Number(row.totalEmissions)).unit}`}
              </BodyMedium>
            </Table.Cell>
            <Table.Cell textAlign="end">
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
  const { data: results, isLoading } = api.useGetResultsQuery(inventoryId, {
    skip: !inventoryId,
  });

  const bySector = results?.totalEmissions?.bySector ?? [];
  const totalEmissions = Number(results?.totalEmissions?.total ?? 0);
  const sectorsWithData = SECTORS.filter((s) =>
    bySector.some((e) => e.sectorName === s.name && Number(e.co2eq) > 0),
  ).length;
  const formattedTotal = formatEmissions(totalEmissions);

  return (
    <VStack alignItems="stretch" gap="24px">
      <BodyLarge color="content.secondary">
        {t("emissions-description")}
      </BodyLarge>

      <Card.Root>
        <Card.Body>
          <HStack gap="48px" flexWrap="wrap">
            <VStack alignItems="flex-start" gap="4px">
              <LabelLarge color="content.tertiary">
                {t("total-ghg-emissions")}
              </LabelLarge>
              <BodyLarge color="content.primary" fontWeight="bold">
                {isLoading
                  ? "…"
                  : `${formattedTotal.value} ${formattedTotal.unit}`}
              </BodyLarge>
            </VStack>
            <VStack alignItems="flex-start" gap="4px">
              <LabelLarge color="content.tertiary">
                {t("inventory-year")}
              </LabelLarge>
              <BodyLarge color="content.primary" fontWeight="bold">
                {inventory?.year ?? "—"}
              </BodyLarge>
            </VStack>
            <VStack alignItems="flex-start" gap="4px">
              <LabelLarge color="content.tertiary">
                {t("sectors-with-data")}
              </LabelLarge>
              <BodyLarge color="content.primary" fontWeight="bold">
                {t("sectors-count", {
                  done: sectorsWithData,
                  total: SECTORS.length,
                })}
              </BodyLarge>
            </VStack>
          </HStack>
        </Card.Body>
      </Card.Root>

      <Card.Root overflow="hidden">
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>{t("column-sector")}</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("column-emissions")}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("column-share")}
              </Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">
                {t("column-status")}
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
                emissions={bySector.find((e) => e.sectorName === sector.name)}
                totalEmissions={totalEmissions}
                t={t}
              />
            ))}
          </Table.Body>
        </Table.Root>
      </Card.Root>
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
