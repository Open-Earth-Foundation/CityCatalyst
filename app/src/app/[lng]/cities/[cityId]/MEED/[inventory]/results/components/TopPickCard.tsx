"use client";
import React from "react";
import { Box, Card, HStack, Icon, VStack } from "@chakra-ui/react";
import { LuArrowRight, LuBookmark } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { MeedButton } from "../../../components/MeedButton";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { Caption } from "@/components/package/Texts/Caption";
import { MeedInfoTip } from "../../../components/MeedInfoTip";
import { ReductionBar } from "./ReductionBar";
import { SelectActionCheckbox } from "./SelectActionCheckbox";
import { FOCUS_RING } from "../../../focusRing";
import {
  actionDescription,
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
  info,
}: {
  label: string;
  value: string;
  info?: React.ReactNode;
}) {
  return (
    <HStack justifyContent="space-between" alignItems="center" gap="s">
      <HStack gap="xs" alignItems="center">
        <Caption color="content.tertiary">{label}</Caption>
        {info}
      </HStack>
      <BodySmall
        color="content.secondary"
        fontWeight="semibold"
        textAlign="end"
      >
        {value}
      </BodySmall>
    </HStack>
  );
}

/**
 * One of the three hero cards at the top of the results overview.
 *
 * The card offers exactly two things: tick it to put the action in a report, or
 * open its full score breakdown. Report generation itself is a page-level
 * action — the prototype's per-card "generate" button competed with the
 * selection checkbox and left users unsure which one produced the report.
 *
 * The spacer above the reduction bar is load-bearing: names and descriptions
 * vary in length, and without it the bars and metadata rows step up and down
 * across the three cards.
 */
export function TopPickCard({
  action,
  index,
  t,
  isSelected,
  onToggleSelect,
  onOpenDetail,
}: {
  action: MeedRankedActionResult;
  index: MeedActionIndex;
  t: TFunction;
  isSelected: boolean;
  onToggleSelect: (actionId: string) => void;
  onOpenDetail: (action: MeedRankedActionResult) => void;
}) {
  const name = actionName(index, action.action_id, t);
  const description = actionDescription(index, action.action_id);
  const level = reductionLevel(index, action.action_id);

  return (
    <Card.Root
      h="full"
      borderWidth="1px"
      borderColor={isSelected ? "content.link" : "border.neutral"}
      bg={isSelected ? "background.neutral" : "base.light"}
      transition="border-color 0.15s, background-color 0.15s"
    >
      <Card.Body display="flex" flexDirection="column" gap="s" h="full">
        <HStack justifyContent="space-between" alignItems="flex-start" gap="s">
          <HStack gap="xs" alignItems="center">
            <Icon as={LuBookmark} boxSize="14px" color="content.link" />
            <Overline color="content.link">{t("top-pick-overline")}</Overline>
          </HStack>
          <SelectActionCheckbox
            checked={isSelected}
            onToggle={() => onToggleSelect(action.action_id)}
            ariaLabel={t("select-action", { name })}
          />
        </HStack>

        <TitleMedium color="content.primary" lineClamp={3}>
          {name}
        </TitleMedium>

        <BodyMedium color="content.secondary" lineClamp={3}>
          {description ?? t("no-description")}
        </BodyMedium>

        {/* Absorbs the height difference between cards so everything below
            this point lines up across the row. */}
        <Box flex="1" minH="s" />

        <VStack alignItems="stretch" gap="xs">
          <ReductionBar level={level} />
          <HStack justifyContent="space-between" alignItems="center" gap="s">
            <Caption color="content.tertiary">
              {t("card-reduction-potential")}
            </Caption>
            <BodySmall
              color={reductionLevelColor(level)}
              fontWeight="semibold"
              whiteSpace="nowrap"
            >
              {t(reductionLevelLabelKey(level))}
            </BodySmall>
          </HStack>
        </VStack>

        <Box borderTopWidth="1px" borderColor="border.overlay" pt="s" mt="xs">
          <VStack alignItems="stretch" gap="xs">
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
