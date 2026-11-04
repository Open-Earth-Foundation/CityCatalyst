"use client";
import React from "react";
import {
  Box,
  Card,
  GridItem,
  HStack,
  SimpleGrid,
  VStack,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { TitleMedium } from "@/components/package/Texts/Title";
import { BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedInfoTip } from "../../../components/MeedInfoTip";
import { MeedLevel } from "../../../components/MeedLevel";
import { MeedSectorIcon } from "../../../components/MeedSectorIcon";
import { MeedTextLink } from "../../../components/MeedTextLink";
import { MeedScoreComposition } from "../../../components/MeedScoreComposition";
import { SelectActionCheckbox } from "./SelectActionCheckbox";
import type { MeedScoreWeights } from "./rankingFacts";
import {
  LEGAL_CATEGORY_TONE,
  legalCategoryLabelKey,
  type MeedLegalStanding,
} from "../../regulations/legalStanding";
import {
  actionDescription,
  actionName,
  actionSectorTag,
  reductionLevel,
  reductionLevelLabelKey,
  reductionLevelTone,
  sectorLabel,
  timelineLabel,
  type MeedActionIndex,
} from "./actionCatalog";

/** A labelled fact with no tone: eyebrow, optional tip, then the value. */
function Fact({
  label,
  info,
  children,
}: {
  label: string;
  info?: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <HStack gap="xs" alignItems="center" mb="xs">
        <Overline color="content.tertiary">{label}</Overline>
        {info && <MeedInfoTip content={info} ariaLabel={info} />}
      </HStack>
      {children}
    </Box>
  );
}

/**
 * One of the three cards at the top of the results overview, in the order a
 * city officer reads: what it is, why it ranks here, and what delivering it
 * takes. Tick it to put the action in a report, or open its full detail.
 *
 * The spacer above the facts is load-bearing: names and descriptions vary in
 * length, and without it the facts grid steps up and down across the row.
 */
export function TopPickCard({
  action,
  index,
  weights,
  t,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  legal = null,
}: {
  action: MeedRankedActionResult;
  index: MeedActionIndex;
  weights: MeedScoreWeights | null;
  t: TFunction;
  isSelected?: boolean;
  /** Omit to render the card read-only (no report checkbox), as on the home screen. */
  onToggleSelect?: (actionId: string) => void;
  onOpenDetail: (action: MeedRankedActionResult) => void;
  /** Legal standing of this action, when the ranking carries one. */
  legal?: MeedLegalStanding | null;
}) {
  const name = actionName(index, action.action_id, t);
  const description = actionDescription(index, action.action_id);
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
      <Card.Body display="flex" flexDirection="column" gap="l" h="full" p="xl">
        <HStack justifyContent="space-between" alignItems="flex-start" gap="m">
          <VStack alignItems="flex-start" gap="xs" minW={0}>
            <HStack gap="xs" alignItems="center">
              <MeedSectorIcon
                sectorTag={actionSectorTag(index, action.action_id)}
                size="16px"
              />
              <Overline color="content.tertiary">
                {sectorLabel(index, action.action_id, t)}
              </Overline>
            </HStack>
            <TitleMedium as="h3" color="content.primary" lineClamp={3}>
              {name}
            </TitleMedium>
          </VStack>
          {onToggleSelect && (
            <SelectActionCheckbox
              checked={Boolean(isSelected)}
              onToggle={() => onToggleSelect(action.action_id)}
              ariaLabel={t("select-action", { name })}
            />
          )}
        </HStack>

        <VStack alignItems="flex-start" gap="xs">
          <Overline color="content.tertiary">{t("card-why-first")}</Overline>
          <MeedLevel tone={reductionLevelTone(level)}>
            {t("card-reduction-potential")} · {t(reductionLevelLabelKey(level))}
          </MeedLevel>
          {description && (
            <BodySmall color="content.secondary" lineClamp={2}>
              {description}
            </BodySmall>
          )}
        </VStack>

        <Box flex="1" />

        <SimpleGrid
          columns={{ base: 1, sm: 2 }}
          gap="m"
          pt="l"
          borderTopWidth="1px"
          borderColor="border.overlay"
        >
          <GridItem colSpan={{ base: 1, sm: 2 }}>
            <Fact
              label={t("detail-final-score")}
              info={t("column-composition-info")}
            >
              <VStack alignItems="stretch" gap="xs">
                <TitleMedium
                  as="p"
                  color="content.primary"
                  fontVariantNumeric="tabular-nums"
                >
                  {action.final_score.toFixed(2)}
                </TitleMedium>
                <MeedScoreComposition
                  action={action}
                  weights={weights}
                  variant="bar"
                  t={t}
                />
              </VStack>
            </Fact>
          </GridItem>
          {legal && (
            <MeedLevel
              label={t("card-legal")}
              info={t("column-legal-info")}
              tone={LEGAL_CATEGORY_TONE[legal.ownership]}
            >
              {t(legalCategoryLabelKey(legal.ownership))}
            </MeedLevel>
          )}
          <Fact label={t("card-timeline")} info={t("timeline-info")}>
            <BodySmall color="content.primary" fontWeight="semibold">
              {timelineLabel(index, action.action_id, t)}
            </BodySmall>
          </Fact>
        </SimpleGrid>

        <MeedTextLink
          onClick={() => onOpenDetail(action)}
          alignSelf="flex-start"
        >
          {t("view-details")}
        </MeedTextLink>
      </Card.Body>
    </Card.Root>
  );
}
