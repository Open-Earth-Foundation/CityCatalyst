"use client";
import React from "react";
import { Box, Card, HStack, Table, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedMeter } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedMeter";
import {
  MeedStatusTag,
  type MeedTone,
} from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { MeedChartTip } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedChartTip";
import type { CityFixture, RiskCellKey } from "../_lib/types";
import { RISK_CELLS, SECTOR_HEX, SECTOR_LABEL } from "../_lib/riskCells";
import { pick } from "../_lib/localized";

export type RiskScenario = "today" | "2030" | "2050";

export function indexTone(value: number): MeedTone {
  if (value >= 0.7) return "negative";
  if (value >= 0.4) return "warning";
  return "positive";
}

/**
 * The city's AdaptaBrasil risk profile: one row per risk cell with the three
 * components and the published index. This is the adaptation track's
 * counterpart to the emissions-by-sector table — the input every Impact score
 * is read from — so it gets the same prominence and the same "one number per
 * row" discipline.
 */
export function RiskCellTable({
  city,
  lng,
  t,
  scenario,
  highlight,
}: {
  city: CityFixture;
  lng: string;
  t: TFunction;
  scenario: RiskScenario;
  /** Cells credited by the action being inspected, when any. */
  highlight?: RiskCellKey[];
}) {
  const highlighted = new Set(highlight ?? []);
  return (
    <Card.Root overflow="hidden" borderColor="border.neutral">
      <Table.Root size="md" tableLayout="fixed">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="36%">
              {t("risk-col-cell")}
            </Table.ColumnHeader>
            <Table.ColumnHeader display={{ base: "none", md: "table-cell" }}>
              {t("risk-col-hazard")}
            </Table.ColumnHeader>
            <Table.ColumnHeader display={{ base: "none", md: "table-cell" }}>
              {t("risk-col-exposure")}
            </Table.ColumnHeader>
            <Table.ColumnHeader display={{ base: "none", md: "table-cell" }}>
              {t("risk-col-vulnerability")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t(`risk-col-index-${scenario}`)}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {RISK_CELLS.map((cell) => {
            const reading = city.risk[cell.key];
            const index =
              reading === undefined || reading === null
                ? null
                : scenario === "today"
                  ? reading.index
                  : scenario === "2030"
                    ? reading.index2030
                    : reading.index2050;
            const isHighlighted = highlighted.has(cell.key);
            return (
              <Table.Row
                key={cell.key}
                bg={isHighlighted ? "background.neutral" : undefined}
              >
                <Table.Cell>
                  <HStack gap="s" alignItems="flex-start">
                    <Box
                      boxSize="10px"
                      mt="6px"
                      borderRadius="full"
                      bg={SECTOR_HEX[cell.sector]}
                      flexShrink={0}
                    />
                    <VStack alignItems="flex-start" gap="0" minW={0}>
                      <LabelMedium color="content.primary">
                        {pick(cell.label, lng)}
                      </LabelMedium>
                      <Caption color="content.tertiary">
                        {pick(SECTOR_LABEL[cell.sector], lng)}
                      </Caption>
                    </VStack>
                  </HStack>
                </Table.Cell>
                {(["hazard", "exposure", "vulnerability"] as const).map(
                  (component) => (
                    <Table.Cell
                      key={component}
                      display={{ base: "none", md: "table-cell" }}
                    >
                      {reading && cell.hasComponents ? (
                        <BodySmall
                          color={
                            reading[component] === 0
                              ? "content.tertiary"
                              : "content.secondary"
                          }
                          fontVariantNumeric="tabular-nums"
                        >
                          {reading[component].toFixed(2)}
                        </BodySmall>
                      ) : (
                        <Caption color="content.tertiary">
                          {t("risk-no-components")}
                        </Caption>
                      )}
                    </Table.Cell>
                  ),
                )}
                <Table.Cell>
                  {index === null ? (
                    <MeedStatusTag tone="neutral">
                      {t("risk-no-data")}
                    </MeedStatusTag>
                  ) : (
                    <MeedMeter
                      value={index}
                      tone={indexTone(index)}
                      valueText={index.toFixed(2)}
                      ariaLabel={`${pick(cell.label, lng)}: ${index.toFixed(2)}`}
                    />
                  )}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Card.Root>
  );
}

/**
 * Compact visual for the home card: the twelve cells as a colour-coded strip,
 * highest index first, with the hover explaining each swatch.
 */
export function RiskProfileStrip({
  city,
  lng,
  t,
}: {
  city: CityFixture;
  lng: string;
  t: TFunction;
}) {
  const rows = RISK_CELLS.map((cell) => ({
    cell,
    index: city.risk[cell.key]?.index ?? null,
  }))
    .filter(
      (r): r is { cell: (typeof RISK_CELLS)[number]; index: number } =>
        r.index !== null,
    )
    .sort((a, b) => b.index - a.index);
  return (
    <MeedChartTip
      title={t("risk-strip-tip-title")}
      rows={rows.map(({ cell, index }) => ({
        label: pick(cell.label, lng),
        swatch: SECTOR_HEX[cell.sector],
        value: index.toFixed(2),
      }))}
      note={t("risk-strip-tip-note")}
    >
      <VStack
        alignItems="stretch"
        gap="xs"
        role="img"
        aria-label={t("risk-strip-tip-title")}
      >
        <HStack
          gap="2px"
          h="10px"
          w="full"
          borderRadius="pill"
          overflow="hidden"
        >
          {rows.map(({ cell, index }) => (
            <Box
              key={cell.key}
              h="full"
              flex={Math.max(index, 0.05)}
              bg={SECTOR_HEX[cell.sector]}
              opacity={0.35 + index * 0.65}
            />
          ))}
        </HStack>
        <HStack justifyContent="space-between">
          <Overline color="content.tertiary">
            {t("risk-strip-top", {
              cell: pick(rows[0].cell.label, lng),
              value: rows[0].index.toFixed(2),
            })}
          </Overline>
        </HStack>
      </VStack>
    </MeedChartTip>
  );
}
