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
import type { MeedActionIndex } from "./actionCatalog";
import { FOCUS_RING } from "../../../focusRing";

/**
 * The three hero cards, their heading and the shortcut to the full table.
 *
 * The cards need the action catalog for names, descriptions and timelines, so
 * while that is still loading they are replaced by placeholders of the same
 * shape rather than cards full of raw action IDs.
 */
export function TopPicks({
  actions,
  index,
  t,
  isCatalogLoading,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  onBrowseFullRanking,
}: {
  actions: MeedRankedActionResult[];
  index: MeedActionIndex;
  t: TFunction;
  isCatalogLoading: boolean;
  selectedIds: string[];
  onToggleSelect: (actionId: string) => void;
  onOpenDetail: (action: MeedRankedActionResult) => void;
  onBrowseFullRanking: () => void;
}) {
  return (
    <VStack alignItems="stretch" gap="s">
      <HStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap="m"
        flexWrap="wrap"
      >
        <VStack alignItems="stretch" gap="xs">
          <LabelLarge color="content.primary">
            {t("top-picks-title")}
          </LabelLarge>
          <BodySmall color="content.secondary">
            {t("top-picks-description")}
          </BodySmall>
        </VStack>
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
