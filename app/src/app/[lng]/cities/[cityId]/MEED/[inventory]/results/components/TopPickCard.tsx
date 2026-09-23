"use client";
import React from "react";
import { Box, Card, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuArrowRight, LuBookmark } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { MeedButton } from "../../../components/MeedButton";
import { TitleMedium } from "@/components/package/Texts/Title";
import { HeadlineLarge } from "@/components/package/Texts/Headline";
import { BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { Caption } from "@/components/package/Texts/Caption";
import { MeedInfoTip } from "../../../components/MeedInfoTip";
import { MeedScoreComposition } from "../../../components/MeedScoreComposition";
import { SelectActionCheckbox } from "./SelectActionCheckbox";
import type { MeedScoreWeights } from "./rankingFacts";
import { FOCUS_RING } from "../../../focusRing";
import {
  actionName,
  reductionLevel,
  reductionLevelColor,
  reductionLevelLabelKey,
  sectorLabel,
  timelineLabel,
  type MeedActionIndex,
} from "./actionCatalog";

function MetaRow({
  label,
  value,
  valueColor = "content.secondary",
  info,
}: {
  label: string;
  value: string;
  valueColor?: string;
  info?: React.ReactNode;
}) {
  return (
    <HStack justifyContent="space-between" alignItems="center" gap="s">
      <HStack gap="xs" alignItems="center">
        <Caption color="content.tertiary">{label}</Caption>
        {info}
      </HStack>
      <BodySmall color={valueColor} fontWeight="semibold" textAlign="end">
        {value}
      </BodySmall>
    </HStack>
  );
}

/**
 * One of the three hero cards at the top of the results overview.
 *
 * The card offers exactly two things: tick it to put the action in a report, or
 * open its full detail. It carries the name, the final score with its
 * composition, and three facts — the description lives in the drawer, where
 * it can be read in full rather than clamped to three lines.
 *
 * The spacer above the score is load-bearing: names vary in length, and
 * without it the scores and metadata rows step up and down across the cards.
 */
export function TopPickCard({
  action,
  index,
  weights,
  t,
  isSelected,
  onToggleSelect,
  onOpenDetail,
}: {
  action: MeedRankedActionResult;
  index: MeedActionIndex;
  weights: MeedScoreWeights;
  t: TFunction;
  isSelected?: boolean;
  /** Omit to render the card read-only (no report checkbox), as on the home screen. */
  onToggleSelect?: (actionId: string) => void;
  onOpenDetail: (action: MeedRankedActionResult) => void;
}) {
  const name = actionName(index, action.action_id, t);
  const level = reductionLevel(index, action.action_id);

  return (
    <Card.Root
      h="full"
      data-selected={isSelected ? "true" : undefined}
      borderWidth="1px"
      borderColor={isSelected ? "content.link" : "border.neutral"}
      bg={isSelected ? "background.neutral" : "base.light"}
      transition="border-color 0.15s, background-color 0.15s"
    >
      <Card.Body display="flex" flexDirection="column" gap="m" h="full" p="l">
        <HStack justifyContent="space-between" alignItems="flex-start" gap="s">
          <HStack gap="xs" alignItems="center">
            <Icon as={LuBookmark} boxSize="14px" color="content.link" />
            <Overline color="content.link">{t("top-pick-overline")}</Overline>
          </HStack>
          {onToggleSelect && (
            <SelectActionCheckbox
              checked={Boolean(isSelected)}
              onToggle={() => onToggleSelect(action.action_id)}
              ariaLabel={t("select-action", { name })}
            />
          )}
        </HStack>

        <TitleMedium color="content.primary" lineClamp={3}>
          {name}
        </TitleMedium>

        {/* Absorbs the height difference between cards so everything below
            this point lines up across the row. */}
        <Box flex="1" minH="s" />

        <VStack alignItems="stretch" gap="xs" mt="s">
          <HStack alignItems="baseline" gap="s">
            <HeadlineLarge
              color="content.primary"
              fontVariantNumeric="tabular-nums"
              lineHeight="1"
            >
              {action.final_score.toFixed(2)}
            </HeadlineLarge>
            <Caption color="content.tertiary">
              {t("detail-final-score")}
            </Caption>
          </HStack>
          <MeedScoreComposition
            action={action}
            weights={weights}
            variant="bar"
            t={t}
          />
        </VStack>

        <Box borderTopWidth="1px" borderColor="border.overlay" pt="s" mt="xs">
          <VStack alignItems="stretch" gap="xs">
            <MetaRow
              label={t("card-reduction-potential")}
              value={t(reductionLevelLabelKey(level))}
              valueColor={reductionLevelColor(level)}
            />
            <MetaRow
              label={t("card-sector")}
              value={sectorLabel(index, action.action_id, t)}
            />
            <MetaRow
              label={t("card-timeline")}
              value={timelineLabel(index, action.action_id, t)}
              info={
                <MeedInfoTip
                  content={t("timeline-info")}
                  ariaLabel={t("timeline-info-label")}
                />
              }
            />
          </VStack>
        </Box>

        <MeedButton
          variant="text"
          px="0"
          minW="auto"
          justifyContent="flex-start"
          rightIcon={<Icon as={LuArrowRight} boxSize="14px" />}
          onClick={() => onOpenDetail(action)}
          _focusVisible={FOCUS_RING}
        >
          {t("view-details")}
        </MeedButton>
      </Card.Body>
    </Card.Root>
  );
}
