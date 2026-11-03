"use client";
import React from "react";
import { HStack, Icon, Link, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuPencil, LuTriangleAlert } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import { BodySmall } from "@/components/package/Texts/Body";
import type { MeedScoreWeights } from "../[inventory]/results/components/rankingFacts";
import { PILLAR_WEIGHTS } from "../scoringWeights";
import { FOCUS_RING } from "../focusRing";
import { MeedStatusTag } from "./MeedStatusTag";
import { prefKeyToLocale, useMeedStoredPreferences } from "./MeedRankingConfig";

/** Names shown before "and N more", so the strip stays on two lines. */
const MAX_NAMES = 5;

export interface MeedRankingBasisProps {
  inventoryId: string;
  /** The weights the ranking was actually scored with (from its metadata). */
  weights: MeedScoreWeights | null;
  /** True when the stored preferences no longer match the ranking. */
  isStale: boolean;
  /** Where "Edit preferences" leads (the preferences step, with a return target). */
  editHref: string;
  lng: string;
}

function isCustom(weights: MeedScoreWeights | null): boolean {
  if (!weights) return false;
  return (["impact", "alignment", "feasibility"] as const).some(
    (p) => Math.round(weights[p] * 100) !== Math.round(PILLAR_WEIGHTS[p] * 100),
  );
}

/**
 * Where the list starts: what this ranking is built on, in one line, and the
 * one move a city has from here — change the preferences and run again. The
 * summary card above carries the full configuration; this strip is the
 * reminder beside the rows it produced.
 */
export function MeedRankingBasis({
  inventoryId,
  weights,
  isStale,
  editHref,
  lng,
}: MeedRankingBasisProps) {
  const { t } = useTranslation(lng, "meed-preferences");
  const { t: tResults } = useTranslation(lng, "meed-results");
  const { prefs } = useMeedStoredPreferences(inventoryId);

  const priorities = [
    ...(prefs?.sectors ?? []).map((k) => t(`sector-${prefKeyToLocale(k)}`)),
    ...(prefs?.strategicPriorities ?? []).map((k) =>
      t(`co-benefit-${prefKeyToLocale(k)}`),
    ),
    ...(prefs?.timeline ?? []).map((k) => t(`timeline-${prefKeyToLocale(k)}`)),
  ];
  const customWeights = isCustom(weights);
  const isDefault = priorities.length === 0 && !customWeights;
  const shown = priorities.slice(0, MAX_NAMES);
  const more = priorities.length - shown.length;
  const detail = [
    ...shown,
    ...(more > 0 ? [tResults("basis-more", { count: more })] : []),
    ...(customWeights ? [tResults("basis-weights")] : []),
  ].join(" · ");

  return (
    <HStack
      data-testid="ranking-basis"
      justifyContent="space-between"
      alignItems={{ base: "flex-start", md: "center" }}
      flexDirection={{ base: "column", md: "row" }}
      gap="m"
      px="xl"
      py="m"
      bg="background.neutral"
      borderRadius="rounded"
    >
      <VStack alignItems="flex-start" gap="xs" minW={0}>
        <HStack gap="s" alignItems="center" flexWrap="wrap">
          <BodySmall color="content.primary" fontWeight="semibold">
            {isDefault ? tResults("basis-default") : tResults("basis-custom")}
          </BodySmall>
          {isStale && (
            <MeedStatusTag tone="warning">
              <HStack gap="xs" alignItems="center">
                <Icon as={LuTriangleAlert} boxSize="12px" />
                <span>{tResults("config-stale")}</span>
              </HStack>
            </MeedStatusTag>
          )}
        </HStack>
        {!isDefault && (
          <BodySmall color="content.secondary">{detail}</BodySmall>
        )}
      </VStack>
      <Link
        asChild
        color="content.link"
        fontFamily="heading"
        fontSize="label.md"
        fontWeight="semibold"
        flexShrink={0}
        _focusVisible={FOCUS_RING}
      >
        <NextLink href={editHref}>
          <HStack gap="xs" alignItems="center">
            <Icon as={LuPencil} boxSize="14px" />
            <span>{tResults("config-edit")}</span>
          </HStack>
        </NextLink>
      </Link>
    </HStack>
  );
}
