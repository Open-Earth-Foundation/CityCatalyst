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
 * The button is enabled only with a selection: reports are generated per
 * action, so with nothing selected there is nothing to generate.
 */
export function ResultsHeader({
  rankedCount,
  excludedCount,
  emissionsText,
  selectedCount,
  isGenerating,
  progress,
  onGenerate,
  t,
}: {
  rankedCount: number;
  /** Null when the ranking does not report an exclusion count. */
  excludedCount: number | null;
  /** Formatted total city emissions, e.g. "1.1 MtCO2e". */
  emissionsText?: string;
  selectedCount: number;
  isGenerating: boolean;
  /** Live "3 of 8" detail while reports generate, or null when idle. */
  progress: string | null;
  onGenerate: () => void;
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
          disabled={selectedCount === 0 || isGenerating}
          leftIcon={<Icon as={LuSparkles} boxSize="16px" />}
          aria-describedby="meed-report-hint"
          onClick={onGenerate}
          _focusVisible={FOCUS_RING}
        >
          {isGenerating
            ? t("generate-report-running")
            : selectedCount > 0
              ? t("generate-report-count", { count: selectedCount })
              : t("generate-report")}
        </MeedButton>
        {/*
          One line, and it always says something true: what is happening while
          generating, what is missing when nothing is selected, and how long to
          expect otherwise — these are 10-30 s LLM calls, one per action, so a
          silent wait would read as a hang.
        */}
        <Caption id="meed-report-hint" color="content.tertiary" textAlign="end">
          {isGenerating && progress
            ? progress
            : selectedCount === 0
              ? t("generate-report-hint")
              : t("generate-report-duration", { count: selectedCount })}
        </Caption>
      </VStack>
    </HStack>
  );
}
