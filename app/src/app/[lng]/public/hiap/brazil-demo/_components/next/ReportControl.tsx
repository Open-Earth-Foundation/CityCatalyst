"use client";
import React from "react";
import { chakra, HStack, Icon, VStack } from "@chakra-ui/react";
import {
  LuChevronDown,
  LuDownload,
  LuFileSpreadsheet,
  LuFileText,
} from "react-icons/lu";
import type { TFunction } from "i18next";
import { BodySmall } from "@/components/package/Texts/Body";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";

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

/**
 * BR-N1's one export: "Export selected actions", a menu with the PDF report
 * of the ticked actions and the CSV of the list (every row with its position
 * in the current order and whether it is selected). No AI wording: the
 * report is a document the city downloads.
 */
export function ExportMenu({
  selectedCount,
  isGenerating,
  onPdf,
  onCsv,
  t,
}: {
  selectedCount: number;
  isGenerating: boolean;
  onPdf: () => void;
  onCsv: () => void;
  /** `hiap-demo` namespace. */
  t: TFunction;
}) {
  return (
    <MenuRoot positioning={{ placement: "bottom-end" }}>
      <MenuTrigger asChild>
        <MeedButton
          variant="filled"
          minW="auto"
          h="40px"
          px="l"
          leftIcon={<Icon as={LuDownload} boxSize="16px" />}
          rightIcon={<Icon as={LuChevronDown} boxSize="16px" />}
          disabled={isGenerating}
          // Open reads as pressed, not as unavailable.
          _expanded={{ bg: "content.link", color: "base.light", opacity: 1 }}
          _focusVisible={FOCUS_RING}
          data-testid="export-menu"
        >
          {isGenerating ? (
            t("next-export-running")
          ) : (
            <>
              {/* The full label where it fits; "Export (2)" on a phone. */}
              <chakra.span display={{ base: "none", sm: "inline" }}>
                {selectedCount > 0
                  ? t("next-export-selected-count", { count: selectedCount })
                  : t("next-export-selected")}
              </chakra.span>
              <chakra.span display={{ base: "inline", sm: "none" }}>
                {selectedCount > 0
                  ? t("next-export-short-count", { count: selectedCount })
                  : t("next-export-short")}
              </chakra.span>
            </>
          )}
        </MeedButton>
      </MenuTrigger>
      <MenuContent minW="280px" maxW="calc(100vw - 32px)">
        <MenuItem
          value="pdf"
          disabled={selectedCount === 0}
          onClick={onPdf}
          py="s"
        >
          <HStack gap="m" alignItems="flex-start">
            <Icon as={LuFileText} boxSize="18px" mt="2px" />
            <VStack alignItems="flex-start" gap="0">
              <span>{t("next-export-pdf")}</span>
              <BodySmall color="content.tertiary" whiteSpace="normal">
                {selectedCount === 0
                  ? t("next-export-pdf-none")
                  : t("next-export-pdf-hint", { count: selectedCount })}
              </BodySmall>
            </VStack>
          </HStack>
        </MenuItem>
        <MenuItem value="csv" onClick={onCsv} py="s">
          <HStack gap="m" alignItems="flex-start">
            <Icon as={LuFileSpreadsheet} boxSize="18px" mt="2px" />
            <VStack alignItems="flex-start" gap="0">
              <span>{t("next-export-csv-list")}</span>
              <BodySmall color="content.tertiary" whiteSpace="normal">
                {t("next-export-csv-hint")}
              </BodySmall>
            </VStack>
          </HStack>
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}
