"use client";
import React from "react";
import { Box, HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { MeedProposedExcludedAction } from "@/util/types/meed";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelMedium } from "@/components/package/Texts/Label";
import { Caption } from "@/components/package/Texts/Caption";
import { MeedButton } from "../../components/MeedButton";
import { MeedCardSkeleton } from "../../components/MeedSkeletons";
import { MeedStatusTag } from "../../components/MeedStatusTag";
import { SelectActionCheckbox } from "../results/components/SelectActionCheckbox";
import { MATCHED_BY_SECTOR } from "./exclusionProposals";
import { FOCUS_RING } from "../../focusRing";

export interface ExclusionPreviewPanelProps {
  proposals: MeedProposedExcludedAction[];
  selectedIds: string[];
  onToggle: (actionId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
  /** The catalog failed to load, so "no matches" would be a lie. */
  isError?: boolean;
  t: TFunction;
}

/**
 * The proposal list, inline in the exclusions card.
 *
 * Every row is individually uncheckable: the criteria are a blunt instrument
 * and the user is expected to disagree with some of what they catch. Confirming
 * writes the ticked IDs, not the criteria, so a later change to the catalog
 * cannot silently widen what was agreed to.
 */
export function ExclusionPreviewPanel({
  proposals,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onConfirm,
  onCancel,
  isLoading,
  isError = false,
  t,
}: ExclusionPreviewPanelProps) {
  const selectedCount = selectedIds.length;

  return (
    <Box
      borderWidth="1px"
      borderColor="border.overlay"
      borderRadius="rounded"
      p="m"
      bg="background.overlay"
    >
      <VStack alignItems="stretch" gap="s">
        <LabelMedium color="content.primary">{t("preview-title")}</LabelMedium>

        {isLoading ? (
          <MeedCardSkeleton lines={4} />
        ) : isError ? (
          // Without the catalog there is nothing to match against. Reporting
          // "no matches" here would tell the user their criteria exclude
          // nothing, which is a different and untrue statement.
          <BodySmall color="sentiment.negativeDefault">
            {t("preview-error")}
          </BodySmall>
        ) : proposals.length === 0 ? (
          <BodySmall color="content.tertiary" fontStyle="italic">
            {t("preview-empty")}
          </BodySmall>
        ) : (
          <>
            <HStack justifyContent="space-between" flexWrap="wrap" gap="s">
              <BodySmall color="content.secondary">
                {t("preview-selected-count", {
                  selected: selectedCount,
                  total: proposals.length,
                })}
              </BodySmall>
              <HStack gap="0">
                <MeedButton
                  variant="text"
                  minW="auto"
                  px="s"
                  onClick={onSelectAll}
                  disabled={selectedCount === proposals.length}
                  _focusVisible={FOCUS_RING}
                >
                  {t("preview-select-all")}
                </MeedButton>
                <MeedButton
                  variant="text"
                  minW="auto"
                  px="s"
                  onClick={onDeselectAll}
                  disabled={selectedCount === 0}
                  _focusVisible={FOCUS_RING}
                >
                  {t("preview-deselect-all")}
                </MeedButton>
              </HStack>
            </HStack>

            <VStack
              alignItems="stretch"
              gap="s"
              maxH="320px"
              overflowY="auto"
              role="group"
              aria-label={t("preview-title")}
            >
              {proposals.map((proposal) => (
                <HStack
                  key={proposal.actionId}
                  alignItems="flex-start"
                  gap="s"
                  borderBottomWidth="1px"
                  borderColor="border.overlay"
                  pb="s"
                >
                  <Box pt="2px">
                    <SelectActionCheckbox
                      checked={selectedIds.includes(proposal.actionId)}
                      onToggle={() => onToggle(proposal.actionId)}
                      ariaLabel={proposal.actionName}
                    />
                  </Box>
                  <VStack alignItems="stretch" gap="xs" flex="1" minW="0">
                    <BodySmall color="content.primary">
                      {proposal.actionName}
                    </BodySmall>
                    {proposal.reasons.map((reason) => (
                      <Caption key={reason} color="content.tertiary">
                        {reason}
                      </Caption>
                    ))}
                  </VStack>
                  <HStack gap="xs" flexWrap="wrap" justifyContent="flex-end">
                    {proposal.matchedBy.map((tag) => (
                      <MeedStatusTag
                        key={tag}
                        tone={
                          tag === MATCHED_BY_SECTOR ? "neutral" : "negative"
                        }
                      >
                        {tag === MATCHED_BY_SECTOR
                          ? t("preview-chip-sector")
                          : t("preview-chip-co-benefit")}
                      </MeedStatusTag>
                    ))}
                  </HStack>
                </HStack>
              ))}
            </VStack>
          </>
        )}

        <HStack gap="s" flexWrap="wrap">
          <MeedButton
            variant="filled"
            minW="auto"
            px="l"
            onClick={onConfirm}
            disabled={isLoading || selectedCount === 0}
            _focusVisible={FOCUS_RING}
          >
            {t("preview-confirm", { count: selectedCount })}
          </MeedButton>
          <MeedButton
            variant="text"
            minW="auto"
            px="m"
            onClick={onCancel}
            _focusVisible={FOCUS_RING}
          >
            {t("preview-cancel")}
          </MeedButton>
        </HStack>
      </VStack>
    </Box>
  );
}
