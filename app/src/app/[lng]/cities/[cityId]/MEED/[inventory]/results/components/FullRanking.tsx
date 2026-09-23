"use client";
import React from "react";
import { Box, Card, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { RankingTable } from "./RankingTable";
import { RankingGlanceChart } from "./RankingGlanceChart";
import type { MeedActionIndex } from "./actionCatalog";
import type { MeedScoreWeights } from "./rankingFacts";

/**
 * The full ranking: the table first — it is where actions are selected and
 * opened — then the picture (one bar per action) as its own section. `ref`
 * is what the "see full ranking" affordances scroll to; the scroll margin
 * keeps the table header clear of the sticky module chrome.
 */
export const FullRanking = React.forwardRef<
  HTMLDivElement,
  {
    actions: MeedRankedActionResult[];
    index: MeedActionIndex;
    weights: MeedScoreWeights;
    t: TFunction;
    onSelect: (action: MeedRankedActionResult) => void;
    selectedIds: string[];
    onToggleSelect: (actionId: string) => void;
    onExport?: () => void;
    /** Forwarded to the table header; see `RankingTable.onGenerate`. */
    onGenerate?: () => void;
    isGenerating?: boolean;
    progress?: string | null;
    /** Forwarded to the glance chart; see `RankingGlanceChart.colorOf`. */
    colorOf?: (sectorTag: string | null | undefined) => string | undefined;
  }
>(function FullRanking(
  {
    actions,
    index,
    weights,
    t,
    onSelect,
    selectedIds,
    onToggleSelect,
    onExport,
    onGenerate,
    isGenerating,
    progress,
    colorOf,
  },
  ref,
) {
  return (
    <Box ref={ref} scrollMarginTop="l">
      <VStack alignItems="stretch" gap="xl">
        <RankingTable
          actions={actions}
          index={index}
          weights={weights}
          t={t}
          onSelect={onSelect}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onExport={onExport}
          onGenerate={onGenerate}
          isGenerating={isGenerating}
          progress={progress}
        />
        <Card.Root>
          <Card.Body p="l">
            <RankingGlanceChart
              actions={actions}
              index={index}
              t={t}
              onSelect={onSelect}
              colorOf={colorOf}
            />
          </Card.Body>
        </Card.Root>
      </VStack>
    </Box>
  );
});
