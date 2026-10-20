"use client";
import React from "react";
import { Box, SimpleGrid, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { SelectActionCheckbox } from "@/app/[lng]/cities/[cityId]/MEED/[inventory]/results/components/SelectActionCheckbox";
import { pick } from "../../_lib/localized";
import { Level } from "./Level";
import { SectorLabel } from "./SectorIcon";
import { TextLink } from "./TextLink";
import { COST_TONE, GAP_TONE, POLICY_TONE, type RankedRow } from "./rows";

/**
 * Section 2 of BR-N1: the three actions that rank first. Each card says
 * which risk the action reduces and the city's level there, then the four
 * delivery facts as levels in words. No score, no rank number.
 */
export function TopActions({
  rows,
  lng,
  t,
  tResults,
  selectedIds,
  onToggleSelect,
  onOpen,
}: {
  rows: RankedRow[];
  lng: string;
  t: TFunction;
  tResults: TFunction;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onOpen: (row: RankedRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} gap="xl" alignItems="stretch">
      {rows.map((row) => {
        const name = pick(row.action.name, lng);
        const isSelected = selectedIds.includes(row.action.id);
        return (
          <VStack
            key={row.action.id}
            alignItems="stretch"
            gap="l"
            p="xl"
            bg="base.light"
            borderRadius="rounded"
            boxShadow="1dp"
            borderWidth="1px"
            borderColor={isSelected ? "content.link" : "transparent"}
            containerType="inline-size"
          >
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="flex-start"
              gap="m"
            >
              <VStack alignItems="flex-start" gap="xs" minW={0}>
                <SectorLabel sector={row.action.sector}>
                  {row.sectorLabel}
                </SectorLabel>
                <LabelLarge color="content.primary">{name}</LabelLarge>
              </VStack>
              <SelectActionCheckbox
                checked={isSelected}
                onToggle={() => onToggleSelect(row.action.id)}
                ariaLabel={tResults("select-action", { name })}
              />
            </Box>
            <VStack alignItems="flex-start" gap="xs">
              <Overline color="content.tertiary">
                {t("next-why-short")}
              </Overline>
              <Level tone={row.riskTone}>
                {t("next-addresses", { hazard: row.hazardLabel })} ·{" "}
                {t("next-addresses-level", {
                  level: t(`risk-level-${row.riskTone}`),
                })}
              </Level>
              <BodySmall color="content.secondary" lineClamp={2}>
                {pick(row.action.description, lng)}
              </BodySmall>
            </VStack>
            <Box flex="1" />
            {/* Two columns only when the card itself has room, so the
                labels never wrap when the preferences panel narrows it. */}
            <SimpleGrid
              columns={1}
              css={{
                "@container (min-width: 300px)": {
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                },
              }}
              gap="m"
              pt="l"
              borderTopWidth="1px"
              borderColor="border.overlay"
            >
              <Level
                label={t("next-fact-cost")}
                info={t("next-info-cost")}
                tone={COST_TONE[row.cost]}
              >
                {t(`next-cost-${row.cost}`)}
              </Level>
              <Level
                label={t("next-fact-legal")}
                info={t("next-info-legal")}
                tone={row.legalTone}
              >
                {row.legalLabel}
              </Level>
              <Level
                label={t("next-fact-funding")}
                info={t("next-info-funding")}
                tone={GAP_TONE[row.funding]}
              >
                {row.fundingLabel}
              </Level>
              <Level
                label={t("next-fact-policy")}
                info={t("next-info-policy")}
                tone={POLICY_TONE[row.policy]}
              >
                {t(`next-policy-${row.policy}`)}
              </Level>
            </SimpleGrid>
            <Box alignSelf="flex-start">
              <TextLink onClick={() => onOpen(row)}>
                {t("next-view-details")}
              </TextLink>
            </Box>
          </VStack>
        );
      })}
    </SimpleGrid>
  );
}
