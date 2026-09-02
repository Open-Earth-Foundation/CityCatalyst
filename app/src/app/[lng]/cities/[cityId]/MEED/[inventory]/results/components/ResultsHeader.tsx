"use client";
import React from "react";
import { HStack, Icon, VStack } from "@chakra-ui/react";
import { LuSparkles } from "react-icons/lu";
import type { TFunction } from "i18next";
import { MeedButton } from "../../../components/MeedButton";
import { LabelLarge } from "@/components/package/Texts/Label";
import { Caption } from "@/components/package/Texts/Caption";
import { FOCUS_RING } from "../../../focusRing";

/**
 * Census line plus the screen's single report entry point.
 *
 * There is deliberately one "Generate report" button on the whole page. The
 * prototype offered a per-card generate button *and* a checkbox-driven
 * multi-action report, and it was never clear which one a user was invoking;
 * cards now only open details, and every checkbox — card or table row — feeds
 * this one button.
 *
 * The button stays disabled either way for now: nothing generates a report
 * until the prioritization backend lands, and a button that silently does
 * nothing is worse than one that says why.
 */
export function ResultsHeader({
  rankedCount,
  excludedCount,
  emissionsText,
  selectedCount,
  t,
}: {
  rankedCount: number;
  /** Null when the ranking does not report an exclusion count. */
  excludedCount: number | null;
  /** Formatted total city emissions, e.g. "1.1 MtCO2e". */
  emissionsText?: string;
  selectedCount: number;
  t: TFunction;
}) {
  // Each clause is dropped rather than guessed at when its number is missing.
  const census = [
    t("census-ranked", { count: rankedCount }),
    excludedCount !== null
      ? t("census-excluded", { count: excludedCount })
      : null,
    emissionsText ? t("census-emissions", { value: emissionsText }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <HStack
      justifyContent="space-between"
      alignItems="flex-start"
      gap="m"
      flexWrap="wrap"
    >
      <LabelLarge color="content.tertiary">{census}</LabelLarge>

      <VStack alignItems="flex-end" gap="xs" flexShrink={0} maxW="320px">
        <MeedButton
          variant="filled"
          minW="auto"
          px="l"
          disabled
          leftIcon={<Icon as={LuSparkles} boxSize="16px" />}
          _focusVisible={FOCUS_RING}
        >
          {selectedCount > 0
            ? t("generate-report-count", { count: selectedCount })
            : t("generate-report")}
        </MeedButton>
        {/*
          The unavailability is stated up front. This used to invite the user
          to "select one or more actions to build a report" and only admit the
          feature did not exist *after* they had selected some — the promise
          first and the retraction second.
        */}
        <Caption color="content.tertiary" textAlign="end">
          {t("generate-report-pending")}
        </Caption>
      </VStack>
    </HStack>
  );
}
