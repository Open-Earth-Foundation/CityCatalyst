"use client";
import React from "react";
import { Card, HStack, Icon, SimpleGrid, VStack } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowRight } from "react-icons/lu";
import type { TFunction } from "i18next";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { BodySmall } from "@/components/package/Texts/Body";
import { Caption } from "@/components/package/Texts/Caption";
import {
  MEED_CONTEXT_AREAS,
  contextSummary,
  type MeedContextFacts,
} from "./contextAreas";

/**
 * One context card. The card *is* the link or the button — the interactive
 * element carries the card's styling through `asChild`, so the focus ring
 * traces the whole card instead of a text fragment inside it.
 */
function ContextCard({
  icon,
  title,
  summary,
  cta,
  href,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  summary: string;
  cta: string;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <Card.Body display="flex" flexDirection="column" gap="xs" h="full" py="m">
      <Icon as={icon} boxSize="20px" color="content.link" />
      <LabelMedium color="content.primary">{title}</LabelMedium>
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
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "content.link",
        outlineOffset: "2px",
      }}
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
 * The compact "city context used in this ranking" grid on the results overview.
 * Five cards return the user to the wizard step that owns the data (and back to
 * this screen's context tab afterwards); the sixth jumps to the full ranking.
 */
export function ContextCardGrid({
  facts,
  t,
  hrefFor,
  onShowFullRanking,
}: {
  facts: MeedContextFacts;
  t: TFunction;
  /** Deep link back to the wizard step that owns an area's data. */
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
