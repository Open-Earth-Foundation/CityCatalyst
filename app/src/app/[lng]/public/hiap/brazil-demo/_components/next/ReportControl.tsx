"use client";
import React from "react";
import { Icon, VStack } from "@chakra-ui/react";
import { LuFileText } from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";

/**
 * The report button without the sparkle icon the shared control carries
 * (review: no AI-looking visuals). Same copy and behaviour otherwise.
 */
export function ReportControl({
  selectedCount,
  isGenerating,
  onGenerate,
  t,
  hintId,
}: {
  selectedCount: number;
  isGenerating: boolean;
  onGenerate: () => void;
  /** `meed-results` namespace. */
  t: TFunction;
  hintId: string;
}) {
  return (
    <VStack
      alignItems={{ base: "flex-start", md: "flex-end" }}
      gap="xs"
      flexShrink={0}
    >
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
      <BodySmall
        id={hintId}
        color="content.tertiary"
        textAlign={{ base: "start", md: "end" }}
      >
        {selectedCount === 0
          ? t("generate-report-hint")
          : t("generate-report-duration", { count: selectedCount })}
      </BodySmall>
    </VStack>
  );
}
