"use client";
import React from "react";
import { Drawer, HStack, Icon, Portal, VStack } from "@chakra-ui/react";
import { LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { CloseButton } from "@/components/ui/close-button";
import { TitleLarge, TitleMedium } from "@/components/package/Texts/Title";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedScoreComposition } from "../../../components/MeedScoreComposition";
import { ActionFinanceSection } from "./ActionFinanceSection";
import { SelectActionCheckbox } from "./SelectActionCheckbox";
import { actionName, sectorLabel, type MeedActionIndex } from "./actionCatalog";
import type { MeedScoreWeights } from "./rankingFacts";
import {
  actionCoBenefits,
  actionTradeOffs,
  coBenefitLabel,
} from "./coBenefits";

/** Kept as an alias so existing callers keep compiling. */
export type ScoreWeights = MeedScoreWeights;

/**
 * One list of co-benefit keys under a heading. Renders nothing when empty, so
 * an action with no trade-offs shows no trade-offs section rather than an
 * empty one.
 */
function CoBenefitSection({
  title,
  keys,
  icon,
  color,
  t,
}: {
  title: string;
  keys: string[];
  icon: React.ElementType;
  color: string;
  t: TFunction;
}) {
  if (keys.length === 0) return null;

  return (
    <VStack alignItems="stretch" gap="s">
      <LabelLarge color="content.primary">{title}</LabelLarge>
      <VStack alignItems="stretch" gap="xs">
        {keys.map((key) => (
          <HStack key={key} gap="s" alignItems="center">
            <Icon as={icon} boxSize="16px" color={color} flexShrink={0} />
            <BodyMedium color="content.secondary">
              {coBenefitLabel(key, t)}
            </BodyMedium>
          </HStack>
        ))}
      </VStack>
    </VStack>
  );
}

/**
 * Right-hand drawer with everything about one ranked action: where it sits in
 * the ranking, what it is, why the model put it there, how its score is made
 * up, what it delivers beyond emissions, and how it could be financed. The footer lets the user add it
 * to the report from here, so reading and choosing happen in one place.
 *
 * Built on Chakra's Drawer for scroll lock, focus trap and Escape.
 */
export function DetailPanel({
  action,
  index,
  weights,
  t,
  onClose,
  rank,
  total,
  isSelected,
  onToggleSelect,
  finance,
  extraSections,
}: {
  action: MeedRankedActionResult;
  index: MeedActionIndex;
  weights: MeedScoreWeights;
  t: TFunction;
  onClose: () => void;
  /** Position in the ranking, when the caller knows it. */
  rank?: number;
  total?: number;
  isSelected?: boolean;
  /** Omit to hide the report control (e.g. when opened from the home screen). */
  onToggleSelect?: (actionId: string) => void;
  /** Omit to leave financing out of the drawer. */
  finance?: { cityId: string; lng: string; financeHref: string };
  /**
   * Track-specific sections rendered after the co-benefits — the adaptation
   * track adds risk cells credited, legal grade and funding pathway here.
   */
  extraSections?: React.ReactNode;
}) {
  const name = actionName(index, action.action_id, t);
  const description = index.get(action.action_id)?.description;
  const explanation =
    action.explanations?.en ?? Object.values(action.explanations ?? {})[0];
  const coBenefits = actionCoBenefits(action, index);
  const tradeOffs = actionTradeOffs(action, index);

  return (
    <Drawer.Root
      open
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      placement="end"
      size={{ base: "full", md: "md" }}
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header
              display="flex"
              flexDirection="column"
              alignItems="stretch"
              gap="xs"
              borderBottomWidth="1px"
              borderColor="border.overlay"
            >
              <HStack justifyContent="space-between" alignItems="center">
                <HStack gap="s" flexWrap="wrap">
                  {rank !== undefined && total !== undefined && (
                    <Overline color="content.link">
                      {t("detail-rank-of", { rank, total })}
                    </Overline>
                  )}
                  <Overline color="content.tertiary">
                    {sectorLabel(index, action.action_id, t)}
                  </Overline>
                </HStack>
                <Drawer.CloseTrigger asChild>
                  <CloseButton
                    size="sm"
                    color="content.secondary"
                    aria-label={t("detail-close-aria")}
                  />
                </Drawer.CloseTrigger>
              </HStack>
              <Drawer.Title asChild>
                <TitleMedium color="content.primary">{name}</TitleMedium>
              </Drawer.Title>
            </Drawer.Header>

            <Drawer.Body>
              <VStack alignItems="stretch" gap="l" py="s">
                <VStack alignItems="stretch" gap="s">
                  <LabelLarge color="content.primary">
                    {t("detail-description")}
                  </LabelLarge>
                  <BodyMedium color="content.secondary">
                    {description ?? t("no-description")}
                  </BodyMedium>
                </VStack>

                {explanation && (
                  <VStack alignItems="stretch" gap="s">
                    <LabelLarge color="content.primary">
                      {t("detail-why")}
                    </LabelLarge>
                    <BodyMedium color="content.secondary" fontStyle="italic">
                      {explanation}
                    </BodyMedium>
                  </VStack>
                )}

                <VStack alignItems="stretch" gap="m">
                  <HStack justifyContent="space-between" alignItems="baseline">
                    <LabelLarge color="content.primary">
                      {t("detail-score-breakdown")}
                    </LabelLarge>
                    <HStack gap="xs" alignItems="baseline">
                      <LabelMedium color="content.tertiary">
                        {t("detail-final-score")}
                      </LabelMedium>
                      <TitleLarge
                        color="content.primary"
                        fontVariantNumeric="tabular-nums"
                      >
                        {action.final_score.toFixed(2)}
                      </TitleLarge>
                    </HStack>
                  </HStack>
                  <MeedScoreComposition
                    action={action}
                    weights={weights}
                    variant="detailed"
                    t={t}
                  />
                </VStack>

                <CoBenefitSection
                  title={t("detail-cobenefits")}
                  keys={coBenefits}
                  icon={LuCircleCheck}
                  color="sentiment.positiveDefault"
                  t={t}
                />

                <CoBenefitSection
                  title={t("detail-tradeoffs")}
                  keys={tradeOffs}
                  icon={LuTriangleAlert}
                  color="sentiment.warningDefault"
                  t={t}
                />

                {finance && (
                  <ActionFinanceSection
                    actionId={action.action_id}
                    {...finance}
                  />
                )}
                {extraSections}
              </VStack>
            </Drawer.Body>

            {onToggleSelect && (
              <Drawer.Footer
                borderTopWidth="1px"
                borderColor="border.overlay"
                justifyContent="flex-start"
              >
                <HStack gap="s" alignItems="center">
                  <SelectActionCheckbox
                    checked={Boolean(isSelected)}
                    onToggle={() => onToggleSelect(action.action_id)}
                    ariaLabel={t("select-action", { name })}
                  />
                  <LabelMedium color="content.primary">
                    {t("detail-include-in-report")}
                  </LabelMedium>
                </HStack>
              </Drawer.Footer>
            )}
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
