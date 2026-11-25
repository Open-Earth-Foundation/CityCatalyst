"use client";
import React from "react";
import { HStack, Icon, VStack } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import { useTranslation } from "@/i18n/client";
import { BodySmall } from "@/components/package/Texts/Body";
import type { MeedScoreWeights } from "../[inventory]/results/components/rankingFacts";
import { PILLAR_WEIGHTS } from "../scoringWeights";
import { MeedStatusTag } from "./MeedStatusTag";
import { MeedTextLink } from "./MeedTextLink";
import {
  prefKeyToLocale,
  useMeedStoredPreferences,
} from "./useMeedStoredPreferences";

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

/** True when the ranking was scored with weights other than the methodology's. */
export function hasCustomWeights(weights: MeedScoreWeights | null): boolean {
  if (!weights) return false;
  return (["impact", "alignment", "feasibility"] as const).some(
    (p) => Math.round(weights[p] * 100) !== Math.round(PILLAR_WEIGHTS[p] * 100),
  );
}

/**
 * What this ranking is built on, in one strip: the priorities, exclusions
 * and weights behind it, whether they have changed since, and the one move a
 * city has from here — change the preferences and run again.
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
  const { prefs, exclusions } = useMeedStoredPreferences(inventoryId);

  const priorities = [
    ...(prefs?.sectors ?? []).map((k) => t(`sector-${prefKeyToLocale(k)}`)),
    ...(prefs?.strategicPriorities ?? []).map((k) =>
      t(`co-benefit-${prefKeyToLocale(k)}`),
    ),
    ...(prefs?.timeline ?? []).map((k) => t(`timeline-${prefKeyToLocale(k)}`)),
  ];
  const exclusionParts = [
    exclusions.length
      ? tResults("config-exclusions-actions", { count: exclusions.length })
      : null,
    prefs?.excludedSectors?.length
      ? tResults("config-exclusions-sectors", {
          list: prefs.excludedSectors
            .map((key) => t(`sector-${prefKeyToLocale(key)}`))
            .join(", "),
        })
      : null,
    prefs?.excludedCoBenefits?.length
      ? tResults("config-exclusions-cobenefits", {
          list: prefs.excludedCoBenefits
            .map((key) => t(`co-benefit-${prefKeyToLocale(key)}`))
            .join(", "),
        })
      : null,
  ].filter((v): v is string => Boolean(v));
  const customWeights = hasCustomWeights(weights);
  const isDefault =
    priorities.length === 0 && exclusionParts.length === 0 && !customWeights;
  const shown = priorities.slice(0, MAX_NAMES);
  const more = priorities.length - shown.length;
  const detail = [
    ...shown,
    ...(more > 0 ? [tResults("basis-more", { count: more })] : []),
    ...(customWeights ? [tResults("basis-weights")] : []),
    ...exclusionParts,
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
      <MeedTextLink href={editHref} flexShrink={0}>
        {tResults("config-edit")}
      </MeedTextLink>
    </HStack>
  );
}
