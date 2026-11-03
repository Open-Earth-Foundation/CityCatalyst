"use client";
import React from "react";
import { TitleLarge } from "@/components/package/Texts/Title";
import { HStack, SimpleGrid, VStack } from "@chakra-ui/react";
import { LuArrowDown } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { BodyMedium } from "@/components/package/Texts/Body";
import { MeedCardSkeleton } from "../../../components/MeedSkeletons";
import { MeedTextLink } from "../../../components/MeedTextLink";
import { TopPickCard } from "./TopPickCard";
import { GenerateReportControl } from "./ResultsHeader";
import type { MeedActionIndex } from "./actionCatalog";
import type { MeedScoreWeights } from "./rankingFacts";
import type { MeedLegalStanding } from "../../regulations/legalStanding";

/**
 * The three top cards and the shortcut to the full list. With
 * `layout="section"` the heading is the caller's (a `MeedSection`), so only
 * the cards and the link render; the default keeps the heading row and —
 * when the caller wires it — the report control beside it.
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
  legalFor,
  layout = "titled",
}: {
  actions: MeedRankedActionResult[];
  index: MeedActionIndex;
  weights: MeedScoreWeights | null;
  t: TFunction;
  isCatalogLoading: boolean;
  selectedIds: string[];
  onToggleSelect: (actionId: string) => void;
  onOpenDetail: (action: MeedRankedActionResult) => void;
  onBrowseFullRanking: () => void;
  /** Renders the report control in the header when set (titled layout only). */
  onGenerate?: () => void;
  isGenerating?: boolean;
  progress?: string | null;
  /** Legal standing per action; shown on each card when set. */
  legalFor?: (actionId: string) => MeedLegalStanding | null;
  /** `section`: no heading row, the caller frames it. */
  layout?: "titled" | "section";
}) {
  return (
    <VStack alignItems="stretch" gap="l">
      {layout === "titled" && (
        <HStack
          justifyContent="space-between"
          alignItems="flex-start"
          gap="m"
          flexWrap="wrap"
        >
          <VStack alignItems="stretch" gap="xs" flex="1" minW="240px">
            <TitleLarge color="content.primary">
              {t("top-picks-title")}
            </TitleLarge>
            <BodyMedium color="content.secondary">
              {t("top-picks-description")}
            </BodyMedium>
          </VStack>
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
      )}

      <SimpleGrid columns={{ base: 1, md: 3 }} gap="xl" alignItems="stretch">
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
                legal={legalFor?.(action.action_id) ?? null}
              />
            ))}
      </SimpleGrid>

      <MeedTextLink
        onClick={onBrowseFullRanking}
        icon={LuArrowDown}
        alignSelf="flex-start"
      >
        {t("see-full-ranking")}
      </MeedTextLink>
    </VStack>
  );
}
