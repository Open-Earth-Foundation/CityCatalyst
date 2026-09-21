"use client";
import { Box, HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { SectorEmission } from "@/util/types";
import { SECTORS } from "@/util/constants";
import { SegmentedProgress } from "@/components/SegmentedProgress";
import { Caption } from "@/components/package/Texts/Caption";
import { MeedChartTip } from "./MeedChartTip";

export interface MeedSectorShare {
  /** GPC sector name as the inventory reports it, e.g. "transportation". */
  name: string;
  referenceNumber: string;
  /** 0..1 share of the inventory total. */
  share: number;
}

/** Sector shares, largest first, zero-emission sectors dropped. */
export function sectorShares(
  bySector: SectorEmission[] | undefined,
): MeedSectorShare[] {
  if (!bySector?.length) return [];
  const total = bySector.reduce((sum, e) => sum + Number(e.co2eq), 0);
  if (total <= 0) return [];
  return bySector
    .map((e) => {
      const sector = SECTORS.find((s) => s.name === e.sectorName);
      return {
        name: e.sectorName,
        referenceNumber: sector?.referenceNumber ?? "",
        share: Number(e.co2eq) / total,
      };
    })
    .filter((s) => s.share > 0 && s.referenceNumber)
    .sort((a, b) => b.share - a.share);
}

export interface MeedSectorShareBarProps {
  bySector: SectorEmission[] | undefined;
  /** Human label for a sector name — the caller owns the i18n namespace. */
  labelFor: (sectorName: string) => string;
  /** How many sectors to name in the legend; the rest collapse to "+N". */
  legendLimit?: number;
  /** `meed-results` namespace, for the "+N more" and aria copy. */
  t: TFunction;
}

/**
 * Where this inventory's emissions come from, as one 100% bar in the sector
 * colours the GHGI dashboard uses. It sits inside a link card, so it is
 * deliberately non-interactive: the numbers are in the legend, not a tooltip.
 */
export function MeedSectorShareBar({
  bySector,
  labelFor,
  legendLimit = 3,
  t,
}: MeedSectorShareBarProps) {
  const shares = sectorShares(bySector);
  if (shares.length === 0) return null;

  const named = shares.slice(0, legendLimit);
  const rest = shares.length - named.length;
  const ariaLabel = shares
    .map((s) => `${labelFor(s.name)} ${Math.round(s.share * 100)}%`)
    .join(", ");

  return (
    <VStack alignItems="stretch" gap="xs" w="full">
      <MeedChartTip
        title={t("sector-share-tip-title")}
        rows={shares.map((s) => ({
          label: labelFor(s.name),
          swatch: `sectors.${s.referenceNumber}`,
          value: `${Math.round(s.share * 100)}%`,
        }))}
        note={t("sector-share-tip-note")}
      >
        <Box role="img" aria-label={ariaLabel} tabIndex={-1}>
          <SegmentedProgress
            values={shares.map((s) => s.share)}
            colors={shares.map((s) => `sectors.${s.referenceNumber}`)}
            max={1}
            height={2}
          />
        </Box>
      </MeedChartTip>
      <HStack gap="s" flexWrap="wrap">
        {named.map((s) => (
          <HStack key={s.name} gap="xs" alignItems="center">
            <Box
              w="8px"
              h="8px"
              borderRadius="full"
              bg={`sectors.${s.referenceNumber}`}
              flexShrink={0}
            />
            <Caption
              color="content.secondary"
              fontVariantNumeric="tabular-nums"
            >
              {`${labelFor(s.name)} ${Math.round(s.share * 100)}%`}
            </Caption>
          </HStack>
        ))}
        {rest > 0 && (
          <Caption color="content.tertiary">
            {t("context-more-sectors", { count: rest })}
          </Caption>
        )}
      </HStack>
    </VStack>
  );
}
