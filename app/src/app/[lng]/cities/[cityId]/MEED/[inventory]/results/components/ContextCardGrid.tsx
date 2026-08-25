"use client";
import React from "react";
import { Card, HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleLarge } from "@/components/package/Texts/Title";
import type { MeedPolicyBacking } from "./rankingFacts";
import { FOCUS_RING } from "../../../focusRing";
import {
  MEED_CONTEXT_AREAS,
  contextIndicator,
  contextSummary,
  type MeedContextFacts,
  type MeedContextStat,
} from "./contextAreas";

/**
 * One rationale card.
 *
 * The card *is* the link or the button — the interactive element carries the
 * card's styling through `asChild`, so the focus ring traces the whole card
 * instead of a text fragment inside it.
 *
 * It leads with a number wherever the prioritizer reports one, because the
 * number is what tells the user whether this area is worth opening. Where
 * there is no number the card shows the area's status rather than a
 * plausible-looking zero.
 */
function ContextCard({
  icon,
  title,
  indicator,
  summary,
  cta,
  href,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  indicator: MeedContextStat | null;
  summary: string;
  cta: string;
  href?: string;
  onClick?: () => void;
}) {
  const indicatorColor =
    indicator?.tone === "positive"
      ? "sentiment.positiveDefault"
      : indicator?.tone === "negative"
        ? "sentiment.negativeDefault"
        : "content.primary";

  const body = (
    <Card.Body display="flex" flexDirection="column" gap="xs" h="full" py="m">
      <Icon as={icon} boxSize="20px" color="content.link" />

      <LabelMedium color="content.primary">{title}</LabelMedium>

      {indicator && (
        <VStack alignItems="stretch" gap="0" mt="xs">
          <Overline color="content.tertiary">{indicator.label}</Overline>
          <TitleLarge color={indicatorColor} fontVariantNumeric="tabular-nums">
            {indicator.value}
          </TitleLarge>
        </VStack>
      )}

      <Caption color="content.tertiary" flex="1">
        {summary}
      </Caption>

      <HStack gap="xs" mt="xs">
        <LabelMedium color="content.link">{cta}</LabelMedium>
        <Icon as={LuArrowRight} boxSize="14px" color="content.link" />
      </HStack>
    </Card.Body>
  );

  return (
    <Card.Root
      asChild
      h="full"
      textAlign="start"
      borderWidth="1px"
      borderColor="border.neutral"
      transition="border-color 0.15s, box-shadow 0.15s"
      _hover={{ borderColor: "content.link", boxShadow: "2dp" }}
      _focusVisible={FOCUS_RING}
    >
      {href ? (
        <NextLink href={href}>{body}</NextLink>
      ) : (
        <button type="button" onClick={onClick}>
          {body}
        </button>
      )}
    </Card.Root>
  );
}

/**
 * "Why these actions" — one card per input that shaped the ranking.
 *
 * These are the module's read-only areas: legal screening, policy alignment,
 * financial feasibility and city context are all computed by the model rather
 * than entered by the user, so they belong in the output next to the
 * recommendations they explain. Each card is a summary; the full content lives
 * on the screen it links to.
 */
export function ContextCardGrid({
  facts,
  backing,
  t,
  hrefFor,
  onShowFullRanking,
}: {
  facts: MeedContextFacts;
  backing: MeedPolicyBacking;
  t: TFunction;
  hrefFor: (segment: string) => string;
  onShowFullRanking: () => void;
}) {
  return (
    <VStack alignItems="stretch" gap="s">
      <VStack alignItems="stretch" gap="xs">
        <LabelLarge color="content.primary">{t("context-title")}</LabelLarge>
        <BodySmall color="content.secondary">
          {t("context-description")}
        </BodySmall>
      </VStack>

      <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap="m">
        {MEED_CONTEXT_AREAS.map((area) => (
          <ContextCard
            key={area.key}
            icon={area.icon}
            title={t(area.titleKey)}
            indicator={contextIndicator(area, facts, backing, t)}
            summary={contextSummary(area, facts, t)}
            cta={t("context-view-details")}
            href={area.segment ? hrefFor(area.segment) : undefined}
            onClick={area.segment ? undefined : onShowFullRanking}
          />
        ))}
      </SimpleGrid>
    </VStack>
  );
}
