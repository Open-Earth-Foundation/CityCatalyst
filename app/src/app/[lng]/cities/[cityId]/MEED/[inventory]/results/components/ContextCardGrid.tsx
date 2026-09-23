"use client";
import React from "react";
import {
  Box,
  Card,
  Grid,
  GridItem,
  HStack,
  Icon,
  Spinner,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { LabelMedium } from "@/components/package/Texts/Label";
import { BodyMedium } from "@/components/package/Texts/Body";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium, TitleLarge } from "@/components/package/Texts/Title";
import type { MeedPolicyBacking } from "./rankingFacts";
import { FOCUS_RING } from "../../../focusRing";
import {
  MEED_CONTEXT_AREAS,
  contextIndicator,
  contextSummary,
  type MeedContextArea,
  type MeedContextFacts,
  type MeedContextStat,
} from "./contextAreas";

/** What the card's action does. A card is either a link or a button, never both. */
export interface MeedContextCta {
  label: string;
  href?: string;
  onClick?: () => void;
  /** Shows a spinner in place of the arrow and disables the card. */
  isLoading?: boolean;
}

/**
 * One rationale card.
 *
 * The card *is* the link or the button — the interactive element carries the
 * card's styling through `asChild`, so the focus ring traces the whole card
 * instead of a text fragment inside it. Anything rendered inside (the stat,
 * the visual) is therefore static: no nested controls.
 *
 * Layout is the same on every card so the grid reads as one object: title,
 * one headline number with its label, the visual, one line of explanation,
 * and the action pinned to the bottom.
 */
function ContextCard({
  icon,
  title,
  indicator,
  visual,
  summary,
  cta,
}: {
  icon: React.ElementType;
  title: string;
  indicator: MeedContextStat | null;
  visual?: React.ReactNode;
  summary: string;
  cta: MeedContextCta;
}) {
  const indicatorColor =
    indicator?.tone === "positive"
      ? "sentiment.positiveDefault"
      : indicator?.tone === "negative"
        ? "sentiment.negativeDefault"
        : "content.primary";

  const body = (
    <Card.Body display="flex" flexDirection="column" gap="m" h="full" p="l">
      <HStack gap="s" alignItems="center">
        <Icon as={icon} boxSize="20px" color="content.link" />
        <TitleMedium color="content.primary">{title}</TitleMedium>
      </HStack>

      {indicator && (
        <VStack alignItems="stretch" gap="xs">
          <Overline color="content.tertiary">{indicator.label}</Overline>
          <HStack alignItems="baseline" gap="s" flexWrap="wrap">
            <HeadlineSmall
              color={indicatorColor}
              fontVariantNumeric="tabular-nums"
              lineHeight="1.1"
            >
              {indicator.value}
            </HeadlineSmall>
            {indicator.sub && (
              <BodyMedium color="content.secondary">{indicator.sub}</BodyMedium>
            )}
          </HStack>
        </VStack>
      )}

      {visual && <Box>{visual}</Box>}

      <BodyMedium color="content.secondary" flex="1">
        {summary}
      </BodyMedium>

      <HStack gap="xs" mt="xs">
        <LabelMedium color="content.link">{cta.label}</LabelMedium>
        {cta.isLoading ? (
          <Spinner size="xs" color="content.link" />
        ) : (
          <Icon as={LuArrowRight} boxSize="14px" color="content.link" />
        )}
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
      aria-busy={cta.isLoading || undefined}
    >
      {cta.href ? (
        <NextLink href={cta.href}>{body}</NextLink>
      ) : (
        <button type="button" onClick={cta.onClick} disabled={cta.isLoading}>
          {body}
        </button>
      )}
    </Card.Root>
  );
}

/**
 * "How the ranking works" — one card per input that shapes the ranking.
 *
 * These are the module's read-only areas: emissions, legal screening, policy
 * alignment, financial feasibility and city context are all computed by the
 * model rather than entered by the user. Each card is a summary with one
 * number and one small visual; the full content lives on the screen it links
 * to. The module home and the results page render the same grid, before and
 * after a ranking exists.
 *
 * Five cards on a three-column grid would leave a hole; the emissions card —
 * the input that drives most of the score — takes two columns instead.
 */
export function ContextCardGrid({
  facts,
  backing,
  t,
  hrefFor,
  areas = MEED_CONTEXT_AREAS,
  title,
  description,
  ctaFor,
  visualFor,
  indicatorFor,
}: {
  facts: MeedContextFacts;
  backing: MeedPolicyBacking;
  t: TFunction;
  hrefFor: (segment: string) => string;
  areas?: MeedContextArea[];
  /** Defaults to the results-page heading. */
  title?: string;
  description?: string;
  /** Overrides the default "view details" link for an area. */
  ctaFor?: (area: MeedContextArea) => MeedContextCta | undefined;
  /** A small static visual for an area (sector bar, funnel, meters). */
  visualFor?: (area: MeedContextArea) => React.ReactNode;
  /**
   * Overrides the headline number for an area. Areas the built-in facts do not
   * know (another track's inputs) would otherwise show none.
   */
  indicatorFor?: (area: MeedContextArea) => MeedContextStat | null | undefined;
}) {
  const defaultCta = (area: MeedContextArea): MeedContextCta => ({
    label: t("context-view-details"),
    href: hrefFor(area.segment),
  });

  return (
    <VStack alignItems="stretch" gap="m">
      <VStack alignItems="stretch" gap="xs">
        <TitleLarge color="content.primary">
          {title ?? t("context-title")}
        </TitleLarge>
        <BodyMedium color="content.secondary">
          {description ?? t("context-description")}
        </BodyMedium>
      </VStack>

      <Grid
        templateColumns={{
          base: "1fr",
          md: "repeat(2, 1fr)",
          lg: "repeat(3, 1fr)",
        }}
        gap="m"
      >
        {areas.map((area) => (
          <GridItem
            key={area.key}
            colSpan={{
              base: 1,
              md: (area.wide ?? area.key === "emissions") ? 2 : 1,
            }}
          >
            <ContextCard
              icon={area.icon}
              title={t(area.titleKey)}
              indicator={
                indicatorFor?.(area) ??
                contextIndicator(area, facts, backing, t)
              }
              visual={visualFor?.(area)}
              summary={contextSummary(area, facts, t)}
              cta={ctaFor?.(area) ?? defaultCta(area)}
            />
          </GridItem>
        ))}
      </Grid>
    </VStack>
  );
}
