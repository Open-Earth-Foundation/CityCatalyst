"use client";
import React from "react";
import { Card, Drawer, HStack, Icon, Portal, VStack } from "@chakra-ui/react";
import { LuCircleCheck, LuTriangleAlert } from "react-icons/lu";
import type { TFunction } from "i18next";
import type { MeedRankedActionResult } from "@/util/types/meed";
import { CloseButton } from "@/components/ui/close-button";
import { HeadlineLarge } from "@/components/package/Texts/Headline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { BodyMedium } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedScoreComposition } from "../../../components/MeedScoreComposition";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import { ActionFinanceSection } from "./ActionFinanceSection";
import { SelectActionCheckbox } from "./SelectActionCheckbox";
import { actionName, sectorLabel, type MeedActionIndex } from "./actionCatalog";
import type { MeedScoreWeights } from "./rankingFacts";
import {
  actionCoBenefitScores,
  actionTradeOffScores,
  coBenefitLabel,
  type MeedCoBenefitScore,
} from "./coBenefits";
import { formatMagnitude } from "./CoBenefitStrip";

/** Kept as an alias so existing callers keep compiling. */
export type ScoreWeights = MeedScoreWeights;

/**
 * One contained block of the drawer: a card with a title row (title, optional
 * tag, optional trailing control) and its content. Every section of the
 * drawer — the built-in ones and the track-specific `extraSections` — uses
 * it, so the drawer reads as a stack of cards rather than a column of text.
 */
export function DrawerSection({
  title,
  tag,
  trailing,
  children,
}: {
  title: string;
  tag?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card.Root borderColor="border.overlay">
      <Card.Body p="l">
        <VStack alignItems="stretch" gap="l">
          <HStack
            justifyContent="space-between"
            alignItems="center"
            gap="s"
            flexWrap="wrap"
          >
            <HStack gap="s" alignItems="center" flexWrap="wrap">
              <LabelLarge color="content.primary">{title}</LabelLarge>
              {tag}
            </HStack>
            {trailing}
          </HStack>
          {children}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}

/**
 * One list of co-benefits under a heading, each with its scored magnitude
 * when the catalog carries one. Renders nothing when empty, so an action with
 * no trade-offs shows no trade-offs section rather than an empty one.
 */
function CoBenefitSection({
  title,
  items,
  icon,
  color,
  t,
}: {
  title: string;
  items: MeedCoBenefitScore[];
  icon: React.ElementType;
  color: string;
  t: TFunction;
}) {
  if (items.length === 0) return null;

  return (
    <DrawerSection title={title}>
      <VStack alignItems="stretch" gap="s">
        {items.map(({ key, value }) => (
          <HStack
            key={key}
            gap="s"
            alignItems="center"
            justifyContent="space-between"
          >
            <HStack gap="s" alignItems="center" minW={0}>
              <Icon as={icon} boxSize="16px" color={color} flexShrink={0} />
              <BodyMedium color="content.primary">
                {coBenefitLabel(key, t)}
              </BodyMedium>
            </HStack>
            {value !== null && (
              <MeedStatusTag tone={value < 0 ? "negative" : "positive"}>
                {formatMagnitude(value)}
              </MeedStatusTag>
            )}
          </HStack>
        ))}
      </VStack>
    </DrawerSection>
  );
}

/**
 * Right-hand drawer with everything about one ranked action: where it sits in
 * the ranking, its score and how it is made up, why the model put it there,
 * what it is, what it delivers beyond emissions, and how it could be financed.
 * The footer lets the user add it to the report from here, so reading and
 * choosing happen in one place.
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
  size = "md",
  lng,
  showScore = true,
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
   * Wrap each in `DrawerSection` so they match the built-in cards.
   */
  extraSections?: React.ReactNode;
  /** Drawer width on desktop; `lg` gives text-heavy sections room to breathe. */
  size?: "md" | "lg";
  /** Picks the narrative in the reader's language when the ranking carries several. */
  lng?: string;
  /** False for an action that was not scored (no score to break down). */
  showScore?: boolean;
}) {
  const name = actionName(index, action.action_id, t);
  const description = index.get(action.action_id)?.description;
  const explanations = action.explanations ?? {};
  const explanation =
    (lng ? explanations[lng] : undefined) ??
    explanations.en ??
    Object.values(explanations)[0];
  const coBenefits = actionCoBenefitScores(action, index);
  const tradeOffs = actionTradeOffScores(action, index);

  return (
    <Drawer.Root
      open
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      placement="end"
      size={{ base: "full", md: size }}
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content bg="background.backgroundLight">
            <Drawer.Header
              display="flex"
              flexDirection="column"
              alignItems="stretch"
              gap="xs"
              bg="base.light"
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
              <VStack alignItems="stretch" gap="xl" py="l">
                {showScore && (
                  <DrawerSection
                    title={t("detail-score-breakdown")}
                    trailing={
                      <HStack gap="s" alignItems="baseline">
                        <LabelMedium color="content.tertiary">
                          {t("detail-final-score")}
                        </LabelMedium>
                        <HeadlineLarge
                          color="content.primary"
                          fontVariantNumeric="tabular-nums"
                          lineHeight="1"
                        >
                          {action.final_score.toFixed(2)}
                        </HeadlineLarge>
                      </HStack>
                    }
                  >
                    <MeedScoreComposition
                      action={action}
                      weights={weights}
                      variant="detailed"
                      t={t}
                    />
                  </DrawerSection>
                )}

                {explanation && (
                  <DrawerSection title={t("detail-why")}>
                    <BodyMedium color="content.secondary">
                      {explanation}
                    </BodyMedium>
                  </DrawerSection>
                )}

                <DrawerSection title={t("detail-description")}>
                  <BodyMedium color="content.secondary">
                    {description ?? t("no-description")}
                  </BodyMedium>
                </DrawerSection>

                <CoBenefitSection
                  title={t("detail-cobenefits")}
                  items={coBenefits}
                  icon={LuCircleCheck}
                  color="sentiment.positiveDefault"
                  t={t}
                />

                <CoBenefitSection
                  title={t("detail-tradeoffs")}
                  items={tradeOffs}
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
                bg="base.light"
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
