"use client";
import React from "react";
import { HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import { LuArrowDown } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { MeedButton } from "../../../components/MeedButton";
import { LabelLarge } from "@/components/package/Texts/Label";
import { BodySmall } from "@/components/package/Texts/Body";
import { MeedCardSkeleton } from "../../../components/MeedSkeletons";
import { TopPickCard } from "./TopPickCard";
import { GenerateReportControl } from "./ResultsHeader";
import type { MeedActionIndex } from "./actionCatalog";
import type { MeedScoreWeights } from "./rankingFacts";
import { FOCUS_RING } from "../../../focusRing";

/**
 * The three hero cards, their heading, the shortcut to the full table and —
 * when the caller wires it — the report control, right next to the checkboxes
 * that feed it.
 *
 * The cards need the action catalog for names and timelines, so while that is
 * still loading they are replaced by placeholders of the same shape rather
 * than cards full of raw action IDs.
 */
export function TopPicks({
  actions,
  index,
  weights,
  t,
  isCatalogLoading,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  onBrowseFullRanking,
  onGenerate,
  isGenerating = false,
  progress = null,
}: {
  actions: MeedRankedActionResult[];
  index: MeedActionIndex;
  weights: MeedScoreWeights;
  t: TFunction;
  isCatalogLoading: boolean;
  selectedIds: string[];
  onToggleSelect: (actionId: string) => void;
  onOpenDetail: (action: MeedRankedActionResult) => void;
  onBrowseFullRanking: () => void;
  /** Renders the report control in the header when set. */
  onGenerate?: () => void;
  isGenerating?: boolean;
  progress?: string | null;
}) {
  return (
    <VStack alignItems="stretch" gap="m">
      <HStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap="m"
        flexWrap="wrap"
      >
        <VStack alignItems="stretch" gap="xs" flex="1" minW="240px">
          <LabelLarge color="content.primary">
            {t("top-picks-title")}
          </LabelLarge>
          <BodySmall color="content.secondary">
            {t("top-picks-description")}
          </BodySmall>
        </VStack>
        <HStack gap="m" alignItems="flex-start" flexWrap="wrap">
          <MeedButton
            variant="text"
            px="0"
            minW="auto"
            rightIcon={<Icon as={LuArrowDown} boxSize="14px" />}
            onClick={onBrowseFullRanking}
            _focusVisible={FOCUS_RING}
          >
            {t("see-full-ranking")}
          </MeedButton>
          {onGenerate && (
            <GenerateReportControl
              selectedCount={selectedIds.length}
              isGenerating={isGenerating}
              progress={progress}
              onGenerate={onGenerate}
              t={t}
              hintId="meed-report-hint-top"
            />
          )}
        </HStack>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap="m" alignItems="stretch">
        {isCatalogLoading
          ? actions.map((action) => (
              <MeedCardSkeleton key={action.action_id} lines={3} />
            ))
          : actions.map((action) => (
              <TopPickCard
                key={action.action_id}
                action={action}
                index={index}
                weights={weights}
                t={t}
                isSelected={selectedIds.includes(action.action_id)}
                onToggleSelect={onToggleSelect}
                onOpenDetail={onOpenDetail}
              />
            ))}
      </SimpleGrid>
    </VStack>
  );
}
