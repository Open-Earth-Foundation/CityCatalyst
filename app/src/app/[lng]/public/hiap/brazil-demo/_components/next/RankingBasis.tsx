"use client";
import React from "react";
import { HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { TextLink } from "./TextLink";

/** Names shown before "and N more", so the strip stays on two lines. */
const MAX_NAMES = 5;

/**
 * Above the list: what this ranking is built on, and the two moves a city
 * has: run a new ranking with its preferences, or go back to the default.
 * After an update it says how many actions changed place, so the effect of
 * the new ranking is visible where the list starts.
 */
export function RankingBasis({
  priorities,
  customWeights,
  movedAfterUpdate,
  onAdjust,
  onDefault,
  t,
}: {
  /** Labels of the city's chosen priorities; empty for the default ranking. */
  priorities: string[];
  customWeights: boolean;
  /** Set right after the city updated the ranking; null otherwise. */
  movedAfterUpdate: number | null;
  onAdjust: () => void;
  onDefault: () => void;
  t: TFunction;
}) {
  const isDefault = priorities.length === 0 && !customWeights;
  const shown = priorities.slice(0, MAX_NAMES);
  const more = priorities.length - shown.length;
  const detail = [
    ...shown,
    ...(more > 0 ? [t("next-basis-more", { count: more })] : []),
    ...(customWeights ? [t("next-basis-weights")] : []),
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
      <VStack alignItems="flex-start" gap="xs" minW={0} aria-live="polite">
        <BodySmall color="content.primary" fontWeight="semibold">
          {isDefault ? t("next-basis-default") : t("next-basis-custom")}
        </BodySmall>
        {!isDefault && (
          <BodySmall color="content.secondary">{detail}</BodySmall>
        )}
        {movedAfterUpdate !== null && (
          <BodySmall color="content.secondary">
            {movedAfterUpdate === 0
              ? t("next-basis-moved-none")
              : t("next-basis-moved", { count: movedAfterUpdate })}
          </BodySmall>
        )}
      </VStack>
      <HStack gap="l" flexShrink={0} flexWrap="wrap">
        <TextLink onClick={onAdjust}>{t("next-customize")}</TextLink>
        {!isDefault && (
          <TextLink arrow={false} muted onClick={onDefault}>
            {t("next-basis-back-default")}
          </TextLink>
        )}
      </HStack>
    </HStack>
  );
}
