"use client";
import React from "react";
import { Box, SimpleGrid, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { LabelLarge } from "@/components/package/Texts/Label";
import type { CityFixture } from "../../_lib/types";
import { RISK_CELLS, SECTOR_LABEL } from "../../_lib/riskCells";
import { pick } from "../../_lib/localized";
import { indexTone } from "../RiskCellGrid";
import { Level } from "./Level";
import { SectorLabel } from "./SectorIcon";
import { TextLink } from "./TextLink";

/**
 * Section 1 of BR-N1: the three highest climate risks of the city, as
 * levels in words. The ranking is read against these.
 */
export function TopRisks({
  city,
  lng,
  t,
  href,
}: {
  city: CityFixture;
  lng: string;
  t: TFunction;
  href: string;
}) {
  const top = RISK_CELLS.map((c) => ({ c, r: city.risk[c.key] }))
    .filter(
      (
        x,
      ): x is { c: (typeof RISK_CELLS)[number]; r: NonNullable<typeof x.r> } =>
        Boolean(x.r),
    )
    .sort((a, b) => b.r.index - a.r.index)
    .slice(0, 3);
  if (top.length === 0) return null;

  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} gap="xl">
      {top.map(({ c, r }) => {
        const tone = indexTone(r.index);
        return (
          <VStack
            key={c.key}
            alignItems="flex-start"
            gap="s"
            p="xl"
            bg="base.light"
            borderRadius="rounded"
            boxShadow="1dp"
          >
            <SectorLabel sector={c.sector}>
              {pick(SECTOR_LABEL[c.sector], lng)}
            </SectorLabel>
            <LabelLarge color="content.primary">
              {pick(c.label, lng)}
            </LabelLarge>
            <Level tone={tone}>
              {t("next-risk-level", { level: t(`risk-level-${tone}`) })}
            </Level>
            <BodySmall color="content.secondary">
              {pick(c.hazardLabel, lng)}
            </BodySmall>
          </VStack>
        );
      })}
      <Box gridColumn="1 / -1">
        <BodyMedium color="content.secondary" as="span">
          <TextLink href={href}>{t("next-risks-link")}</TextLink>
        </BodyMedium>
      </Box>
    </SimpleGrid>
  );
}
