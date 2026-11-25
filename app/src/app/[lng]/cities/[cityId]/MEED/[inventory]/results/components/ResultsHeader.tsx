"use client";
import React from "react";
import { HStack, Icon, VStack } from "@chakra-ui/react";
import { LuFileText } from "react-icons/lu";
import type { TFunction } from "i18next";
import { MeedButton } from "../../../components/MeedButton";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { FOCUS_RING } from "../../../focusRing";

/**
 * The report control: one filled button whose label says how many actions
 * are selected, and one line under it that always says something true —
 * what is happening while generating, what is missing when nothing is
 * selected, and how long to expect otherwise (these are 10-30 s LLM calls,
 * one per action, so a silent wait would read as a hang).
 *
 * The button is enabled only with a selection: reports are generated per
 * action, so with nothing selected there is nothing to generate. Every
 * checkbox on the screen — card, table row or drawer — feeds it.
 */
export function GenerateReportControl({
  selectedCount,
  isGenerating,
  progress,
  onGenerate,
  t,
  hintId = "meed-report-hint",
  leading,
}: {
  selectedCount: number;
  isGenerating: boolean;
  /** Live "3 of 8" detail while reports generate, or null when idle. */
  progress: string | null;
  onGenerate: () => void;
  t: TFunction;
  /** Unique when the control is rendered more than once on a screen. */
  hintId?: string;
  /** A sibling control (e.g. Export CSV) shown beside the button, above the hint. */
  leading?: React.ReactNode;
}) {
  return (
    <VStack
      alignItems={{ base: "flex-start", md: "flex-end" }}
      gap="xs"
      flexShrink={0}
      maxW="full"
    >
      <HStack gap="m" flexWrap="wrap">
        {leading}
        <MeedButton
          variant="filled"
          minW="auto"
          px="l"
          disabled={selectedCount === 0 || isGenerating}
          leftIcon={<Icon as={LuFileText} boxSize="16px" />}
          aria-describedby={hintId}
          onClick={onGenerate}
          _focusVisible={FOCUS_RING}
        >
          {isGenerating
            ? t("generate-report-running")
            : selectedCount > 0
              ? t("generate-report-count", { count: selectedCount })
              : t("generate-report")}
        </MeedButton>
      </HStack>
      <BodySmall
        id={hintId}
        color="content.tertiary"
        textAlign={{ base: "start", md: "end" }}
      >
        {isGenerating && progress
          ? progress
          : selectedCount === 0
            ? t("generate-report-hint")
            : t("generate-report-duration", { count: selectedCount })}
      </BodySmall>
    </VStack>
  );
}

/**
 * Census line plus, when the caller wants it here, the screen's report entry
 * point. Callers that place the report control next to the selection (the
 * ranked list's control panel) leave `onGenerate` out.
 */
export function ResultsHeader({
  rankedCount,
  excludedCount,
  emissionsText,
  selectedCount = 0,
  isGenerating = false,
  progress = null,
  onGenerate,
  trailing,
  t,
}: {
  rankedCount: number;
  /** Null when the ranking does not report an exclusion count. */
  excludedCount: number | null;
  /** Formatted total city emissions, e.g. "1.1 MtCO2e". */
  emissionsText?: string;
  selectedCount?: number;
  isGenerating?: boolean;
  /** Live "3 of 8" detail while reports generate, or null when idle. */
  progress?: string | null;
  /** Omit to render the census line alone. */
  onGenerate?: () => void;
  /** Rendered at the right when there is no report control here. */
  trailing?: React.ReactNode;
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
      <BodyMedium color="content.tertiary">{census}</BodyMedium>
      {!onGenerate && trailing}
      {onGenerate && (
        <GenerateReportControl
          selectedCount={selectedCount}
          isGenerating={isGenerating}
          progress={progress}
          onGenerate={onGenerate}
          t={t}
        />
      )}
    </HStack>
  );
}
