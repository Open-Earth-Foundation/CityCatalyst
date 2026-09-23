"use client";
import React from "react";
import { Box, Card, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { RankingTable } from "./RankingTable";
import { RankingGlanceChart } from "./RankingGlanceChart";
import type { MeedActionIndex } from "./actionCatalog";
import type { MeedScoreWeights } from "./rankingFacts";

/**
 * The full ranking: the picture first (one bar per action), then the table.
 * `ref` is what the "see full ranking" affordances scroll to; the scroll
 * margin keeps the heading clear of the sticky module chrome.
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
  },
  ref,
) {
  return (
    <Box ref={ref} scrollMarginTop="l">
      <VStack alignItems="stretch" gap="m">
        <VStack alignItems="stretch" gap="xs">
          <TitleMedium color="content.primary">
            {t("full-ranking-title")}
          </TitleMedium>
          <BodySmall color="content.secondary">
            {t("full-ranking-description")}
          </BodySmall>
        </VStack>
        <Card.Root>
          <Card.Body py="m">
            <RankingGlanceChart
              actions={actions}
              index={index}
              t={t}
              onSelect={onSelect}
            />
          </Card.Body>
        </Card.Root>
        <RankingTable
          actions={actions}
          index={index}
          weights={weights}
          t={t}
          onSelect={onSelect}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onExport={onExport}
        />
      </VStack>
    </Box>
  );
});
