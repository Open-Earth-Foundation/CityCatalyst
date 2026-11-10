"use client";
import React from "react";
import { HStack, Icon, VStack } from "@chakra-ui/react";
import { LuSlidersHorizontal } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { TextLink } from "./TextLink";

/** Names shown before "and N more", so the line stays short. */
const MAX_NAMES = 5;

/**
 * The "change the order" row of the list's controls: the button that opens
 * the preferences, and what the order uses now (the suggested order, or the
 * city's preferences by name). After an update it says how many actions
 * changed place, so the effect shows where the list starts.
 */
export function RankingBasis({
  priorities,
  customWeights,
  movedAfterUpdate,
  onAdjust,
  onDefault,
  t,
}: {
  /** Labels of the city's chosen priorities; empty for the suggested order. */
  priorities: string[];
  customWeights: boolean;
  /** Set right after the city updated the list; null otherwise. */
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
      gap="m"
      rowGap="s"
      alignItems="center"
      flexWrap="wrap"
      minW={0}
      flex="1"
    >
      <MeedButton
        variant="outlined"
        minW="auto"
        h="36px"
        px="m"
        leftIcon={<Icon as={LuSlidersHorizontal} boxSize="16px" />}
        onClick={onAdjust}
        _focusVisible={FOCUS_RING}
        data-testid="open-preferences"
      >
        {t("next-customize")}
      </MeedButton>
      <VStack
        data-testid="ranking-basis"
        alignItems="flex-start"
        gap="0"
        minW="200px"
        flex="1"
        aria-live="polite"
      >
        <BodySmall color="content.primary">
          <strong>
            {isDefault ? t("next-basis-default") : t("next-basis-custom")}
          </strong>
          {!isDefault && detail ? `: ${detail}` : ""}
        </BodySmall>
        {movedAfterUpdate !== null && (
          <BodySmall color="content.secondary">
            {movedAfterUpdate === 0
              ? t("next-basis-moved-none")
              : t("next-basis-moved", { count: movedAfterUpdate })}
          </BodySmall>
        )}
      </VStack>
      {!isDefault && (
        <TextLink arrow={false} muted onClick={onDefault}>
          {t("next-basis-back-default")}
        </TextLink>
      )}
    </HStack>
  );
}
