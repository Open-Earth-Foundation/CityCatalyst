"use client";
import React from "react";
import { Box, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { RankingTable } from "./RankingTable";
import type { MeedActionIndex } from "./actionCatalog";

/**
 * The full ranking, below both tabs, so it is reachable whichever one the user
 * is on. `ref` is what the "browse full ranking" affordances scroll to; the
 * scroll margin keeps the heading clear of the sticky module chrome.
 */
export const FullRanking = React.forwardRef<
  HTMLDivElement,
  {
    actions: MeedRankedActionResult[];
    index: MeedActionIndex;
    t: TFunction;
    onSelect: (action: MeedRankedActionResult) => void;
    selectedIds: string[];
    onToggleSelect: (actionId: string) => void;
    onExport?: () => void;
  }
>(function FullRanking(
  { actions, index, t, onSelect, selectedIds, onToggleSelect, onExport },
  ref,
) {
  return (
    <Box ref={ref} scrollMarginTop="l">
      <VStack alignItems="stretch" gap="s">
        <VStack alignItems="stretch" gap="xs">
          <TitleMedium color="content.primary">
            {t("full-ranking-title")}
          </TitleMedium>
          <BodySmall color="content.secondary">
            {t("full-ranking-description")}
          </BodySmall>
        </VStack>
        <RankingTable
          actions={actions}
          index={index}
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
